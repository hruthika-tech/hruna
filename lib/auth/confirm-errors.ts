/**
 * Why an email-confirmation link failed, as forwarded by app/auth/confirm/route.ts to
 * /create-account?error=<reason>, and the message shown there. Isomorphic, no side effects.
 *
 *   expired           — the link's token is expired or was already used (Supabase: otp_expired)
 *   invalid-link      — malformed/unknown token, or the link is missing its parameters
 *   different-browser — a PKCE `?code=` link opened in a browser that doesn't hold the one-time
 *                       code verifier (signup happened in another browser). The repo's token_hash
 *                       template (supabase/templates/confirmation.html) never hits this.
 *
 * Re-submitting the signup form for an email that was never confirmed makes Supabase send a fresh
 * confirmation link, so "fill in the form again" is real guidance, not a dead end.
 */
export type ConfirmationErrorReason = "expired" | "invalid-link" | "different-browser";

const MESSAGES: Record<ConfirmationErrorReason, string> = {
  expired:
    "That confirmation link has expired or has already been used. If you've already confirmed your email, sign in. Otherwise, fill in the form again and we'll email you a new link.",
  "invalid-link":
    "That confirmation link isn't valid. Open the full link from your most recent HRUNA email, or fill in the form again to get a new one.",
  // With Supabase's default template the address is confirmed before the browser even arrives here,
  // so signing in is usually all that's left — say that first.
  "different-browser":
    "That confirmation link was opened in a different browser from the one where the account was created. Your email address is probably confirmed already — try signing in. If sign-in says it isn't, open the link in the same browser where the account was created, or fill in the form again to get a new link.",
};

export function confirmationErrorMessage(reason: string | string[] | null | undefined): string | null {
  const value = Array.isArray(reason) ? reason[0] : reason;
  // Own keys only — `in` would also match inherited names like "toString" from the URL.
  return value && Object.prototype.hasOwnProperty.call(MESSAGES, value) ? MESSAGES[value as ConfirmationErrorReason] : null;
}
