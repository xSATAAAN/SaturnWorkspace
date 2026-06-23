-- Pricing remains visible even while no payment provider is configured.
-- Purchasing stays disabled until a provider and provider price are explicitly configured.
update public.commercial_plans
set
  active = true,
  public_visible = true,
  purchasable = false,
  provider = null,
  provider_price_id = null,
  config_status = 'provider_missing',
  updated_at = now()
where (plan_id, version) in (('weekly', 1), ('monthly', 1), ('annual', 1))
  and price_minor = case plan_id
    when 'weekly' then 1000
    when 'monthly' then 3500
    when 'annual' then 35000
  end
  and original_price_minor = case plan_id
    when 'weekly' then 1500
    when 'monthly' then 5000
    when 'annual' then 60000
  end;

do $$
declare
  configured_count integer;
begin
  select count(*) into configured_count
  from public.commercial_plans
  where active and public_visible and plan_id in ('weekly', 'monthly', 'annual');

  if configured_count <> 3 then
    raise exception 'phase_g_plan_catalog_contract_mismatch';
  end if;
end $$;
