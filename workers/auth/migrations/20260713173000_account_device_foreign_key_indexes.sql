create index if not exists account_device_change_current_binding_idx
  on public.account_device_change_requests(current_binding_id)
  where current_binding_id is not null;

create index if not exists account_device_change_resulting_binding_idx
  on public.account_device_change_requests(resulting_binding_id)
  where resulting_binding_id is not null;

create index if not exists account_device_events_binding_idx
  on public.account_device_events(binding_id)
  where binding_id is not null;

create index if not exists account_device_events_change_request_idx
  on public.account_device_events(change_request_id)
  where change_request_id is not null;
