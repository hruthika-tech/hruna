/**
 * Landing route for signup-confirmation, email-change and password-recovery links.
 *
 * WHICH FLOW a link belongs to comes only from the link itself (lib/auth/auth-flows.ts): the explicit
 * `flow` marker HRUNA puts on every redirect URL, or the token's `type` from the repo's token_hash
 * templates — never from account metadata. A link whose `flow` and `type` disagree is rejected without
 * consuming its token. Each flow reports failures on its own page:
 *   signup → /create-account?error=…   email_change → /account/email?status=…   recovery → /reset-password
 * and anything unrecognisable → /auth/link-error.
 *
 * Two link shapes are verified here:
 *   - token_hash + type (repo templates, supabase/templates/*.html): verifyOtp() server-side. Needs no
 *     browser state, so it works when the email is opened in a different browser or device.
 *   - ?code= (Supabase's DEFAULT templates, which the hosted project uses unless replaced): Supabase
 *     verified the token itself and redirected here; exchanging the code needs the PKCE code-verifier
 *     cookie from the browser that started the flow, so it only works in that browser.
 * Success is decided from the account Supabase returns (email_confirmed_at, new_email), not from the URL.
 *
 * ACCOUNT SWITCH. A browser can only hold one signed-in account, and a link must never silently replace
 * it. So a SIGNUP link opened while some account is signed in here (e.g. a designer who just registered a
 * separate customer account) is not used yet: GET sends the browser to /auth/switch-account, which says
 * who is signed in and offers "sign out and continue". That button POSTs the same link parameters back
 * here (same-origin only); POST verifies the link, and only if that succeeds revokes this browser's old
 * session and installs the new account's. The old account itself is untouched — just signed out here.
 * Other flows that turn out to belong to a different account than the signed-in one take effect without
 * replacing the session (/auth/link-error?reason=other-session explains).
 *
 * Any `next`/redirect parameter on the link is ignored (no open redirects); destinations are fixed here.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { supabaseConfig } from "@/lib/supabase/config";
import type { ConfirmationErrorReason } from "@/lib/auth/confirm-errors";
import { pickLinkParams, resolveAuthFlow, switchAccountPath, type AuthFlow, type LinkErrorReason } from "@/lib/auth/auth-flows";

export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
const VERIFIER_COOKIE = /-code-verifier$/;
const isLoopback = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

/**
 * Every Supabase call here must reach Supabase: Next.js 14 can serve a fetch made inside a route
 * handler from its Data Cache, which would replay a one-time link's earlier SUCCESSFUL verification
 * instead of rejecting the reused token.
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * Redirect target on the host the link was actually opened on. Next.js can report request.url as
 * `localhost` for a request made to 127.0.0.1, and cookies are per host — redirecting across them would
 * drop the session this route just set. Only the request's own host, the configured site host, or a
 * loopback alias of a loopback request is ever used.
 */
function sameHostUrl(request: NextRequest, path: string): URL {
  const url = new URL(path, request.url);
  const header = request.headers.get("host");
  if (!header) return url;
  try {
    const requested = new URL(`${url.protocol}//${header}`);
    const siteHost = new URL(supabaseConfig.siteUrl()).host;
    if (requested.host === siteHost || (isLoopback(requested.hostname) && isLoopback(url.hostname))) url.host = requested.host;
  } catch {
    // Malformed Host header — keep Next's own URL.
  }
  return url;
}

/** The account-switch POST must come from HRUNA's own page (blocks cross-site "log in as me" posts). */
function isSameOriginPost(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const originHost = new URL(origin).host;
    return originHost === host || originHost === new URL(supabaseConfig.siteUrl()).host;
  } catch {
    return false;
  }
}

