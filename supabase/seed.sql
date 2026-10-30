-- LILIRVE — Phase 1 development seed data
-- DEVELOPMENT/TEST DATA ONLY. Never run against production. Every account below uses the
-- password "password123" for local testing. Mirrors the shape of the existing frontend's
-- lib/seed-data.ts (one customer, an approved designer roughly like "Meera Kapoor / Atelier
-- Meera", a second pending designer) — recognizable, not a random dataset — but ids are fresh
-- UUIDs, not required to numerically match the frontend's mock string ids.

-- ---------------------------------------------------------------------------
-- Auth users (local dev only)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin@lilirve.dev', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'aanya@lilirve.dev', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'meera@lilirve.dev', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'ramesh@lilirve.dev', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  -- Phase 3: two more designer verification states, needed to test all 5
  -- designer_overall_status values end to end (not_submitted/pending/approved already covered
  -- above and by a designer who never completes onboarding — these two fill in rejected/suspended).
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'priya@lilirve.dev', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
   'kabir@lilirve.dev', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- Matching identity rows — some Supabase Auth versions require these for password login to work.
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', now(), now(), now()
from auth.users u
where u.id in (
  'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004'
);

-- public.users rows already exist (auto-created by on_auth_user_created). Promote the admin.
update public.users set is_admin = true, display_name = 'LILIRVE Admin'
where id = 'a0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Customer profile
-- ---------------------------------------------------------------------------
insert into public.customer_profiles (id, user_id, name, city, phone, status)
values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'Aanya Reddy', 'Hyderabad, India', '+91 98765 43210', 'active');

-- ---------------------------------------------------------------------------
-- Designer profiles — one approved with a full studio, one pending with a bare profile.
-- ---------------------------------------------------------------------------
insert into public.designer_profiles (
  id, user_id, studio_name, type, specializations, city, country, experience_years,
  starting_price, bio, story, opening_hours, atelier_location, contact_email
) values (
  'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
  'Atelier Meera', 'Designer', array['Bridal Couture', 'Occasion Wear'], 'Jaipur', 'India', 12,
  25000, 'Bridal and occasion-wear couturier known for hand-finished silhouettes.',
  'Atelier Meera began in a small Jaipur workshop in 2013.',
  'Tue-Sun, 11:00 AM - 7:00 PM', 'C-Scheme, Jaipur, Rajasthan', 'hello@ateliermeera.dev'
), (
  'd1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002',
  'Naidu Tailoring Works', 'Tailor', array['Bespoke Tailoring'], 'Hyderabad', 'India', 3,
  8000, 'Bespoke tailoring, newly onboarded.', '', '', '', 'ramesh@lilirve.dev'
), (
  'd1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003',
  'Priya Studio', 'Designer', array['Contemporary Ready-to-Wear'], 'Bengaluru', 'India', 2,
  6000, 'Verification rejected in this seed for RBAC test coverage.', '', '', '', 'priya@lilirve.dev'
), (
  'd1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004',
  'Kabir Couture', 'Designer', array['Menswear'], 'Delhi', 'India', 6,
  15000, 'Previously approved, suspended in this seed for RBAC test coverage.', '', '', '', 'kabir@lilirve.dev'
);

-- designer_verifications + designer_onboarding rows already exist for both (auto-created by
-- on_designer_profile_created with 'not_submitted' defaults) — update their status:
update public.designer_verifications
set identity_status = 'verified', portfolio_status = 'approved', overall_status = 'approved',
    submitted_at = now() - interval '90 days', reviewed_at = now() - interval '85 days'
where designer_id = 'd1000000-0000-0000-0000-000000000001';

update public.designer_verifications
set identity_status = 'pending', portfolio_status = 'submitted', overall_status = 'pending',
    submitted_at = now() - interval '2 days'
where designer_id = 'd1000000-0000-0000-0000-000000000002';

