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
    // Deliberately not re-thrown for most cases — see the generic-response note above. A genuine
    // rate-limit (429) is the one thing still worth surfacing, so the user knows to wait rather
    // than assume the (silently-swallowed) request failed.
    if (error && error.status === 429) throw error;

    return NextResponse.json({ status: "ok", message: GENERIC_SUCCESS_MESSAGE });
  } catch (err) {
    return errorResponse(err, "api.auth.forgot-password");
  }
}
