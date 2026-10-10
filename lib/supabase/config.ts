/**
 * Central place every Supabase client reads its connection details from — nothing else in the
 * codebase should read `process.env.NEXT_PUBLIC_SUPABASE_*`/`SUPABASE_SERVICE_ROLE_KEY` directly.
 * That keeps "which Supabase project are we talking to" purely a matter of which `.env.local` /
 * hosting-platform environment variables are set — LOCAL (`npm run db:start`) vs. PRODUCTION
 * (a real hosted project) is never a code branch, never a hardcoded URL.
 *
 * Isomorphic (safe to import from browser code too) — `url()`/`anonKey()` are public by design
 * (that's what NEXT_PUBLIC_ means). `serviceRoleKey()` is not itself secret-shaped in a browser
 * bundle (Next.js only inlines NEXT_PUBLIC_-prefixed vars into client code; this one resolves to
 * `undefined` there), but it should still only ever be *called* from server-only code — see
 * lib/supabase/admin.ts, which is additionally guarded with the `server-only` package for a
 * hard build-time error instead of a silent `undefined`.
 */

// `value` is passed in (not looked up as `process.env[name]`) because Next.js only inlines
// NEXT_PUBLIC_* vars into browser bundles for LITERAL `process.env.NEXT_PUBLIC_X` references — a
// dynamic lookup resolves to undefined in the browser, which would make lib/supabase/client.ts
// throw "Missing required environment variable" on every client-side call.
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill ` +
        `in real values (run "npm run db:status" once "npm run db:start" is up for local dev values).`
    );
  }
  return value;
}

export const supabaseConfig = {
  url: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  anonKey: () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  // Base URL of THIS Next.js app (not the Supabase project) — used to build the emailRedirectTo/
  // redirectTo links Supabase Auth puts in confirmation and password-recovery emails, so those
  // links land back on this app's /auth/confirm route instead of somewhere hardcoded. Must also be
  // present in the Supabase project's Auth → URL Configuration redirect allow-list (locally, that's
  // supabase/config.toml's `additional_redirect_urls`).
  //
  // Trailing slashes are stripped so `${siteUrl()}/path` never produces "//path" (which Supabase's
  // redirect allow-list matching would treat as a different URL).
  siteUrl: () => requireEnv("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, ""),
};
