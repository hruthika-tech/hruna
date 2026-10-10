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
import { createClient } from "@/lib/supabase/server";
import { authDiagnosticFetch } from "@/lib/supabase/auth-diagnostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";
import { errorResponse } from "@/lib/supabase/errors";
import { validatePasswordConfirmation } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const ALREADY_EXISTS_MESSAGE = "An account with this email already exists. Please sign in instead.";

export async function POST(request: Request) {
  try {
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
      if ((customerCount ?? 0) > 0 || (designerCount ?? 0) > 0) {
        return NextResponse.json({ status: "error", message: ALREADY_EXISTS_MESSAGE }, { status: 409 });
      }
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
    const supabase = createClient({ fetch: authDiagnosticFetch("api.auth.signup") });
    const emailRedirectTo = `${supabaseConfig.siteUrl()}/auth/confirm`;
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
      if (/already registered|already exists/i.test(signUpError.message)) {
        return NextResponse.json({ status: "error", message: ALREADY_EXISTS_MESSAGE }, { status: 409 });
      }
      throw signUpError;
    }

    // Supabase intentionally returns a success-shaped response (no thrown error) for an email that
    // already has a CONFIRMED account, to avoid signUp() being usable to enumerate accounts — the
    // tell is an empty `identities` array. The profile-based check above already covers a customer/
    // designer who finished onboarding; this covers an auth user that signed up but never did.
    if (signUpData.user && signUpData.user.identities?.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "An account with this email already exists. Please sign in — if you don't remember a password, use ‘Forgot password?’ on the sign-in page.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.auth.signup");
  }
}
