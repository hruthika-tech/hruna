"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { PASSWORD_HINT, validatePasswordConfirmation } from "@/lib/auth/password";

// Used by app/setup-password/page.tsx (fresh signup, just verified): POSTs the new password to
// /api/auth/set-password, which calls supabase.auth.updateUser({ password }). Password recovery has
// its own flow (app/reset-password/ResetPasswordFlow.tsx), since it must first establish the
// recovery session from the email link in the browser.
export function PasswordForm({
  heading,
  description,
  submitLabel = "Continue",
  onSuccessRedirect,
}: {
  heading: string;
  description: string;
  submitLabel?: string;
  onSuccessRedirect: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientError = validatePasswordConfirmation(password, confirmPassword);
    if (clientError) {
      setErrors({ confirmPassword: clientError });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Something went wrong. Please try again.");
      router.push(onSuccessRedirect);
    } catch (err) {
      setErrors({ password: err instanceof Error ? err.message : "Something went wrong. Please try again." });
      setLoading(false);
    }
  };

  return (
    <>
      <p className="text-label-md text-outline mb-2">{heading.toUpperCase()}</p>
      <h1 className="text-headline-md mb-3">{heading}</h1>
      <p className="text-sm text-ink-variant mb-8">{description}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Password" htmlFor="password" required error={errors.password} hint={PASSWORD_HINT}>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" required error={errors.confirmPassword}>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" className="w-full mt-2" disabled={loading}>
          {loading ? "Saving…" : submitLabel}
        </Button>
      </form>
    </>
  );
}
