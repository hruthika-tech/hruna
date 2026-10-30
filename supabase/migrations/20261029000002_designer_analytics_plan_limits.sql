-- Plan limits for designer analytics. DEPENDS ON 20261028000001_designer_analytics.sql (which
-- creates designer_analytics) and 20261029000001_designer_subscription_plans.sql (plans). Apply
-- all three together, in order.
--
-- The original function becomes an internal one (no longer callable by browser sessions); a new
-- public.designer_analytics(p_start, p_end) with the same signature checks the caller's plan first:
--   * the selected period may not exceed the plan's analytics_max_days, and may not reach further
--     back than that many days before today (IST) — Free: 7 days; Plus and Pro: 90 days;
--   * plans without analytics_comparison (Free) get no previous-period figures, since those would
--     reveal history beyond the plan's window.
-- While plans are switched off (designer_plans_enforced() = false) nothing is restricted.

alter function public.designer_analytics(date, date) rename to designer_analytics_unrestricted;
revoke execute on function public.designer_analytics_unrestricted(date, date) from public, anon, authenticated;

create or replace function public.designer_analytics(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_designer uuid := public.current_designer_id();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_plan public.subscription_plans;
  v_result jsonb;
begin
  if v_designer is null or public.is_admin() then
    raise exception 'analytics: a designer profile is required' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'analytics: invalid date range' using errcode = '22023';
  end if;

  if public.designer_plans_enforced() then
    v_plan := public.designer_effective_plan(v_designer);
    if v_plan.analytics_max_days is not null
       and (p_end - p_start + 1 > v_plan.analytics_max_days or p_start < v_today - (v_plan.analytics_max_days - 1)) then
      raise exception 'plan_limit:analytics_days:%:%', v_plan.analytics_max_days, v_plan.plan_key using errcode = 'P0001';
    end if;
  end if;

  v_result := public.designer_analytics_unrestricted(p_start, p_end);

  if public.designer_plans_enforced() and not v_plan.analytics_comparison then
    v_result := v_result
      || jsonb_build_object('previous', null, 'comparison_available', false)
      || jsonb_build_object('unique_visitors', jsonb_build_object('current', v_result -> 'unique_visitors' -> 'current', 'previous', null));
  else
    v_result := v_result || jsonb_build_object('comparison_available', true);
  end if;
  return v_result;
end;
$$;

revoke execute on function public.designer_analytics(date, date) from public, anon;
grant execute on function public.designer_analytics(date, date) to authenticated;
