/**
 * Route classification for middleware-level route protection (§14/§15). Reflects the ACTUAL route
 * tree under app/ as inspected directly for this phase — nothing here is invented. Next.js route
 * groups like (app) and (designer) are organizational only and never appear in the real URL, so
 * this classifies by the real path, not by which group folder a page happens to live in.
 *
 * Deliberately isomorphic (no server-only imports) — lib/supabase/middleware.ts (Edge middleware)
 * and any future client-side nav code can both import classifyRoute() safely.
 *
 * SCOPE NOTE on "customer"/"designer" levels: for this phase, both require only a valid
 * authenticated session — NOT that a customer_profiles/designer_profiles row actually exists yet.
 * The /onboarding and /designer-onboarding wizards that create those rows are still mock (§19, §24
 * — profile completion stays a separate concern from authentication, and full frontend/business
 * integration is a later phase), so gating on profile existence here would lock a freshly
 * authenticated user out of the very pages that let them pick a role. Tightening "customer"/
 * "designer" to also require the matching profile row is a one-line change to the checks in
 * lib/supabase/middleware.ts once those wizards write real data.
 */

export type AccessLevel = "public" | "authenticated" | "customer" | "designer" | "admin";

interface RouteRule {
  test: RegExp;
  level: AccessLevel;
}

const ROUTE_RULES: RouteRule[] = [
  // ADMIN — app/admin/** (Admin Dashboard, User Management, Verification, Payment monitoring,
  // Reports/disputes, Notifications, Settings).
  { test: /^\/admin(\/|$)/, level: "admin" },

  // DESIGNER — app/(designer)/designer/** (Designer Home, Requests, Proposals/Requests, Projects,
  // Messages, Manage Studio, Designer Profile, Reviews).
  { test: /^\/designer(\/|$)/, level: "designer" },

  // PUBLIC catalog/browse pages that live inside the (app) route group only for shared layout —
  // the landing page's own public nav links straight to /discover, and the Studio page component
  // is literally named PublicStudioPage. Visitors must be able to browse before signing up.
  { test: /^\/discover(\/|$)/, level: "public" },
  { test: /^\/studio\/[^/]+\/?$/, level: "public" },
  { test: /^\/dresses\/[^/]+\/?$/, level: "public" },
  { test: /^\/collections\/[^/]+\/?$/, level: "public" },

  // CUSTOMER — the rest of the (app) route group: private account pages.
  {
    test: /^\/(home|messages|notifications|profile|projects|requests|saved|diary)(\/|$)/,
    level: "customer",
  },

  // AUTHENTICATED — signed in, but pre-role-selection or mid-onboarding/status pages. Requires a
  // session; does not require either profile to exist yet. /setup-password belongs here too: it
  // requires a real, verified Supabase session (established by app/auth/confirm/route.ts's
  // verifyOtp() call) — this is the middleware-level half of the "can't set a password without
  // proving email ownership" guard; the page itself additionally checks user_metadata.password_set
  // (see app/setup-password/page.tsx) since a valid session alone doesn't say whether the user
  // already has a real password.
  {
    test: /^\/(choose-role|onboarding|designer-onboarding|verification-pending|verification-rejected|subscription|designer-subscription|setup-password)(\/|$)/,
    level: "authenticated",
  },

  // PUBLIC — reachable before/without a session. /auth/confirm is the email-link landing route
  // (it must be reachable pre-session, since establishing the session IS what it does); /verify-email
  // is the "check your inbox" pending page shown right after signup.
  { test: /^\/auth\/confirm(\/|$)/, level: "public" },
  { test: /^\/verify-email(\/|$)/, level: "public" },
  // /reset-password is public at the middleware level because it is ALSO an email-link landing
  // route: Supabase's default recovery link arrives as /reset-password?code=… (or #error_code=…)
  // BEFORE any session exists — the page itself establishes the recovery session in the browser
  // (app/reset-password/ResetPasswordFlow.tsx). Gating it on a session here bounced every such
  // link to /login. The password form only renders once a session exists, and updateUser() is
  // rejected by Supabase Auth itself without one, so this doesn't loosen what can be done.
  { test: /^\/reset-password(\/|$)/, level: "public" },

  // Everything else — landing page, /login, /create-account, /forgot-password, /become-a-designer,
  // /api/health — is public. (API routes under /api/auth/* and /api/profile/* enforce their OWN
  // authorization via lib/supabase/authorization.ts's requireX() helpers rather than this
  // page-level classifier — a 401/403 JSON response is the correct behavior for an API call, not a
  // redirect.)
];

export function classifyRoute(pathname: string): AccessLevel {
  for (const rule of ROUTE_RULES) {
    if (rule.test.test(pathname)) return rule.level;
  }
  return "public";
}
