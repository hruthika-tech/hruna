"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { PASSWORD_HINT, validatePasswordConfirmation } from "@/lib/auth/password";
import { useToast } from "@/hooks/use-toast";

// Settings > Security's real Change Password card — replaces the old stale "HRUNA uses
// passwordless email sign-in" copy now that the app is on real Supabase email+password auth.
// Posts to app/api/auth/change-password/route.ts, which reauthenticates with the current password
// before accepting a new one.
export function ChangePasswordCard() {
  const { push } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.currentPassword) next.currentPassword = "Enter your current password.";
    const passwordError = validatePasswordConfirmation(form.newPassword, form.confirmPassword);
    if (passwordError) next.confirmPassword = passwordError;
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't change your password.");
      push("Password updated.", "success");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setErrors({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't change your password.";
      // "Current password is incorrect." is the one message worth anchoring to its field; every
      // other failure (weak password, rate limit, etc.) reads fine as a form-level error.
      setErrors(/current password/i.test(message) ? { currentPassword: message } : { newPassword: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 rounded-md border border-outline-variant">
      <p className="text-sm font-medium mb-1">Change Password</p>
      <p className="text-xs text-ink-variant mb-5">Update the password you use to sign in to HRUNA.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-sm" noValidate>
        <Field label="Current password" htmlFor="currentPassword" required error={errors.currentPassword}>
          <PasswordInput
            id="currentPassword"
            value={form.currentPassword}
            onChange={(e) => update("currentPassword", e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" htmlFor="newPassword" required error={errors.newPassword} hint={PASSWORD_HINT}>
          <PasswordInput
            id="newPassword"
            value={form.newPassword}
            onChange={(e) => update("newPassword", e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required error={errors.confirmPassword}>
          <PasswordInput
            id="confirmPassword"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" size="sm" className="w-fit" disabled={saving}>
          {saving ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </div>
  );
}
