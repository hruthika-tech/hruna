// Classifies a Supabase Auth error for the sign-in and password-reset routes (isomorphic, no
// runtime imports; unit-tested directly). The point is to tell the user the truth: "incorrect
// password" only when Supabase actually said the credentials are wrong, a rate-limit message when
// they're rate-limited, and "the sign-in service is unavailable" for database, network and
// configuration failures (a 5xx from Auth, a fetch that never reached it, an unknown error) —
// never the raw Supabase text ("Database error querying schema", SQL errors, host names).

export type AuthErrorKind = "invalid_credentials" | "email_not_confirmed" | "rate_limited" | "email_send_failed" | "unavailable" | "rejected";

interface AuthLikeError {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  message?: unknown;
}

export function classifyAuthError(error: unknown): AuthErrorKind {
  const e = (typeof error === "object" && error !== null ? error : {}) as AuthLikeError;
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const message = typeof e.message === "string" ? e.message : "";
  if (code === "invalid_credentials") return "invalid_credentials";
  if (code === "email_not_confirmed") return "email_not_confirmed";
  if (status === 429 || /rate_limit/.test(code)) return "rate_limited";
  // Supabase couldn't send the email (SMTP/provider failure). Only happens for addresses that have
  // an account, so the reset route must not reveal it to the requester.
  if (/sending (recovery|confirmation|magic link)? ?email|smtp/i.test(message)) return "email_send_failed";
  // AuthRetryableFetchError / AuthUnknownError (network, timeouts, non-JSON), any 5xx, or no status.
  if (status === 0 || status >= 500 || e.name === "AuthRetryableFetchError" || e.name === "AuthUnknownError") return "unavailable";
  return "rejected";
}

/** Fields safe to log server-side (no tokens, no email addresses, no request bodies). */
export const authErrorLogFields = (error: unknown) => {
  const e = (typeof error === "object" && error !== null ? error : {}) as AuthLikeError;
  return { name: e.name, code: e.code, status: e.status, message: typeof e.message === "string" ? e.message.slice(0, 200) : undefined };
};

export const AUTH_UNAVAILABLE_MESSAGE = "We couldn't reach the sign-in service just now. Please try again in a moment.";
export const RESET_UNAVAILABLE_MESSAGE = "We couldn't send a reset link just now. Please try again in a moment.";
export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a moment and try again.";
