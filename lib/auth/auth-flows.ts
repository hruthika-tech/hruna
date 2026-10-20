/**
 * Which email-link flow a request to /auth/confirm belongs to. Isomorphic, no side effects.
 *
 * Every link HRUNA asks Supabase to send carries an explicit `flow` marker in its redirect URL
 * (authCallbackUrl below). That marker — never account metadata — is what tells the flows apart,
 * because Supabase's DEFAULT email templates return to that URL with only a PKCE `?code=` and no
 * `type`. (Guessing from user_metadata.password_set is exactly what used to send every new signup to
 * the email-change page: signup sets password_set at registration.)
 *
 *   signup        confirm a newly registered account            → role selection
 *   email_change  confirm a signed-in user's address change     → /account/email
 *   recovery      password reset                                → /reset-password
 *
 * The repo's token_hash templates (supabase/templates/*.html) carry `type` instead; both are accepted,
 * and a link whose `flow` and `type` disagree is rejected rather than handled as either.
 */

export type AuthFlow = "signup" | "email_change" | "recovery";

const AUTH_FLOWS: readonly string[] = ["signup", "email_change", "recovery"];

/** Supabase OTP `type` values (token_hash links, and the legacy `?type=email_change` tag) → flow. */
const TYPE_TO_FLOW: Record<string, AuthFlow> = {
  signup: "signup",
  email: "signup",
  invite: "signup",
  recovery: "recovery",
  email_change: "email_change",
};

/** The `emailRedirectTo` / `redirectTo` for a flow's emails. */
export function authCallbackUrl(siteUrl: string, flow: AuthFlow): string {
  return `${siteUrl.replace(/\/+$/, "")}/auth/confirm?flow=${flow}`;
}

export type FlowResolution = { ok: true; flow: AuthFlow } | { ok: false; reason: "mismatch" | "unknown" };

/**
 * Resolves the flow from the link's own parameters. Untagged links default to signup — before flow
 * markers existed, signup's emailRedirectTo was the bare /auth/confirm (email change was already
 * tagged `type=email_change`, and recovery links go to /reset-password) — except the default
 * email-change template's first link, which arrives with only an informational `?message=`.
 */
export function resolveAuthFlow(params: { flow: string | null; type: string | null; hasMessage?: boolean }): FlowResolution {
  const declared = params.flow;
  if (declared !== null && !AUTH_FLOWS.includes(declared)) return { ok: false, reason: "unknown" };
  let fromType: AuthFlow | null = null;
  if (params.type !== null) {
    if (!Object.prototype.hasOwnProperty.call(TYPE_TO_FLOW, params.type)) return { ok: false, reason: "unknown" };
    fromType = TYPE_TO_FLOW[params.type];
  }
  if (declared !== null && fromType !== null && declared !== fromType) return { ok: false, reason: "mismatch" };
  const flow = (declared as AuthFlow | null) ?? fromType ?? (params.hasMessage ? "email_change" : "signup");
  return { ok: true, flow };
}

/** Reasons shown by /auth/link-error (app/auth/link-error/page.tsx). */
export type LinkErrorReason = "mismatch" | "unknown" | "other-session";

/** The only parameters an email link may carry through the account-switch step. */
const LINK_PARAMS = ["token_hash", "type", "code", "flow"] as const;
export type LinkParams = Partial<Record<(typeof LINK_PARAMS)[number], string>>;

/** Picks the whitelisted link parameters out of a query string / form (anything else is dropped). */
export function pickLinkParams(get: (name: string) => string | null | undefined): LinkParams {
  const out: LinkParams = {};
  for (const name of LINK_PARAMS) {
    const value = get(name);
    if (typeof value === "string" && value.length > 0 && value.length <= 512) out[name] = value;
  }
  return out;
}

const query = (params: LinkParams) => new URLSearchParams(Object.entries(params) as [string, string][]).toString();

/** /auth/confirm for these link parameters (relative, so it always stays on this site). */
export function confirmPath(params: LinkParams): string {
  return `/auth/confirm?${query(params)}`;
}

/**
 * Safety net for the site root. When Supabase can't use an email's redirect_to (it isn't in the
 * project's Redirect URLs allow-list) it falls back to the bare Site URL, so a verification link
 * lands on "/?code=…" (or "/?error=…&error_code=…") and would be silently dropped by the homepage.
 * Returns the /auth/confirm path that finishes it instead, or null when the URL carries no email-link
 * parameters. Only whitelisted parameters are forwarded, to a fixed same-site path — never an open
 * redirect. An untagged code is handled as a signup by /auth/confirm (resolveAuthFlow), which still
 * rejects a recovery code ("mismatch") rather than treating it as one.
 */
export function strayEmailLinkPath(get: (name: string) => string | null | undefined): string | null {
  const params = pickLinkParams(get);
  if (params.code || params.token_hash) return confirmPath(params);
  const clean = (v: string | null | undefined) => (typeof v === "string" ? v.replace(/[^a-z_]/gi, "").slice(0, 40) : "");
  const errorCode = clean(get("error_code"));
  if (errorCode) return `/auth/confirm?error=${clean(get("error")) || "access_denied"}&error_code=${errorCode}`;
  return null;
}

/** The account-switch step for a signup link opened while another account is signed in. */
export function switchAccountPath(params: LinkParams): string {
  return `/auth/switch-account?${query(params)}`;
}
