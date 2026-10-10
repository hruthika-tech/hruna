-- HRUNA test fixture — scripts/test-phase6-admin.mjs, checks 17/18 (dispute management).
-- LOCAL TEST DATABASE ONLY. Applied by scripts/run-local-suites.mjs after `supabase db reset`.
--
-- Disputes have no creation endpoint anywhere in the app (by design), so the admin dispute checks
-- need these rows seeded: one OPEN dispute (advanced to under_review by the suite) and one
-- RESOLVED dispute (advanced to closed). Both are between the seeded customer (aanya) and the
-- seeded approved designer (meera), about the seed's own completed project.

begin;

do $$
begin
  if not exists (select 1 from public.users where id = 'c0000000-0000-0000-0000-000000000001' and email = 'aanya@lilirve.dev') then
    raise exception 'HRUNA local seed not found — refusing to apply test fixtures to this database';
  end if;
end $$;

insert into public.disputes (id, customer_id, designer_id, project_id, issue, details, status, created_at)
values
  ('96000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001',
   'Test fixture — fit issue', 'Synthetic open dispute used by the Phase 6 admin checks.', 'open',
   now() - interval '5 days'),
  ('96000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001',
   'Test fixture — delivery delay', 'Synthetic resolved dispute used by the Phase 6 admin checks.', 'resolved',
   now() - interval '20 days');

commit;
