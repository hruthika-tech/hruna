/**
 * Landing route for both signup-confirmation and password-recovery email links. This is the ONLY
 * place in the app that turns "clicked the link Supabase emailed" into a real, cookie-persisted
 * Supabase session — which is exactly what makes it impossible to reach /setup-password without
 * having actually proven ownership of the email address the link was sent to (see
 * app/setup-password/page.tsx's session guard, and lib/auth/routes.ts's route classification).
 *
 * Uses `token_hash` + `supabase.auth.verifyOtp({ type, token_hash })`, NOT
 * `exchangeCodeForSession(code)` (the PKCE flow @supabase/ssr defaults to). PKCE's code exchange
 * requires the code-verifier cookie set in the SAME browser that started signUp()/
 * resetPasswordForEmail() — it breaks whenever the email is opened in a different browser/device
 * (a webmail app, "open link" from a phone), which is a completely normal way to open an email.
 * token_hash verification has no such requirement — this is Supabase's own documented approach for
 * confirmation/recovery links specifically. See supabase/templates/confirmation.html and
 * recovery.html, which build the link this route reads.
 *
 * `type` (`"signup"` vs `"recovery"`) is also how a signup confirmation is told apart from a
 * password-recovery click — both are handled here, since the operation (verify the token, get a
 * session) is identical; only the destination differs.
 *
 * Also accepts `?code=` (PKCE), which is what Supabase's DEFAULT email templates produce for a
 * redirectTo pointing here: Supabase verifies the link itself and redirects with a one-time code.
 * Exchanging it needs the code-verifier cookie from the browser that started the flow; the
 * verifier records whether it was a recovery flow, which is how `redirectType` picks the
 * destination. Recovery failures of any kind go to /reset-password (which shows a "request a new
 * link" error state) — never to /create-account, which is only for signup-confirmation failures.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));
  // Only a short, known error code is forwarded — never Supabase's free-text description.
  const recoveryError = (errorCode: string) =>
    redirectTo(`/reset-password?error_code=${encodeURIComponent(errorCode.replace(/[^a-z_]/gi, "").slice(0, 40))}`);
  const signupError = (reason: "invalid-link" | "expired") => redirectTo(`/create-account?error=${reason}`);

  // Deliberately ignores any `next`/redirect query param a link might carry — accepting an
  // arbitrary client-supplied redirect target here would be an open-redirect hole. The destination
  // is decided purely by the server-validated `type` (or the PKCE verifier's redirect type), below.

  // Supabase-reported failure forwarded as query params (e.g. ?error=access_denied&error_code=
  // otp_expired). Hash-fragment errors never reach the server; /reset-password reads those itself.
  const urlErrorCode = searchParams.get("error_code") ?? searchParams.get("error");
  if (urlErrorCode) {
    return type === "recovery" ? recoveryError(urlErrorCode) : signupError("expired");
  }

  const supabase = createClient();

  // Recovery links are verified by /reset-password itself, so that page can tell a genuine
  // recovery apart from an ordinary signed-in session (see ResetPasswordFlow.tsx). The token is
  // forwarded unconsumed; the page strips it from the address bar once used.
  if (token_hash && type === "recovery") {
    return redirectTo(`/reset-password?token_hash=${encodeURIComponent(token_hash)}&type=recovery`);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) return signupError("expired");
    return redirectTo("/setup-password");
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Without a valid exchange there is no reliable way to know which flow this was, so `type`
      // (if present) is the only hint used here.
      return type === "recovery" ? recoveryError(error.code ?? "invalid_link") : signupError("expired");
    }
    // auth-js returns `redirectType` ("recovery" when the verifier was created by
    // resetPasswordForEmail) at runtime, but its published type for this method omits it.
    const redirectType = (data as { redirectType?: string | null }).redirectType;
    return redirectTo(redirectType === "recovery" || type === "recovery" ? "/reset-password" : "/setup-password");
  }

  return type === "recovery" ? recoveryError("invalid_link") : signupError("invalid-link");
}
