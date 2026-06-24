revoke delete, truncate, references, trigger on table public.account_deletion_requests from service_role;
grant select, insert, update on table public.account_deletion_requests to service_role;
