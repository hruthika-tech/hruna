-- Razorpay payment hardening: atomic activation, retry-safe failures, refunds and a webhook event log.
--
-- Builds on the existing payment tables (payments / user_subscriptions, migrations 20260829180011,
-- 20260901000001) and the designer plans (20261029000001) — no parallel billing system, nothing
-- dropped, nothing deleted, no seed data.
--
--   * activate_designer_payment(order, razorpay payment, amount, currency) — the ONLY way a payment
--     becomes an active plan. One transaction with the payment row locked: it checks the amount and
--     currency, accepts a 'pending' OR 'failed' row (Razorpay lets a buyer retry inside the same
--     checkout after a failed attempt, on the same order), ends a running trial / lapsed row, grants
--     exactly 30 days and marks the payment succeeded + linked — or none of it happens. Calling it
--     again for the same payment returns the existing result (no second subscription, no extension).
--   * record_payment_failure — marks a still-pending payment failed. Never downgrades a succeeded
--     or refunded payment, and a failed row can still be activated by a later verified success.
--   * apply_payment_refund — records Razorpay's cumulative refunded amount (idempotent). A FULL
--     refund marks the payment 'refunded' and takes back the 30 days it granted (ending the plan,
--     unless another payment's time remains on it); a PARTIAL refund is recorded and access is
--     left unchanged.
--   Activation and refunds take the per-designer lock start_designer_pro_trial uses, so plan
--   changes for one designer never interleave.
--   * payment_events — one row per Razorpay webhook event (unique event id) for deduplication and
--     audit. Admin-readable, never writable by browser roles.
--   * payments.provider_reference (the Razorpay payment id) becomes unique, so one Razorpay payment
--     can never activate two payment rows.
--
-- All three functions are SECURITY DEFINER and executable ONLY by service_role (the server's admin
-- client in lib/payments/activate.ts) — never by anon/authenticated browser sessions.
-- New paid rows have renewal_date NULL: nothing renews.

-- ---------------------------------------------------------------------------
-- payments: minimal extra columns for safe processing
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),
  add column if not exists refunded_amount numeric(12, 2) not null default 0 check (refunded_amount >= 0);

comment on column public.payments.failure_reason is
  'Last failure / rejection reason (short, safe text — never secrets). Cleared when the payment succeeds.';
comment on column public.payments.refunded_amount is
  'Cumulative amount refunded by Razorpay (major unit). Equal to amount = full refund.';

create unique index if not exists payments_provider_reference_key
  on public.payments (provider_reference)
  where provider_reference is not null;

-- ---------------------------------------------------------------------------
-- payment_events: Razorpay webhook log (dedupe + audit)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text not null,
  event_type text not null,
  order_id text,
  payment_id text,
  refund_id text,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'rejected', 'failed')),
  error text check (error is null or char_length(error) <= 300),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_events_event_unique unique (provider, event_id)
);

comment on table public.payment_events is
  'One row per payment-provider webhook event: dedupe by (provider, event_id) and an audit trail. '
  'Written only by the server (service role). Holds ids and short safe error text — never payloads with secrets.';

create index if not exists payment_events_order_idx on public.payment_events (order_id);
create index if not exists payment_events_payment_idx on public.payment_events (payment_id);
create index if not exists payment_events_received_idx on public.payment_events (received_at desc);

alter table public.payment_events enable row level security;
drop policy if exists payment_events_admin_select on public.payment_events;
create policy payment_events_admin_select on public.payment_events for select using (public.is_admin());
revoke all on table public.payment_events from anon, authenticated;
grant select on table public.payment_events to authenticated; -- still filtered to admins by RLS

