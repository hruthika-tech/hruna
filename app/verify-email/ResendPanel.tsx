"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

const RESEND_SECONDS = 30;

const LINK_MESSAGES: Record<string, string> = {
  expired: "That verification link has expired or was already used. Request a new one below.",
  "invalid-link": "That verification link isn't valid. Request a new one below.",
  unverified: "Your email address isn't verified yet. Send yourself a new verification link below.",
};

// `email` is known right after signing up (/create-account → here). Arriving from a failed link
// (/auth/confirm → ?error=…), it usually isn't — then the panel asks for the address instead.
export function ResendPanel({ email, initialError }: { email: string; initialError?: string }) {
  const linkFailed = !!initialError && Object.prototype.hasOwnProperty.call(LINK_MESSAGES, initialError);
  const [address, setAddress] = useState(email);
  // Fresh from signup the first email is still on its way, so the button starts on a countdown;
  // after a failed link the user needs a new one now.
  const [resendIn, setResendIn] = useState(linkFailed ? 0 : RESEND_SECONDS);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState(linkFailed ? LINK_MESSAGES[initialError!] : "");

  useEffect(() => {
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // Supabase's default email template reports an expired/used link only in the URL fragment, which
  // the server never sees (it arrives here as ?error=invalid-link); read just the error code from it.
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("error_code");
    if (code === "otp_expired") setMessage(LINK_MESSAGES.expired);
  }, []);

  const handleResend = async () => {
    const target = address.trim();
    if (!target || !target.includes("@")) {
      setStatus("error");
      setMessage("Enter the email address you signed up with.");
      return;
    }
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Something went wrong. Please try again.");
      setStatus("sent");
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="flex flex-col items-center text-center gap-4 py-8">
      <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center text-primary">
        <Mail size={24} />
      </div>
      <p className="text-label-md text-outline">{linkFailed ? "VERIFY YOUR EMAIL" : "CHECK YOUR EMAIL"}</p>
      <h1 className="text-headline-sm">{linkFailed ? "Get a new verification link" : "We sent a verification link to your email address"}</h1>
      {email && <p className="text-sm text-ink font-medium">{email}</p>}
      <p className="text-sm text-ink-variant max-w-xs">
        {linkFailed
          ? "We'll email you a fresh link — it works on any device or browser."
          : "Please click the link in your email to continue creating your HRUNA account."}
      </p>

      {message && (
        <p role="alert" className={`text-xs ${status === "error" || initialError ? "text-error" : "text-outline"}`}>{message}</p>
      )}
      {!email && (
        <div className="w-full max-w-xs text-left">
          <Field label="Email address" htmlFor="resendEmail">
            <Input id="resendEmail" type="email" autoComplete="email" placeholder="you@example.com" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </div>
      )}
      {status === "sent" && !message && (
        <p className="text-xs text-outline">A new verification link is on its way.</p>
      )}

      <Button
        onClick={handleResend}
        disabled={status === "sending" || resendIn > 0}
        variant="secondary"
        className="mt-2"
      >
        {status === "sending" ? "Sending…" : resendIn > 0 ? `Resend email in ${resendIn}s` : linkFailed ? "Send a new verification email" : "Resend email"}
      </Button>

      <Link href="/create-account" className="text-sm text-primary hover:underline mt-4">
        ← Wrong email? Go back
      </Link>
    </div>
  );
}
