-- Phase F least-privilege follow-up. The Supabase default table grants include
-- privileges that the admin service does not need for these append-only records.

revoke all on table public.admin_operation_requests from service_role;
revoke all on table public.subscription_recovery_ledger from service_role;
revoke all on table public.admin_crash_group_state from service_role;

grant select, insert, update on table public.admin_operation_requests to service_role;
grant select, insert, update on table public.subscription_recovery_ledger to service_role;
grant select, insert, update on table public.admin_crash_group_state to service_role;
