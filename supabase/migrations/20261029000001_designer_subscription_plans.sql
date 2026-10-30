-- Designer subscription plans: Free (₹0), Designer Plus (₹199), Designer Pro (₹299), with usage
-- limits stored on the plan rows themselves and enforced in the database, plus a one-time 14-day
-- Designer Pro trial that needs no payment.
--
-- Builds on the existing subscription tables (subscription_plans / user_subscriptions / payments /
-- payment_settings, migration 20260829180011) — no parallel billing system:
--   * subscription_plans gets a stable plan_key and the limit columns. NULL limit = unlimited.
--   * The old single designer plan ("Designer Monthly") is kept (payments/subscriptions reference it)
--     but retired (is_active = false). A subscription still running on it counts as Designer Pro
--     until its end date, so nobody who paid loses anything.
--   * user_subscriptions gets is_trial. A trial is an ordinary 'active' row on the Pro plan with a
--     14-day end_date — no payment row, nothing to charge, and checkout is one-time Razorpay orders
--     (there is no recurring billing anywhere), so expiry can never trigger a charge.
--   * Expiry is evaluated, not scheduled: a row whose end_date has passed simply stops counting, so
--     the designer is on Free from that instant — no cron, and nothing is deleted.
--
-- Limits are ENFORCED only while plans are switched on — the existing admin switches
-- payment_settings.payment_system_enabled AND designer_subscriptions_enabled. Until then (today's
-- state) no designer is restricted, so applying this migration changes nothing for live designers.
--
-- Usage = rows that exist: every dress, collection and previous creation is publicly listed (the
-- schema has no draft/published state — dresses.available only labels a listed dress "not
-- available for purchase"). Proposals count per calendar month in India Standard Time.
-- Every limit check takes a per-designer transaction advisory lock, so simultaneous requests are
-- serialised and can't overshoot a limit.
--
-- Customers stay free: nothing here applies to customers (and the app no longer gates or charges
-- customers at all — see lib/subscription-access.ts).

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
alter table public.subscription_plans
  add column plan_key text,
  add column tier_rank int,
  add column max_dresses int check (max_dresses is null or max_dresses >= 0),
  add column max_collections int check (max_collections is null or max_collections >= 0),
  add column max_previous_creations int check (max_previous_creations is null or max_previous_creations >= 0),
  add column max_highlights int check (max_highlights is null or max_highlights >= 0),
  add column max_meet_entries int check (max_meet_entries is null or max_meet_entries >= 0),
  add column max_proposals_per_month int check (max_proposals_per_month is null or max_proposals_per_month >= 0),
  add column analytics_max_days int check (analytics_max_days is null or analytics_max_days between 1 and 366),
  add column analytics_comparison boolean not null default true;

alter table public.subscription_plans
  add constraint subscription_plans_plan_key_known
    check (plan_key is null or plan_key in ('designer_free', 'designer_plus', 'designer_pro')),
  add constraint subscription_plans_plan_key_designer
    check (plan_key is null or role = 'designer'),
  add constraint subscription_plans_free_is_free
    check (plan_key is distinct from 'designer_free' or price = 0);

create unique index subscription_plans_plan_key_uq on public.subscription_plans (plan_key) where plan_key is not null;

comment on column public.subscription_plans.plan_key is 'Stable identifier for designer plans (designer_free / designer_plus / designer_pro). NULL = legacy plan.';
comment on column public.subscription_plans.max_dresses is 'Most dresses (all are public listings). NULL = unlimited.';

-- Retire the single legacy designer plan; existing rows that reference it stay valid.
update public.subscription_plans set is_active = false, updated_at = now() where role = 'designer' and plan_key is null;

insert into public.subscription_plans
  (role, plan_key, tier_rank, name, price, currency, billing_interval, description, features,
   max_dresses, max_collections, max_previous_creations, max_highlights, max_meet_entries,
   max_proposals_per_month, analytics_max_days, analytics_comparison, is_active)
values
  ('designer', 'designer_free', 0, 'Free', 0, 'INR', 'monthly',
   'Everything you need to run your studio on HRUNA.',
   array['5 dress listings', '3 collections', '10 previous creations', '5 proposals per month', '7-day analytics',
         'Messaging, projects, reviews and notifications'],
   5, 3, 10, 3, 2, 5, 7, false, true),
  ('designer', 'designer_plus', 1, 'Designer Plus', 199, 'INR', 'monthly',
   'More listings, more proposals and longer analytics.',
   array['20 dress listings', '10 collections', '50 previous creations', '25 proposals per month', '90-day analytics',
         'Messaging, projects, reviews and notifications'],
   20, 10, 50, 3, 2, 25, 90, true, true),
  ('designer', 'designer_pro', 2, 'Designer Pro', 299, 'INR', 'monthly',
   'Unlimited listings and proposals for busy studios.',
   array['Unlimited dress listings', 'Unlimited collections', 'Unlimited previous creations', 'Unlimited proposals',
         '90-day analytics', 'Messaging, projects, reviews and notifications'],
   null, null, null, 3, 2, null, 90, true, true);

-- ---------------------------------------------------------------------------
-- Trials
-- ---------------------------------------------------------------------------
alter table public.user_subscriptions add column is_trial boolean not null default false;
alter table public.user_subscriptions
  add constraint user_subscriptions_trial_has_end check (not is_trial or end_date is not null);
-- One trial per account per role, ever — race-proof by construction.
create unique index user_subscriptions_one_trial_per_user on public.user_subscriptions (user_id, role) where is_trial;

-- ---------------------------------------------------------------------------
-- Plan resolution
-- ---------------------------------------------------------------------------
create or replace function public.designer_plans_enforced()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select payment_system_enabled and designer_subscriptions_enabled from public.payment_settings where id), false);
$$;

