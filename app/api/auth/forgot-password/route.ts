/**
 * Starts Supabase's password-recovery flow. Separate from app/api/auth/resend/route.ts (which
 * resends a signup CONFIRMATION email) — this sends a RECOVERY email, a different Supabase Auth
 * email type/template (supabase/templates/recovery.html).
 *
 * redirectTo is /reset-password, which owns the whole recovery landing (see app/reset-password/
 * ResetPasswordFlow.tsx). Both email-link shapes Supabase can send end up there:
 *   - Default dashboard template ({{ .ConfirmationURL }}): Supabase verifies the token itself, then
 *     redirects to /reset-password?code=… (PKCE — exchanged in the browser using the code-verifier
 *     cookie this route's server client sets below), or /reset-password#error_code=otp_expired… .
 *   - Custom template (supabase/templates/recovery.html): /auth/confirm?token_hash=…&type=recovery
 *     verifies server-side, then redirects to /reset-password with the session already set.
 * Because the PKCE verifier is a cookie, the default-template link only works in the same browser
 * (and on the same host — localhost vs 127.0.0.1 are different cookie jars) that requested it.
 *
 * Always returns the same generic success message regardless of whether the email belongs to a
 * real account — resetPasswordForEmail() itself doesn't error for an unknown email either, and
 * this route must not turn that into an account-enumeration oracle.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { errorResponse } from "@/lib/supabase/errors";
import { RATE_LIMITED_MESSAGE, RESET_UNAVAILABLE_MESSAGE, authErrorLogFields, classifyAuthError } from "@/lib/auth/auth-errors";

export const dynamic = "force-dynamic";

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for that email, we've sent a password reset link.";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ status: "error", message: "Enter a valid email address." }, { status: 400 });
    }

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${supabaseConfig.siteUrl()}/reset-password`,
    });
    // The generic success message is only for a request Supabase ACCEPTED (it answers the same for
    // unknown addresses, so that reveals nothing). A failure that has nothing to do with the address
    // — Auth/database/network down, misconfiguration — is reported as a failure so nobody waits for
    // an email that was never sent. An email-send (SMTP) failure, though, only happens for real
    // accounts, so it's logged and answered generically to keep this from revealing accounts.
    if (error) {
      const kind = classifyAuthError(error);
      console.error("[auth:forgot-password] reset request failed", authErrorLogFields(error));
      if (kind === "rate_limited") {
        return NextResponse.json({ status: "error", code: "rate_limited", message: RATE_LIMITED_MESSAGE }, { status: 429 });
      }
      if (kind === "unavailable") {
        return NextResponse.json({ status: "error", code: "reset_unavailable", message: RESET_UNAVAILABLE_MESSAGE }, { status: 503 });
      }
    }

    return NextResponse.json({ status: "ok", message: GENERIC_SUCCESS_MESSAGE });
  } catch (err) {
    return errorResponse(err, "api.auth.forgot-password");
  }
}
