-- HRUNA test fixture — scripts/test-phase8-payments.mjs, checks 7–15 (verify/webhook/activation).
-- LOCAL TEST DATABASE ONLY. Applied by scripts/run-local-suites.mjs after `supabase db reset`.
--
-- Two PENDING Razorpay payments for the seeded designer (meera) on the Designer Plus plan, as the
-- checkout route would have created them if Razorpay had returned an order. Synthetic order ids
-- only — no real Razorpay data. The plan id is looked up by plan_key (migration 20261029000001).
-- Customers use HRUNA for free, so there are no customer payments.
--   97000000-…-001 / order_test_fixture_001 → activated by the suite's signed webhook (checks 10–15)
--   97000000-…-002 / order_test_fixture_002 → target of the forged-signature check (7/8)
-- Amount 199 INR = 19900 paise, matching FIXTURE_AMOUNT_PAISE in the suite.

begin;

do $$
begin
  if not exists (select 1 from public.users where id = 'd0000000-0000-0000-0000-000000000001' and email = 'meera@lilirve.dev') then
    raise exception 'HRUNA local seed not found — refusing to apply test fixtures to this database';
  end if;
  if (select count(*) from public.subscription_plans where plan_key = 'designer_plus' and price = 199) <> 1 then
    raise exception 'Expected the Designer Plus plan (migration 20261029000001)';
  end if;
end $$;

insert into public.payments (id, user_id, plan_id, amount, currency, status, payment_provider, provider_order_id)
select v.id, 'd0000000-0000-0000-0000-000000000001', p.id, 199, 'INR', 'pending', 'razorpay', v.order_id
from (values
  ('97000000-0000-0000-0000-000000000001'::uuid, 'order_test_fixture_001'),
  ('97000000-0000-0000-0000-000000000002'::uuid, 'order_test_fixture_002')
) as v(id, order_id)
cross join (select id from public.subscription_plans where plan_key = 'designer_plus') as p;

commit;
