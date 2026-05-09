create table if not exists public.license_events (
  id uuid primary key default uuid_generate_v4(),
  license_id uuid references public.licenses(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_license_events_license_id on public.license_events(license_id);
create index if not exists idx_license_events_event_type on public.license_events(event_type);
