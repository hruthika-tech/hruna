"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// Fixed messages for the ?status= set by app/auth/confirm/route.ts — never Supabase's own text.
// "changed" is deliberately absent: success is only shown once the live session confirms it (below).
const STATUS_MESSAGES: Record<string, { tone: "ok" | "error"; text: string }> = {
  "confirm-other": {
    tone: "ok",
    text: "Link confirmed. To finish, open the confirmation link we sent to your other email address (both your current and your new address get one).",
  },
  expired: { tone: "error", text: "That link has expired or was already used. Request the change again below." },
  invalid: { tone: "error", text: "That link isn't valid. Open the full link from your most recent HRUNA email, or request the change again." },
  "different-browser": {
    tone: "error",
    text: "That confirmation link has to be opened in the same browser you used to request the change. Open it there, or request the change again below.",
  },
};
const INCOMPLETE = "Your email change isn't complete yet. Open the confirmation link we sent to your other email address to finish.";

interface SessionState {
  authenticated: boolean;
  email?: string | null;
  pendingEmail?: string | null;
  hasDesignerProfile?: boolean;
  hasCustomerProfile?: boolean;
}

export function EmailChangePanel({ status }: { status: string | null }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState<string | null>(null);
  const [hashStatus, setHashStatus] = useState<string | null>(null);

  useEffect(() => {
    // Supabase's default template reports a failed link (expired, already used) only in the URL
    // fragment, which the browser keeps across /auth/confirm's redirect. Only the code is read.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error_code") || hash.get("error")) {
      setHashStatus(hash.get("error_code") === "otp_expired" ? "expired" : "invalid");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        setSession(await res.json());
      } catch {
        setSession({ authenticated: false });
      }
    })();
  }, []);

  const effectiveStatus = hashStatus ?? status;
  const notice =
    effectiveStatus && Object.prototype.hasOwnProperty.call(STATUS_MESSAGES, effectiveStatus) ? STATUS_MESSAGES[effectiveStatus] : null;
  // Success is claimed only when Supabase itself (the live session, via getUser) shows the change done.
  const changed = effectiveStatus === "changed" && !!session?.authenticated && !session.pendingEmail;
  const incomplete = effectiveStatus === "changed" && !!session?.authenticated && !!session.pendingEmail;
  const profileHref = session?.hasDesignerProfile ? "/designer/profile" : session?.hasCustomerProfile ? "/profile" : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't start the email change. Please try again.");
      setRequested(data.pendingEmail ?? email.trim());
      setSession((s) => (s ? { ...s, pendingEmail: data.pendingEmail ?? email.trim() } : s));
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the email change. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 py-8">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center text-primary">
          <Mail size={24} />
        </div>
        <p className="text-label-md text-outline">ACCOUNT EMAIL</p>
        <h1 className="text-headline-sm">{changed ? "Email address updated" : "Change your email address"}</h1>
      </div>

      {notice && (
        <p role="status" className={`text-sm text-center ${notice.tone === "error" ? "text-error" : "text-ink-variant"}`}>
          {notice.text}
        </p>
      )}
      {incomplete && (
        <p role="status" className="text-sm text-center text-ink-variant">
          {INCOMPLETE}
        </p>
      )}

      {session === null ? null : changed ? (
        <div className="flex flex-col items-center gap-3 text-center" data-testid="email-changed">
          <p role="status" className="text-sm text-ink font-medium">
            Email address updated and verified successfully.
          </p>
          <p className="text-sm text-ink-variant">
            Your account email is now <span className="text-ink font-medium" data-testid="current-email">{session.email}</span>. Use it the
            next time you sign in.
          </p>
          {profileHref && (
            <Link href={profileHref} className="text-sm text-primary hover:underline">Back to your profile →</Link>
          )}
        </div>
      ) : !session.authenticated ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-ink-variant max-w-xs">Sign in to see or change your account email.</p>
          <Link href="/login" className="text-sm text-primary hover:underline">Sign in →</Link>
        </div>
      ) : (
        <>
          <div className="text-sm text-center">
            <p className="text-ink-variant">Current email</p>
            <p className="text-ink font-medium" data-testid="current-email">{session.email}</p>
            {session.pendingEmail && (
              <p className="text-ink-variant mt-3" data-testid="pending-email">
                Waiting for confirmation: <span className="text-ink font-medium">{session.pendingEmail}</span>
              </p>
            )}
          </div>

          {requested && (
            <p role="status" className="text-sm text-center text-ink-variant">
              We sent confirmation links to your current address and to {requested}. Your email changes once you&apos;ve
              opened both. Until then, keep signing in with your current address.
            </p>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="New email address" htmlFor="new-email" error={error || undefined}>
              <Input id="new-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Button type="submit" disabled={sending || !email.trim()}>
              {sending ? "Sending…" : "Send confirmation links"}
            </Button>
          </form>
          <p className="text-xs text-outline text-center">
            Only your sign-in address changes — your profile, studio, projects and messages stay exactly as they are.
          </p>
        </>
      )}
    </div>
  );
}