-- Phase 3 additions — rejected and suspended, so all 5 designer_overall_status values (and every
-- persona required by the Phase 3 auth-testing brief) have a real seeded account to test against.
update public.designer_verifications
set identity_status = 'failed', portfolio_status = 'rejected', overall_status = 'rejected',
    profile_review_note = 'Portfolio did not meet the bridal-couture quality bar.',
    submitted_at = now() - interval '10 days', reviewed_at = now() - interval '7 days'
where designer_id = 'd1000000-0000-0000-0000-000000000003';

update public.designer_verifications
set identity_status = 'verified', portfolio_status = 'approved', overall_status = 'suspended',
    profile_review_note = 'Suspended after a customer dispute — see admin_audit_log.',
    submitted_at = now() - interval '200 days', reviewed_at = now() - interval '5 days'
where designer_id = 'd1000000-0000-0000-0000-000000000004';

-- ---------------------------------------------------------------------------
-- Files (metadata rows only — no real bytes exist in Storage for this dev seed, so these
-- storage_paths are placeholders, not actually uploaded objects).
-- ---------------------------------------------------------------------------
insert into public.files (id, owner_id, entity_type, bucket_id, storage_path, mime_type, is_private)
values
  ('f1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'studio_highlight', 'studio-images', 'd0000000-0000-0000-0000-000000000001/highlight-1.jpg', 'image/jpeg', false),
  ('f1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'collection_cover', 'studio-images', 'd0000000-0000-0000-0000-000000000001/collection-1-cover.jpg', 'image/jpeg', false),
  ('f1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'dress_image', 'studio-images', 'd0000000-0000-0000-0000-000000000001/dress-1-a.jpg', 'image/jpeg', false),
  ('f1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 'previous_creation', 'studio-images', 'd0000000-0000-0000-0000-000000000001/previous-1.jpg', 'image/jpeg', false),
  ('f1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'request_image', 'request-images', 'c0000000-0000-0000-0000-000000000001/request-1-a.jpg', 'image/jpeg', false);

insert into public.studio_highlights (designer_id, file_id, caption, position)
values ('d1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Hand-embroidered detailing', 0);

insert into public.collections (id, designer_id, name, category, cover_image_file_id, description)
values ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
        'Nur — Winter Bridal', 'Bridal Couture', 'f1000000-0000-0000-0000-000000000002',
        'A capsule of ivory and gold bridal pieces.');

insert into public.dresses (id, designer_id, collection_id, name, description, price, available, fabric)
values ('e2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
        'e1000000-0000-0000-0000-000000000001', 'Nur Ivory Lehenga',
        'Hand-embroidered ivory lehenga with gold thread work.', 68000, true, 'Silk organza');

insert into public.dress_images (dress_id, file_id, position)
values ('e2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003', 0);

insert into public.previous_creations (id, designer_id, description, year)
values ('e3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
        'Reception gown for a Mumbai wedding.', '2025');

insert into public.previous_creation_images (previous_creation_id, file_id, position)
values ('e3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000004', 0);

-- ---------------------------------------------------------------------------
-- Customer request (public, still open) + reference image + a pending proposal on it.
-- ---------------------------------------------------------------------------
insert into public.fashion_requests (
  id, customer_id, title, category, occasion, gender, size, measurements, description,
  fabric_preference, budget_min, budget_max, location, due_date, additional_preferences, status
) values (
  '71000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
  'Pastel Silk Reception Gown', 'Occasion Wear', 'Wedding Reception', 'Women',
  'Bust 36in / Waist 30in / Hip 39in',
  '{"bust":"36 in","waist":"30 in","hip":"39 in","length":"44 in"}'::jsonb,
  'Looking for a soft pastel silk gown with a cape, for a reception in Hyderabad.',
  'Silk organza', 40000, 70000, 'Hyderabad, India', current_date + interval '60 days',
  'Open to a cape instead of a dupatta.', 'proposal_received'
);

insert into public.request_images (request_id, file_id, position)
values ('71000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000005', 0);

insert into public.proposals (id, request_id, designer_id, price, estimated_days, description, notes, status)
values (
  '81000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001', 58000, 21,
  'A dusty-rose silk organza gown with a detachable cape, hand-finished bodice.',
  'Can source the fabric within a week of confirmation.', 'pending'
);

-- ---------------------------------------------------------------------------
-- A second, already-accepted request → proposal → completed project, so there's something to
-- attach the seeded Review to (a review requires a completed project; the request above is
-- deliberately left open/un-accepted to also exercise that state).
-- ---------------------------------------------------------------------------
insert into public.fashion_requests (
  id, customer_id, title, category, occasion, gender, description, status, created_at
) values (
  '72000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
  'Sangeet Bandhgala Set', 'Occasion Wear', 'Sangeet', 'Women',
  'Ivory and gold bandhgala-style set for a sangeet.', 'accepted', now() - interval '120 days'
);

insert into public.proposals (id, request_id, designer_id, price, estimated_days, description, status, created_at)
values (
  '82000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001', 42000, 18,
  'Ivory bandhgala set with gold thread detailing.', 'accepted', now() - interval '118 days'
);

insert into public.projects (
  id, request_id, proposal_id, customer_id, designer_id, stage, progress_percent, status,
  completed_at, created_at
) values (
  '91000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001', 'Completed', 100, 'awaiting_confirmation',
  null, now() - interval '118 days'
);

-- Progress history is written before the customer's confirmation below: once a project is
-- 'completed' its history is locked (migration 20261021000001), exactly as in the real workflow.
insert into public.project_updates (project_id, stage, note, author_id, created_at)
values
  ('91000000-0000-0000-0000-000000000001', 'Request Accepted', 'Proposal accepted — project started.',
   'd1000000-0000-0000-0000-000000000001', now() - interval '118 days'),
  ('91000000-0000-0000-0000-000000000001', 'Completed', 'Final fitting complete, delivered.',
   'd1000000-0000-0000-0000-000000000001', now() - interval '60 days');

-- The customer confirms completion (same end state as before: completed 60 days ago).
update public.projects
set status = 'completed', completed_at = now() - interval '60 days'
where id = '91000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Review for the completed project (recomputes designer_profiles.rating/review_count via trigger)
-- ---------------------------------------------------------------------------
insert into public.reviews (project_id, designer_id, customer_id, rating, review_text, created_at)
values (
  '91000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001', 5,
  'Meera captured exactly the fit and pastel tone I wanted — even better than I imagined.',
  now() - interval '58 days'
);

-- ---------------------------------------------------------------------------
-- Subscription plans — payment_settings.payment_system_enabled stays false, seeded by the
-- subscriptions migration itself; nothing here turns it on.
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (role, name, price, currency, description, features)
values
  ('customer', 'Customer Monthly', 299, 'INR',
   'Full access to designer discovery, custom requests, and your project workspace.',
   array['Discover verified designers', 'Submit custom design requests', 'Receive & compare proposals',
         'Messaging with designers', 'Project workspace & progress tracking', 'Fashion Diary']),
  ('designer', 'Designer Monthly', 499, 'INR',
   'Full access to studio management, customer requests, and project tools.',
   array['Public designer profile & Studio', 'Manage Studio', 'Receive & respond to customer requests',
         'Send proposals', 'Manage active projects', 'Messages & reviews']);

-- The legacy single designer plan above is retired: designer plans are Free / Designer Plus /
-- Designer Pro, created by migration 20261029000001_designer_subscription_plans.sql (which retires
-- this plan on databases where it already exists; locally the seed runs after it, so retire it here).
-- The customer plan stays only for history — customers use HRUNA for free.
update public.subscription_plans set is_active = false where role = 'designer' and plan_key is null;
