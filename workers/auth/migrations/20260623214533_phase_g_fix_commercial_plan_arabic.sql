update public.commercial_plans
set localized_content = jsonb_set(
  localized_content,
  '{ar,name}',
  to_jsonb(case plan_id
    when 'weekly' then 'أسبوعي'
    when 'monthly' then 'شهري'
    when 'annual' then 'سنوي'
    else localized_content #>> '{ar,name}'
  end),
  true
), updated_at = now()
where plan_id in ('weekly', 'monthly', 'annual')
  and (localized_content #>> '{ar,name}') in ('Ø£Ø³Ø¨ÙˆØ¹ÙŠ', 'Ø´Ù‡Ø±ÙŠ', 'Ø³Ù†ÙˆÙŠ');
