-- A dedicated final project status for a mutually agreed withdrawal (customer + designer).
-- Kept in its own migration: Postgres can't use a newly added enum value inside the same
-- transaction that adds it, and 20261023000002 (the withdrawal workflow) references it.
-- 'cancelled' stays reserved for admin actions.
alter type public.project_status add value if not exists 'withdrawn';