/** Verifies links without seeing this browser's session; collects the cookies Supabase wants to set. */
function createLinkClient(request: NextRequest) {
  const pending: CookieToSet[] = [];
  const client = createServerClient<Database>(supabaseConfig.url(), supabaseConfig.anonKey(), {
    global: { fetch: noStoreFetch },
    cookies: {
      getAll: () => request.cookies.getAll().filter((c) => VERIFIER_COOKIE.test(c.name)),
      setAll: (cookies) => {
        pending.push(...cookies);
      },
    },
  });
  return { client, pending };
}

/** A client over this browser's CURRENT session that never writes cookies itself. */
function createSessionReader(request: NextRequest) {
  return createServerClient<Database>(supabaseConfig.url(), supabaseConfig.anonKey(), {
    global: { fetch: noStoreFetch },
    cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
  });
}

/** The user this browser is currently signed in as, read without refreshing or writing any cookie. */
async function currentUserId(request: NextRequest): Promise<string | null> {
  if (!request.cookies.getAll().some((c) => SESSION_COOKIE.test(c.name))) return null;
  const { data } = await createSessionReader(request).auth.getUser();
  return data.user?.id ?? null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return handleLink(request, (name) => searchParams.get(name), { switching: false });
}

/** "Sign out and continue" from /auth/switch-account. */
export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) return NextResponse.json({ status: "error", message: "Forbidden" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const get = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  return handleLink(request, get, { switching: true });
}

async function handleLink(request: NextRequest, get: (name: string) => string | null, { switching }: { switching: boolean }) {
  const tokenHash = get("token_hash");
  const code = get("code");
  const type = get("type");
  // A POST (form) answers 303 so the browser follows with GET.
  const status = switching ? 303 : 307;

  const redirectTo = (path: string) => NextResponse.redirect(sameHostUrl(request, path), status);
  const linkError = (reason: LinkErrorReason, flow?: AuthFlow) =>
    redirectTo(`/auth/link-error?reason=${reason}${flow ? `&flow=${flow}` : ""}`);
  // Only short, known codes are forwarded — never Supabase's free-text description.
  const signupError = (reason: ConfirmationErrorReason) => redirectTo(`/create-account?error=${reason}`);
  const emailChangeError = (state: "expired" | "invalid" | "different-browser") => redirectTo(`/account/email?status=${state}`);
  const recoveryError = (errorCode: string) =>
    redirectTo(`/reset-password?error_code=${encodeURIComponent(errorCode.replace(/[^a-z_]/gi, "").slice(0, 40))}`);

  const resolved = resolveAuthFlow({ flow: get("flow"), type, hasMessage: get("message") !== null });
  if (!resolved.ok) return linkError(resolved.reason);
  const flow = resolved.flow;
  // The switch step exists only for signup links.
  if (switching && flow !== "signup") return linkError("unknown");

  /**
   * Writes the link's session cookies. Normally only if this browser has no session or the SAME
   * user's; when switching (the user chose to), the old session is revoked first and replaced.
   */
  const finish = async (path: string, linkUser: User | null, pending: CookieToSet[]) => {
    const current = switching ? null : await currentUserId(request);
    const otherAccount = current !== null && linkUser !== null && current !== linkUser.id;
    const response = redirectTo(otherAccount ? `/auth/link-error?reason=other-session&flow=${flow}` : path);
    const writesSession = !otherAccount && pending.some((c) => SESSION_COOKIE.test(c.name) && c.value);
    if (switching && writesSession) {
      // End the previous account's session in THIS browser only (its other devices stay signed in).
      await createSessionReader(request).auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    for (const c of pending) {
      if (otherAccount && SESSION_COOKIE.test(c.name)) continue;
      response.cookies.set(c.name, c.value, c.options);
    }
    if (writesSession) {
      // Chunks of a previous session that the new cookies don't overwrite would corrupt it.
      const written = new Set(pending.map((c) => c.name));
      for (const c of request.cookies.getAll()) {
        if (SESSION_COOKIE.test(c.name) && !written.has(c.name)) response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
      }
    }
    return response;
  };

  // Supabase-reported failure forwarded as query params (e.g. ?error=access_denied&error_code=otp_expired).
  // Hash-fragment errors never reach the server; the flow's landing page reads those itself.
  const urlErrorCode = get("error_code") ?? get("error");
  if (urlErrorCode) {
    if (flow === "recovery") return recoveryError(urlErrorCode);
    if (flow === "email_change") return emailChangeError(urlErrorCode === "otp_expired" ? "expired" : "invalid");
    return signupError(urlErrorCode === "otp_expired" ? "expired" : "invalid-link");
  }

  // Recovery is completed by /reset-password itself, so that page can tell a genuine recovery apart
  // from an ordinary signed-in session (ResetPasswordFlow.tsx). Tokens/codes are forwarded unconsumed.
  if (flow === "recovery") {
    if (tokenHash) return redirectTo(`/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
    if (code) return redirectTo(`/reset-password?code=${encodeURIComponent(code)}`);
    return recoveryError("invalid_link");
  }

  const { client, pending } = createLinkClient(request);
  const codeFailure = (errorCode: string | undefined) =>
    errorCode === "pkce_code_verifier_not_found" ? "different-browser"
    : errorCode === "flow_state_expired" || errorCode === "flow_state_not_found" || errorCode === "otp_expired" ? "expired"
    : "invalid";

  if (flow === "email_change") {
    // Secure email change: one link goes to the current address and one to the new one; the switch
    // happens once both are confirmed. Done = Supabase returned a session whose user has no change left.
    const outcome = (user: User | null, hasSession: boolean) =>
      `/account/email?status=${hasSession && user && !user.new_email ? "changed" : "confirm-other"}`;
    if (tokenHash) {
      const { data, error } = await client.auth.verifyOtp({ type: "email_change", token_hash: tokenHash });
      if (error) return emailChangeError(error.code === "otp_expired" ? "expired" : "invalid");
      const user = data.session?.user ?? data.user ?? null;
      return finish(outcome(user, !!data.session), user, pending);
    }
    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) return emailChangeError(codeFailure(error.code));
      return finish(outcome(data.user, !!data.session), data.user, pending);
    }
    // Default template, first of the two links: Supabase verified it and sent only ?message=.
    if (get("message")) return redirectTo("/account/email?status=confirm-other");
    return emailChangeError("invalid");
  }

  // flow === "signup"
  if (!tokenHash && !code) return signupError("invalid-link");
  // A signup link always belongs to a NEW account, never to whoever is signed in here — so with any
  // session present, hold the link (unused) and let the user decide on /auth/switch-account.
  if (!switching && (await currentUserId(request)) !== null) return redirectTo(switchAccountPath(pickLinkParams(get)));

  let user: User | null = null;
  if (tokenHash) {
    const { data, error } = await client.auth.verifyOtp({ type: (type ?? "signup") as EmailOtpType, token_hash: tokenHash });
    if (error) return signupError(error.code === "otp_expired" ? "expired" : "invalid-link");
    user = data.session?.user ?? data.user ?? null;
  } else if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      const reason = codeFailure(error.code);
      return signupError(reason === "invalid" ? "invalid-link" : reason);
    }
    // auth-js returns `redirectType` at runtime ("recovery" for a resetPasswordForEmail verifier), but
    // its published type omits it. A recovery code that reached the signup flow is not a signup.
    if ((data as { redirectType?: string | null }).redirectType === "recovery") return linkError("mismatch");
    user = data.user;
  }

  // Trust Supabase's account state, not the link: only a confirmed address counts as a confirmed signup.
  if (!user?.email_confirmed_at) return signupError("invalid-link");
  // Accounts registered with a password go straight to role selection; any other identity (e.g. an
  // invited account) still has to choose one first.
  const destination = user.user_metadata?.password_set === true ? "/choose-role?confirmed=signup" : "/setup-password";
  return finish(destination, user, pending);
}
