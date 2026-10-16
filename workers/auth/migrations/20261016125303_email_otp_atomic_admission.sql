begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.account_email_verifications
  add column admission_version smallint not null default 1 check (admission_version = 1);

create index account_email_verifications_recipient_admission_idx
  on public.account_email_verifications (lower(btrim(email)), last_sent_at desc);

create table public.email_otp_admission (
  recipient_digest text primary key check (recipient_digest ~ '^[0-9a-f]{64}$'),
  admissions integer not null check (admissions between 0 and 6),
  last_admitted_at timestamptz not null,
  expires_at timestamptz not null,
  challenge_id uuid,
  challenge_hash text
);
create index email_otp_admission_expiry_idx on public.email_otp_admission (expires_at);
alter table public.email_otp_admission enable row level security;
revoke all on public.email_otp_admission from public, anon, authenticated;
grant select, insert, update, delete on public.email_otp_admission to service_role;

create function public.guard_email_otp_admission()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email text := lower(btrim(new.email));
  v_digest text;
  v_budget public.email_otp_admission%rowtype;
  v_previous public.account_email_verifications%rowtype;
  v_count integer;
  v_last timestamptz;
  v_expiry timestamptz;
  v_delivery jsonb;
  v_sent timestamptz;
  v_wait integer;
begin
  if tg_op = 'UPDATE' then
    if new.email is distinct from old.email or new.purpose is distinct from old.purpose then
      raise exception using message = 'email_verification_admission_conflict';
    end if;
    if new.code_hash is not distinct from old.code_hash
        and new.resend_count is not distinct from old.resend_count then return new; end if;
    if old.status <> 'pending' then
      raise exception using message = 'email_verification_admission_conflict';
    end if;
  end if;
  if new.status <> 'pending' or new.admission_version <> 1
      or new.purpose not in ('registration', 'email_verification')
      or v_email = '' or length(v_email) > 320 or new.code_hash = ''
      or new.expires_at <= v_now or new.expires_at > v_now + interval '60 minutes 5 seconds' then
    raise exception using message = 'email_verification_admission_conflict';
  end if;
  v_digest := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
  insert into public.email_otp_admission values (v_digest, 0, '-infinity', '-infinity', null, null)
    on conflict (recipient_digest) do nothing;
  select * into strict v_budget from public.email_otp_admission
    where recipient_digest = v_digest for update;

  if v_budget.expires_at <= v_now then
    select least(6, coalesce(sum(greatest(1, resend_count + 1)), 0))::integer,
        max(last_sent_at), max(expires_at)
      into v_count, v_last, v_expiry
      from public.account_email_verifications
      where lower(btrim(email)) = v_email and expires_at > v_now
        and purpose in ('registration', 'email_verification');
    v_budget.admissions := v_count;
    v_budget.last_admitted_at := coalesce(v_last, '-infinity');
    v_budget.expires_at := least(coalesce(v_expiry, '-infinity'), v_now + interval '60 minutes');
    select * into v_previous from public.account_email_verifications
      where lower(btrim(email)) = v_email and expires_at > v_now
        and purpose in ('registration', 'email_verification')
      order by last_sent_at desc, id limit 1;
    v_budget.challenge_id := v_previous.id;
    v_budget.challenge_hash := v_previous.code_hash;
  end if;

  if v_budget.expires_at > v_now then
    v_wait := greatest(0, ceil(extract(epoch from v_budget.last_admitted_at + interval '45 seconds' - v_now)))::integer;
    if v_budget.admissions >= 6 then
      v_wait := greatest(v_wait, ceil(extract(epoch from v_budget.expires_at - v_now))::integer);
    end if;
    if v_wait > 0 then
      raise exception using message = 'email_verification_admission_rate_limited', detail = least(3600, v_wait)::text;
    end if;
    select * into v_previous from public.account_email_verifications
      where id = v_budget.challenge_id and code_hash = v_budget.challenge_hash;
    if found and v_previous.expires_at > v_now then
      v_delivery := v_previous.metadata -> 'delivery';
      if v_previous.metadata ->> 'transport' = 'provider_pending'
          or v_delivery ->> 'transport' = 'email_operations' then
        if coalesce(v_delivery ->> 'status', '') not in ('failed', 'suppressed', 'cancelled', 'expired', 'sent', 'delivered') then
          raise exception using message = 'email_verification_admission_conflict';
        end if;
        if v_delivery ->> 'status' in ('sent', 'delivered') then
          begin
            v_sent := (v_delivery ->> 'sent_at')::timestamptz;
          exception when others then
            raise exception using message = 'email_verification_admission_conflict';
          end;
          if v_sent is null then raise exception using message = 'email_verification_admission_conflict'; end if;
          v_wait := greatest(0, ceil(extract(epoch from v_sent + interval '45 seconds' - v_now)))::integer;
          if v_wait > 0 then
            raise exception using message = 'email_verification_admission_rate_limited', detail = least(3600, v_wait)::text;
          end if;
        end if;
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.account_email_verifications where lower(btrim(email)) = v_email
      and purpose = new.purpose and status = 'pending' and expires_at > v_now
  ) then raise exception using message = 'email_verification_admission_conflict'; end if;

  update public.email_otp_admission set admissions = v_budget.admissions + 1,
    last_admitted_at = v_now, expires_at = greatest(v_budget.expires_at, new.expires_at),
    challenge_id = new.id, challenge_hash = new.code_hash where recipient_digest = v_digest;
  new.email := v_email;
  new.last_sent_at := v_now;
  delete from public.email_otp_admission where recipient_digest in (
    select recipient_digest from public.email_otp_admission
      where expires_at < v_now and recipient_digest <> v_digest
      order by expires_at limit 64 for update skip locked
  );
  return new;
end;
$$;
revoke all on function public.guard_email_otp_admission() from public, anon, authenticated;
grant execute on function public.guard_email_otp_admission() to service_role;
create trigger account_email_verifications_admission
before insert or update of code_hash, resend_count, email, purpose on public.account_email_verifications
for each row execute function public.guard_email_otp_admission();

commit;
