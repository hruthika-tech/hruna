"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field, Input } from "@/components/ui/Input";
import { Button, LinkButton } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_HINT, validatePasswordConfirmation } from "@/lib/auth/password";

/**
 * The whole password-recovery landing, in the browser — because two of the three ways a recovery
 * link can arrive are only visible here:
 *   1. /reset-password?code=…           Supabase's default template, after Supabase verified the
 *                                        token. The browser Supabase client exchanges the code on
 *                                        init (detectSessionInUrl) using the PKCE verifier cookie
 *                                        set by app/api/auth/forgot-password/route.ts, and emits
 *                                        PASSWORD_RECOVERY.
 *   2. /reset-password#error_code=…     Supabase rejected the link (expired / already used). Hash
 *                                        fragments never reach the server.
 *   3. /reset-password?token_hash=…&type=recovery   Custom template (via app/auth/confirm/route.ts,
 *                                        which forwards it unconsumed) — verified here with
 *                                        verifyOtp(), which works from any browser/device.
 *
 * The form only renders when THIS page load proved a recovery (verifyOtp succeeded, or the client
 * emitted PASSWORD_RECOVERY), or the current session's JWT `amr` records a recovery login (e.g. a
 * refresh). An ordinary signed-in session is not enough — that would let /reset-password skip the
 * current-password check Settings → Change password requires. After a successful reset every
 * session is signed out (any session an attacker might hold dies with the old password) and the
 * user signs in fresh with the new one.
 */

type State =
  | { kind: "verifying" }
  | { kind: "ready" }
  | { kind: "invalid"; reason: string }
  | { kind: "success" };

const LOGIN_AFTER_RESET = "/login?reset=success";

function invalidMessage(reason: string): string {
  if (reason === "verifier_missing") {
    return "This reset link has to be opened in the same browser you requested it from. Request a new link and open it here.";
  }
  if (reason === "missing_session") {
    return "This page needs a valid password reset link. Request a new link to continue.";
  }
  return "This password reset link has expired or has already been used. Reset links work only once and expire after a short time.";
}

/** Short error code from ?query or #hash — never the free-text description. */
function readUrlError(url: URL): string | null {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return (
    url.searchParams.get("error_code") ??
    hash.get("error_code") ??
    url.searchParams.get("error") ??
    hash.get("error")
  );
}

