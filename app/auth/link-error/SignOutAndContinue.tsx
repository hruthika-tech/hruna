"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

// Signs out the account this browser is currently using (this browser only — its other devices and its
// data are untouched), then opens sign-in for the other one.
export function SignOutAndContinue({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "local" }),
        }).catch(() => undefined);
        window.location.assign("/login");
      }}
    >
      {busy ? "Signing out…" : label}
    </Button>
  );
}
