-- Harden licenses table for webhook idempotency and verification performance.

alter table public.licenses
  add column if not exists provider text,
  add column if not exists order_id text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists last_verify_at timestamptz;

create index if not exists idx_licenses_license_key on public.licenses(license_key);
create index if not exists idx_licenses_hwid on public.licenses(hwid);
create index if not exists idx_licenses_status on public.licenses(status);
create index if not exists idx_licenses_expiry_date on public.licenses(expiry_date);
create index if not exists idx_licenses_order on public.licenses(provider, order_id);

create unique index if not exists uq_licenses_provider_order
  on public.licenses(provider, order_id)
  where provider is not null and order_id is not null;