export function ResetPasswordFlow() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "verifying" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // One-time tokens must be consumed exactly once — React Strict Mode runs effects twice in dev,
  // and a second verifyOtp() on the same token_hash would fail with otp_expired.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const supabase = createClient();
    let signalRecovery = () => {};
    const recoveryEvent = new Promise<void>((resolve) => (signalRecovery = resolve));
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") signalRecovery();
    });

    const establish = async (): Promise<State> => {
      const url = new URL(window.location.href);

      const urlError = readUrlError(url);
      if (urlError) return { kind: "invalid", reason: urlError };

      const tokenHash = url.searchParams.get("token_hash");
      if (tokenHash && url.searchParams.get("type") === "recovery") {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        return error ? { kind: "invalid", reason: error.code ?? "otp_expired" } : { kind: "ready" };
      }

      if (url.searchParams.get("code")) {
        // The client already started exchanging the code when it was created; initialize()
        // returns that same in-flight result rather than exchanging a second time.
        const { error } = await supabase.auth.initialize();
        if (error) {
          const reason = error.name === "AuthPKCECodeVerifierMissingError" ? "verifier_missing" : error.code ?? "otp_expired";
          return { kind: "invalid", reason };
        }
        // A successful exchange of a recovery flow's code emits PASSWORD_RECOVERY (queued until
        // init settles); anything else (e.g. a signup code) is not a recovery.
        const recovered = await Promise.race([
          recoveryEvent.then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
        ]);
        return recovered ? { kind: "ready" } : { kind: "invalid", reason: "missing_session" };
      }

      // No link parameters: only a session that was itself created by a recovery link qualifies.
      const { data } = await supabase.auth.getClaims();
      const amr = (data?.claims?.amr ?? []) as Array<string | { method: string }>;
      const isRecovery = amr.some((entry) => (typeof entry === "string" ? entry : entry.method) === "recovery");
      return isRecovery ? { kind: "ready" } : { kind: "invalid", reason: "missing_session" };
    };

    establish()
      .catch(() => ({ kind: "invalid", reason: "otp_expired" }) as State)
      .then((next) => {
        // Unsubscribed here rather than in an effect cleanup: Strict Mode's simulated unmount would
        // otherwise drop the listener before PASSWORD_RECOVERY arrives, and the `started` guard
        // stops the re-run from subscribing again.
        subscription.subscription.unsubscribe();
        // Strip the one-time code/token (or error) from the address bar and history.
        window.history.replaceState(null, "", "/reset-password");
        setState(next);
      });
  }, []);

  useEffect(() => {
    if (state.kind !== "success") return;
    const timer = setTimeout(() => router.replace(LOGIN_AFTER_RESET), 3000);
    return () => clearTimeout(timer);
  }, [state.kind, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientError = validatePasswordConfirmation(password, confirmPassword);
    if (clientError) {
      setErrors(password !== confirmPassword && password ? { confirmPassword: clientError } : { password: clientError });
      return;
    }
    setErrors({});
    setLoading(true);

    const supabase = createClient();
    // password_set mirrors app/api/auth/set-password/route.ts: this identity now genuinely has a
    // user-chosen password, so /setup-password must not ask for one again.
    const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
    if (error) {
      setLoading(false);
      if (error.name === "AuthSessionMissingError") {
        setState({ kind: "invalid", reason: "missing_session" });
      } else if (error.code === "same_password") {
        setErrors({ password: "Choose a password different from your current one." });
      } else {
        setErrors({ password: error.message || "Something went wrong. Please try again." });
      }
      return;
    }

    // Revoke every session for this account, including this recovery one.
    await supabase.auth.signOut().catch(() => undefined);
    setState({ kind: "success" });
  };

  if (state.kind === "verifying") {
    return (
      <>
        <p className="text-label-md text-outline mb-2">RESET PASSWORD</p>
        <h1 className="text-headline-md mb-3">Checking your link…</h1>
        <p className="text-sm text-ink-variant">One moment while we verify your password reset link.</p>
      </>
    );
  }

  if (state.kind === "invalid") {
    return (
      <>
        <p className="text-label-md text-outline mb-2">RESET PASSWORD</p>
        <h1 className="text-headline-md mb-3">This link can&apos;t be used</h1>
        <p className="text-sm text-error mb-8" role="alert">
          {invalidMessage(state.reason)}
        </p>
        <LinkButton href="/forgot-password" className="w-full">
          Request a new reset link
        </LinkButton>
        <p className="text-sm text-ink-variant mt-8 text-center">
          <Link href="/login" className="text-primary font-medium hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </>
    );
  }

  if (state.kind === "success") {
    return (
      <>
        <p className="text-label-md text-outline mb-2">RESET PASSWORD</p>
        <h1 className="text-headline-md mb-3">Password updated</h1>
        <p className="text-sm text-ink-variant mb-8" role="status">
          Your password has been changed. Taking you to sign in with your new password…
        </p>
        <LinkButton href={LOGIN_AFTER_RESET} className="w-full">
          Continue to sign in
        </LinkButton>
      </>
    );
  }

  return (
    <>
      <p className="text-label-md text-outline mb-2">RESET PASSWORD</p>
      <h1 className="text-headline-md mb-3">Reset your password</h1>
      <p className="text-sm text-ink-variant mb-8">Choose a new password for your HRUNA account.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="New password" htmlFor="password" required error={errors.password} hint={PASSWORD_HINT}>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required error={errors.confirmPassword}>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" className="w-full mt-2" disabled={loading}>
          {loading ? "Saving…" : "Reset password"}
        </Button>
      </form>
    </>
  );
}
