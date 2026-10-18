/**
 * Real signup: creates the auth.users row via the public supabase.auth.signUp() endpoint with
 * `emailRedirectTo` pointed at /auth/confirm, so Supabase Auth sends a real confirmation email and
 * the account is NOT confirmed/signed-in until the recipient actually clicks that link. This
 * replaces the earlier temporary admin.createUser()+signInWithPassword() bypass (see git history /
 * prior session notes if you need the old rationale) now that Resend is configured as this
 * project's SMTP provider — signUp() email delivery depends entirely on the hosted Supabase
 * project's Dashboard → Authentication → Emails → SMTP Settings actually being wired to Resend,
 * which is not something this file (or any code) can configure or verify.
 *
 * Duplicate-account check: unchanged — a service-role lookup (must run pre-session, before there's
 * an auth.uid() for RLS to scope by) for an existing public.users row with a completed customer or
 * designer profile, so a genuine first-time visitor gets a clear "sign in instead" message instead
 * of a confusing generic error. This still needs the admin client even though account creation
 * itself now goes through the public endpoint.
 *
 * "Already registered" after signUp() itself: Supabase deliberately does NOT return a distinct
 * error for an email that already has a CONFIRMED account — that would let signUp() be used to
 * enumerate accounts. Instead it returns a success-shaped response whose `user.identities` array is
 * empty. The duplicate-account check above already catches the common case (an existing customer/
 * designer); this empty-identities check is the fallback for an auth user that exists but never
 * completed onboarding, mirroring what the old admin.createUser()'s explicit `email_exists` error
 * used to catch.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";
import { authDiagnosticFetch } from "@/lib/supabase/auth-diagnostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";
import { errorResponse } from "@/lib/supabase/errors";
import { validatePasswordConfirmation } from "@/lib/auth/password";
import { authCallbackUrl } from "@/lib/auth/auth-flows";

export const dynamic = "force-dynamic";

const ALREADY_EXISTS_MESSAGE =
  "An account with this email already exists. Please sign in — if you don't remember your password, use ‘Forgot password?’ on the sign-in page.";
// `code` lets the form offer the right next step (sign in / reset password, or check the inbox).
const alreadyExists = () =>
  NextResponse.json({ status: "error", code: "email_exists", message: ALREADY_EXISTS_MESSAGE }, { status: 409 });

/**
 * A Supabase client for signUp() that is isolated from THIS browser's session:
 *   - it reads NO cookies, so an existing session (e.g. a signed-in admin) is invisible to it;
 *   - of everything it tries to write, ONLY the one-time PKCE `…-code-verifier` cookie is kept —
 *     needed when the confirmation link comes back as /auth/confirm?code=… — and every session
 *     cookie (…-auth-token, chunks) is dropped. So even with email auto-confirm on, signUp() can
 *     never install the new account's session over the current one.
 * Same project, anon key, PKCE flow and cookie options as lib/supabase/server.ts otherwise.
 */
function createIsolatedSignupClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(supabaseConfig.url(), supabaseConfig.anonKey(), {
    global: { fetch: authDiagnosticFetch("api.auth.signup") },
    cookies: {
      getAll() {
        return [];
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          if (name.endsWith("-code-verifier")) cookieStore.set(name, value, options);
        }
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    // Registration is allowed whether or not the browser already holds a session (e.g. an admin
    // registering someone else): signUp() runs on an ISOLATED client (createIsolatedSignupClient
    // below) that never sees or writes this browser's session cookies, so the current session can't
    // be replaced or changed by this route.
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!name) {
      return NextResponse.json({ status: "error", message: "Enter your full name." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ status: "error", message: "Enter a valid email address." }, { status: 400 });
    }
    const passwordError = validatePasswordConfirmation(password, confirmPassword);
    if (passwordError) {
      return NextResponse.json({ status: "error", message: passwordError }, { status: 400 });
    }

    // Service-role: this is a genuinely new visitor with no session yet, so there's no auth.uid()
    // for RLS to scope a read by. Read-only, and only ever returns a boolean-shaped 409 to the
    // client, never any profile data.
    const admin = createAdminClient();
    const { data: existingUser } = await admin.from("users").select("id").eq("email", email).maybeSingle();
    if (existingUser) {
      const [{ count: customerCount }, { count: designerCount }] = await Promise.all([
        admin.from("customer_profiles").select("id", { count: "exact", head: true }).eq("user_id", existingUser.id),
        admin.from("designer_profiles").select("id", { count: "exact", head: true }).eq("user_id", existingUser.id),
      ]);
      if ((customerCount ?? 0) > 0 || (designerCount ?? 0) > 0) return alreadyExists();
    }

    // Public signUp() — this is what actually triggers Supabase Auth to send a confirmation email
    // (via whatever SMTP provider the hosted project's dashboard is configured with). No session is
    // established by this call when "Confirm email" is on; the user gets a session only after
    // clicking the emailed link, which app/auth/confirm/route.ts turns into one.
    //
    // `password_set: true` is set here (not left for app/api/auth/set-password/route.ts) because
    // this form — unlike the flow /setup-password was designed for — already collects a real,
    // user-chosen password up front. Marking it here is accurate (the password genuinely is set
    // already), not a shortcut: it just means /setup-password's existing "already has a password"
    // guard sends them straight to /choose-role after confirming instead of asking them to type the
    // same password a second time. Nothing about /setup-password itself changes — it still applies
    // in full for any identity that reaches it without password_set (e.g. an admin-invited account).
    // Diagnostic fetch: logs GoTrue's raw error code/message + request id on a failed call (never
    // the email, password, or tokens) — see lib/supabase/auth-diagnostics.ts for why that's needed.
    const supabase = createIsolatedSignupClient();
    // flow=signup is how /auth/confirm recognises this link (lib/auth/auth-flows.ts): Supabase's default
    // template returns here with only ?code=, so the marker has to be on the redirect URL itself.
    const emailRedirectTo = authCallbackUrl(supabaseConfig.siteUrl(), "signup");
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { full_name: name, password_set: true },
      },
    });
    if (signUpError) {
      console.error("[api.auth.signup] signUp() failed", {
        name: signUpError.name,
        status: signUpError.status,
        code: signUpError.code,
        message: signUpError.message,
        redirectOrigin: new URL(emailRedirectTo).origin,
      });
      if (/already registered|already exists/i.test(signUpError.message)) return alreadyExists();
      // Re-submitting for an address that is registered but NOT yet confirmed makes Supabase re-send that
      // account's confirmation email (no second account is created); this is its resend throttle.
      if (signUpError.code === "over_email_send_rate_limit") {
        return NextResponse.json(
          {
            status: "error",
            code: "confirmation_pending",
            message:
              "We've already sent a confirmation link to this email address. Open it to finish creating your account (check your spam folder too). You can ask for a new link in a minute.",
          },
          { status: 429 }
        );
      }
      throw signUpError;
    }

    // Supabase intentionally returns a success-shaped response (no thrown error) for an email that
    // already has a CONFIRMED account, to avoid signUp() being usable to enumerate accounts — the
    // tell is an empty `identities` array. The profile-based check above already covers a customer/
    // designer who finished onboarding; this covers an auth user that signed up but never did.
    if (signUpData.user && signUpData.user.identities?.length === 0) return alreadyExists();

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.auth.signup");
  }
}
