-- Add covering indexes for production foreign keys reported by the Supabase advisor.
-- This migration is additive and does not modify application rows.

create index if not exists account_email_verification_audit_verification_id_idx
  on public.account_email_verification_audit (verification_id);

create index if not exists commercial_orders_plan_version_idx
  on public.commercial_orders (plan_id, plan_version);

create index if not exists crash_logs_license_id_idx
  on public.crash_logs (license_id);

create index if not exists payment_provider_events_order_id_idx
  on public.payment_provider_events (order_id);

create index if not exists payment_receipts_order_id_idx
  on public.payment_receipts (order_id);

create index if not exists purchase_events_license_id_idx
  on public.purchase_events (license_id);

create index if not exists subscription_integrity_events_subscription_id_idx
  on public.subscription_integrity_events (subscription_id);

create index if not exists subscription_recovery_ledger_subscription_id_idx
  on public.subscription_recovery_ledger (subscription_id);

create index if not exists tamper_alerts_license_id_idx
  on public.tamper_alerts (license_id);
