"use client";

import { useState } from "react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button, LinkButton } from "@/components/ui/Button";

// Shown on /create-account instead of the form while a customer/designer is signed in: one browser holds
// one account, so creating a separate one starts with signing this one out (here only — its other devices
// and all of its data are untouched). Then the empty registration form opens.
export function AccountSwitchPanel({ email, role, home }: { email: string; role: string | null; home: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOutAndContinue = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "local" }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError("We couldn't sign you out. Please try again.");
      return;
    }
    // Full navigation, so nothing from the previous account's page state survives.
    window.location.assign("/create-account");
  };

  return (
    <AuthShell>
      <div data-testid="account-switch">
        <p className="text-label-md text-outline mb-2">CREATE A NEW ACCOUNT</p>
        <h1 className="text-headline-md mb-3">You&apos;re signed in</h1>
        <p className="text-sm text-ink-variant mb-4">
          This browser is signed in as <span className="text-ink font-medium" data-testid="signed-in-email">{email}</span>
          {role ? ` (${role})` : ""}.
        </p>
        <p className="text-sm text-ink-variant mb-8">
          To create a separate HRUNA account with a different email, sign out first. Your {role ?? "current"} account and everything in it
          stay exactly as they are — you can sign back in to it any time.
        </p>
        {error && (
          <p role="alert" className="text-sm text-error mb-4">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Button className="w-full" onClick={signOutAndContinue} disabled={busy} data-testid="signout-create">
            {busy ? "Signing out…" : "Sign out and create a new account"}
          </Button>
          <LinkButton href={home} variant="secondary" className="w-full">
            Back to my account
          </LinkButton>
        </div>
      </div>
    </AuthShell>
  );
}