-- ---------------------------------------------------------------------------
-- activate_designer_payment
-- ---------------------------------------------------------------------------
create or replace function public.activate_designer_payment(
  p_order_id text,
  p_razorpay_payment_id text,
  p_amount_minor bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay public.payments;
  v_plan public.subscription_plans;
  v_sub public.user_subscriptions;
  v_now timestamptz := now();
  v_carry interval := interval '0';
  v_start timestamptz;
  v_end timestamptz;
begin
  if coalesce(p_order_id, '') = '' or coalesce(p_razorpay_payment_id, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  select * into v_pay from public.payments where provider_order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'payment_not_found');
  end if;

  -- One plan change at a time per designer (the same key start_designer_pro_trial takes), so two
  -- paid orders — or a payment and a trial start — never race on the one-active-plan index.
  perform pg_advisory_xact_lock(hashtextextended('hruna_designer_trial:' || v_pay.user_id::text, 0));

  -- Already activated: idempotent for the same Razorpay payment, never a second activation.
  if v_pay.status = 'succeeded' then
    if v_pay.provider_reference = p_razorpay_payment_id then
      select * into v_sub from public.user_subscriptions where id = v_pay.subscription_id;
      return jsonb_build_object('ok', true, 'activated', false, 'already', true,
        'payment_id', v_pay.id, 'subscription_id', v_pay.subscription_id, 'end_date', v_sub.end_date);
    end if;
    return jsonb_build_object('ok', false, 'code', 'order_already_paid');
  end if;
  if v_pay.status = 'refunded' then
    return jsonb_build_object('ok', false, 'code', 'payment_refunded');
  end if;

  -- The verified amount/currency must equal what the server created the order for.
  if round(v_pay.amount * 100)::bigint <> p_amount_minor or upper(coalesce(p_currency, '')) <> upper(v_pay.currency) then
    return jsonb_build_object('ok', false, 'code', 'amount_mismatch');
  end if;

  -- One Razorpay payment id can back only one payment row.
  if exists (select 1 from public.payments where provider_reference = p_razorpay_payment_id and id <> v_pay.id) then
    return jsonb_build_object('ok', false, 'code', 'payment_id_in_use');
  end if;

  select * into v_plan from public.subscription_plans where id = v_pay.plan_id;
  if not found or v_plan.role <> 'designer' then
    return jsonb_build_object('ok', false, 'code', 'not_a_designer_plan');
  end if;
  if not exists (select 1 from public.designer_profiles where user_id = v_pay.user_id) then
    return jsonb_build_object('ok', false, 'code', 'no_designer_profile');
  end if;

  -- History is kept: a running trial ends now, a lapsed 'active' row is recorded as expired.
  update public.user_subscriptions
     set status = 'expired', end_date = v_now, updated_at = v_now
   where user_id = v_pay.user_id and role = 'designer' and status = 'active' and is_trial;
  update public.user_subscriptions
     set status = 'expired', updated_at = v_now
   where user_id = v_pay.user_id and role = 'designer' and status = 'active' and end_date is not null and end_date <= v_now;

  -- A paid plan still running (only possible through a race between two checkouts — checkout
  -- refuses while one is active): never shorten paid access.
  select * into v_sub from public.user_subscriptions
   where user_id = v_pay.user_id and role = 'designer' and status = 'active'
   for update;

  if found and v_sub.plan_id = v_pay.plan_id then
    -- Same plan paid again: extend by exactly 30 days from its current end.
    update public.user_subscriptions
       set end_date = coalesce(end_date, v_now) + interval '30 days', renewal_date = null, updated_at = v_now
     where id = v_sub.id
     returning * into v_sub;
  else
    if found then
      -- Different plan: the new plan starts now and keeps the old plan's unused time.
      v_carry := greatest(coalesce(v_sub.end_date, v_now) - v_now, interval '0');
      update public.user_subscriptions
         set status = 'expired', end_date = v_now, updated_at = v_now
       where id = v_sub.id;
    end if;
    v_start := v_now;
    v_end := v_now + interval '30 days' + v_carry;
    insert into public.user_subscriptions (user_id, role, plan_id, status, start_date, end_date, renewal_date)
    values (v_pay.user_id, 'designer', v_pay.plan_id, 'active', v_start, v_end, null)
    returning * into v_sub;
  end if;

  update public.payments
     set status = 'succeeded', provider_reference = p_razorpay_payment_id, paid_at = v_now,
         subscription_id = v_sub.id, failure_reason = null, updated_at = v_now
   where id = v_pay.id;

  return jsonb_build_object('ok', true, 'activated', true, 'already', false,
    'payment_id', v_pay.id, 'subscription_id', v_sub.id, 'end_date', v_sub.end_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- record_payment_failure
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_failure(p_order_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  update public.payments
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'failed'), 300), updated_at = now()
   where provider_order_id = p_order_id and status in ('pending', 'failed')
  returning id into v_id;
  if v_id is null then
    -- Unknown order, or already succeeded/refunded: never downgraded.
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  return jsonb_build_object('ok', true, 'changed', true, 'payment_id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_payment_refund
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_refund(p_razorpay_payment_id text, p_amount_refunded_minor bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay public.payments;
  v_refunded numeric(12, 2);
  v_full boolean;
begin
  select * into v_pay from public.payments where provider_reference = p_razorpay_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'payment_not_found');
  end if;
  if v_pay.status not in ('succeeded', 'refunded') then
    return jsonb_build_object('ok', false, 'code', 'payment_not_succeeded');
  end if;

  -- Razorpay reports the CUMULATIVE refunded amount, so this is idempotent: never added twice.
  v_refunded := least(greatest(v_pay.refunded_amount, p_amount_refunded_minor / 100.0), v_pay.amount);
  v_full := v_refunded >= v_pay.amount;

  -- Full refund, applied once (on the succeeded → refunded transition): take back exactly the 30
  -- days THIS payment granted. A subscription holding only those days ends now (→ Free); one that
  -- was extended by another, unrefunded payment keeps that payment's time.
  if v_full and v_pay.status = 'succeeded' and v_pay.subscription_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('hruna_designer_trial:' || v_pay.user_id::text, 0));
    update public.user_subscriptions
       set end_date = case when end_date - interval '30 days' > now() then end_date - interval '30 days' else now() end,
           status = case when end_date - interval '30 days' > now() then status else 'cancelled' end,
           cancelled_at = case when end_date - interval '30 days' > now() then cancelled_at else coalesce(cancelled_at, now()) end,
           updated_at = now()
     where id = v_pay.subscription_id and status = 'active' and end_date is not null;
  end if;

  update public.payments
     set refunded_amount = v_refunded,
         status = case when v_full then 'refunded'::payment_status else status end,
         updated_at = now()
   where id = v_pay.id;

  return jsonb_build_object('ok', true, 'full', v_full, 'refunded_amount', v_refunded, 'payment_id', v_pay.id);
end;
$$;

revoke execute on function public.activate_designer_payment(text, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.record_payment_failure(text, text) from public, anon, authenticated;
revoke execute on function public.apply_payment_refund(text, bigint) from public, anon, authenticated;
grant execute on function public.activate_designer_payment(text, text, bigint, text) to service_role;
grant execute on function public.record_payment_failure(text, text) to service_role;
grant execute on function public.apply_payment_refund(text, bigint) to service_role;