-- The plan a designer is on right now: their best active, unexpired subscription (paid or trial),
-- otherwise Free. A legacy-plan subscription counts as Pro until it ends.
create or replace function public.designer_effective_plan(p_designer_id uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_plan public.subscription_plans;
begin
  select case when sp.plan_key is not null then sp.id
              else (select id from public.subscription_plans where plan_key = 'designer_pro') end
    into v_plan_id
    from public.designer_profiles d
    join public.user_subscriptions s on s.user_id = d.user_id and s.role = 'designer' and s.status = 'active'
                                     and (s.end_date is null or s.end_date > now())
    join public.subscription_plans sp on sp.id = s.plan_id and sp.role = 'designer'
   where d.id = p_designer_id
   order by coalesce(sp.tier_rank, 2) desc  -- a legacy plan ranks as Pro
   limit 1;

  if v_plan_id is null then
    select id into v_plan_id from public.subscription_plans where plan_key = 'designer_free';
  end if;
  select * into v_plan from public.subscription_plans where id = v_plan_id;
  return v_plan;
end;
$$;

revoke execute on function public.designer_effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.designer_plans_enforced() from public, anon;
grant execute on function public.designer_plans_enforced() to authenticated;

-- Start of the current calendar month in India Standard Time, as a timestamp.
create or replace function public.ist_month_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select date_trunc('month', p_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
$$;

-- The signed-in designer's own plan, limits, usage and trial status (for the app; never another
-- designer's). Read-only.
create or replace function public.my_designer_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_designer uuid := public.current_designer_id();
  v_user uuid := auth.uid();
  v_plan public.subscription_plans;
  v_sub public.user_subscriptions;
begin
  if v_designer is null or public.is_admin() then
    raise exception 'plans: a designer profile is required' using errcode = '42501';
  end if;
  v_plan := public.designer_effective_plan(v_designer);
  select s.* into v_sub
    from public.user_subscriptions s
   where s.user_id = v_user and s.role = 'designer' and s.status = 'active' and (s.end_date is null or s.end_date > now())
   order by s.created_at desc limit 1;

  return jsonb_build_object(
    'enforced', public.designer_plans_enforced(),
    'plan_key', v_plan.plan_key,
    'is_trial', coalesce(v_sub.is_trial, false),
    'ends_at', v_sub.end_date,
    'trial_used', exists (select 1 from public.user_subscriptions where user_id = v_user and role = 'designer' and is_trial),
    'approved', public.is_approved_designer(),
    'limits', jsonb_build_object(
      'dresses', v_plan.max_dresses,
      'collections', v_plan.max_collections,
      'previous_creations', v_plan.max_previous_creations,
      'highlights', v_plan.max_highlights,
      'meet_entries', v_plan.max_meet_entries,
      'proposals_per_month', v_plan.max_proposals_per_month,
      'analytics_max_days', v_plan.analytics_max_days,
      'analytics_comparison', v_plan.analytics_comparison),
    'usage', jsonb_build_object(
      'dresses', (select count(*) from public.dresses where designer_id = v_designer),
      'collections', (select count(*) from public.collections where designer_id = v_designer),
      'previous_creations', (select count(*) from public.previous_creations where designer_id = v_designer),
      'highlights', (select count(*) from public.studio_highlights where designer_id = v_designer),
      'meet_entries', (select count(*) from public.meet_the_designer_entries where designer_id = v_designer),
      'proposals_this_month', (select count(*) from public.proposals where designer_id = v_designer and created_at >= public.ist_month_start())),
    'month_start', public.ist_month_start()
  );
end;
$$;

revoke execute on function public.my_designer_entitlements() from public, anon;
grant execute on function public.my_designer_entitlements() to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement (BEFORE INSERT). Sessions without a signed-in user (seed, maintenance) are exempt,
-- like the other workflow guards. Raises P0001 'plan_limit:<resource>:<limit>:<plan_key>'.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_designer_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans;
  v_limit int;
  v_count int;
  v_resource text;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Serialise every usage-changing insert for this designer (listing races, double submissions).
  perform pg_advisory_xact_lock(hashtextextended('hruna_designer_usage:' || new.designer_id::text, 0));

  -- One proposal per designer per request — always, plan or no plan. (Nested IF: PL/pgSQL would
  -- otherwise evaluate new.request_id on tables that have no such column.)
  if tg_table_name = 'proposals' then
    if exists (select 1 from public.proposals p where p.request_id = new.request_id and p.designer_id = new.designer_id) then
      raise exception 'duplicate_proposal: you have already sent a proposal for this request' using errcode = 'P0001';
    end if;
  end if;

  if not public.designer_plans_enforced() then
    return new;
  end if;
  v_plan := public.designer_effective_plan(new.designer_id);

  case tg_table_name
    when 'dresses' then
      v_resource := 'dresses'; v_limit := v_plan.max_dresses;
      select count(*) into v_count from public.dresses where designer_id = new.designer_id;
    when 'collections' then
      v_resource := 'collections'; v_limit := v_plan.max_collections;
      select count(*) into v_count from public.collections where designer_id = new.designer_id;
    when 'previous_creations' then
      v_resource := 'previous_creations'; v_limit := v_plan.max_previous_creations;
      select count(*) into v_count from public.previous_creations where designer_id = new.designer_id;
    when 'studio_highlights' then
      v_resource := 'highlights'; v_limit := v_plan.max_highlights;
      select count(*) into v_count from public.studio_highlights where designer_id = new.designer_id;
    when 'meet_the_designer_entries' then
      v_resource := 'meet_entries'; v_limit := v_plan.max_meet_entries;
      select count(*) into v_count from public.meet_the_designer_entries where designer_id = new.designer_id;
    when 'proposals' then
      v_resource := 'proposals_per_month'; v_limit := v_plan.max_proposals_per_month;
      select count(*) into v_count from public.proposals
       where designer_id = new.designer_id and created_at >= public.ist_month_start();
    else
      return new;
  end case;

  if v_limit is not null and v_count >= v_limit then
    raise exception 'plan_limit:%:%:%', v_resource, v_limit, v_plan.plan_key using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger dresses_plan_limit before insert on public.dresses
  for each row execute function public.enforce_designer_plan_limits();
create trigger collections_plan_limit before insert on public.collections
  for each row execute function public.enforce_designer_plan_limits();
create trigger previous_creations_plan_limit before insert on public.previous_creations
  for each row execute function public.enforce_designer_plan_limits();
create trigger studio_highlights_plan_limit before insert on public.studio_highlights
  for each row execute function public.enforce_designer_plan_limits();
create trigger meet_entries_plan_limit before insert on public.meet_the_designer_entries
  for each row execute function public.enforce_designer_plan_limits();
create trigger proposals_plan_limit before insert on public.proposals
  for each row execute function public.enforce_designer_plan_limits();

-- ---------------------------------------------------------------------------
-- 14-day Designer Pro trial — no payment details, no payment row, no charge on expiry.
-- Eligible: an approved designer account (not admin) that has never had a trial and has no active
-- paid plan, while plans are switched on.
-- ---------------------------------------------------------------------------
create or replace function public.start_designer_pro_trial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_designer uuid := public.current_designer_id();
  v_pro uuid;
  v_end timestamptz := now() + interval '14 days';
begin
  if v_user is null or v_designer is null or public.is_admin() then
    raise exception 'trial: a designer account is required' using errcode = '42501';
  end if;
  if not public.is_approved_designer() then
    raise exception 'trial_not_eligible: your studio must be approved first' using errcode = 'P0001';
  end if;
  if not public.designer_plans_enforced() then
    raise exception 'trial_not_eligible: plans are not available yet' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hruna_designer_trial:' || v_user::text, 0));

  if exists (select 1 from public.user_subscriptions where user_id = v_user and role = 'designer' and is_trial) then
    raise exception 'trial_not_eligible: the free trial has already been used' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_subscriptions where user_id = v_user and role = 'designer' and status = 'active'
               and (end_date is null or end_date > now())) then
    raise exception 'trial_not_eligible: you already have an active plan' using errcode = 'P0001';
  end if;

  -- Rows still marked active whose end date has passed are expired: record that, so the
  -- one-active-subscription index stays truthful.
  update public.user_subscriptions set status = 'expired', updated_at = now()
   where user_id = v_user and role = 'designer' and status = 'active' and end_date is not null and end_date <= now();

  select id into v_pro from public.subscription_plans where plan_key = 'designer_pro';
  insert into public.user_subscriptions (user_id, role, plan_id, status, start_date, end_date, renewal_date, is_trial)
  values (v_user, 'designer', v_pro, 'active', now(), v_end, null, true);

  return jsonb_build_object('plan_key', 'designer_pro', 'is_trial', true, 'ends_at', v_end);
end;
$$;

revoke execute on function public.start_designer_pro_trial() from public, anon;
grant execute on function public.start_designer_pro_trial() to authenticated;
