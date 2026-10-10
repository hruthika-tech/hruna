-- HRUNA test fixture — scripts/test-phase4-customer.mjs, checks 18/19 (reviews).
-- LOCAL TEST DATABASE ONLY. Applied by scripts/run-local-suites.mjs after `supabase db reset`.
--
-- A second completed, NOT-yet-reviewed project between the seeded customer (aanya) and the seeded
-- approved designer (meera) — the seed's own completed project (91000000-…) already has a review,
-- and reviews are unique per project. Mirrors that seeded project exactly: request → accepted
-- proposal → completed project. The review itself is NOT inserted — the suite submits it.
-- All rows go through the normal constraints/triggers (nothing is bypassed).

begin;

do $$
begin
  if not exists (select 1 from public.users where id = 'c0000000-0000-0000-0000-000000000001' and email = 'aanya@lilirve.dev') then
    raise exception 'HRUNA local seed not found — refusing to apply test fixtures to this database';
  end if;
end $$;

insert into public.fashion_requests (id, customer_id, title, category, occasion, gender, description, status, created_at)
values (
  '73000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
  'Test fixture — Reception Gown', 'Occasion Wear', 'Reception', 'Women',
  'Synthetic test request used by the Phase 4 review checks.', 'accepted', now() - interval '90 days'
);

insert into public.proposals (id, request_id, designer_id, price, estimated_days, description, status, created_at)
values (
  '83000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001', 30000, 14,
  'Synthetic test proposal.', 'accepted', now() - interval '88 days'
);

insert into public.projects (
  id, request_id, proposal_id, customer_id, designer_id, stage, progress_percent, status, completed_at, created_at
) values (
  '93000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001', 'Completed', 100, 'completed',
  now() - interval '30 days', now() - interval '88 days'
);

commit;
