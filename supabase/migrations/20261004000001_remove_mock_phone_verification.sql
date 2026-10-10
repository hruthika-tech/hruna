-- LILIRVE — remove the mock designer phone-OTP verification.
--
-- /designer-onboarding used to "verify" a phone with a hardcoded demo code (1234) and persist
-- phone_verified = true. No SMS verification ever happened, so every true value in this column is
-- false data. V1 has no SMS verification: the phone is an optional, unverified contact detail.
--
-- Email verification is NOT stored here either — it is read from Supabase Auth's own
-- auth.users.email_confirmed_at (set only by the signup confirmation link, the same mechanism
-- customer signup uses). See lib/designer/data.ts's mapOnboarding()/emailConfirmed().

update public.designer_onboarding
set phone_verified = false
where phone_verified;

comment on column public.designer_onboarding.phone_verified is
  'Unused in V1 — there is no SMS verification. Must only ever be set true by a real phone '
  'verification process; the app neither writes nor reads it.';

comment on column public.designer_onboarding.email_verified is
  'Unused — the app reads email verification from auth.users.email_confirmed_at (Supabase Auth), '
  'the single source of truth for account email confirmation.';
