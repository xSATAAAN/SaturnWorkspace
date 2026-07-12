create index if not exists pending_subscription_grants_resulting_subscription_idx
  on public.pending_subscription_grants(resulting_subscription_id)
  where resulting_subscription_id is not null;
