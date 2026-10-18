"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { Field, Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { PASSWORD_HINT, validatePassword } from "@/lib/auth/password";
import { confirmationErrorMessage } from "@/lib/auth/confirm-errors";

// What the signup API's `code` means for the next step (app/api/auth/signup/route.ts).
type SignupIssue = "email_exists" | "confirmation_pending" | null;

// Collects Full Name + Email + Password + Confirm Password, then posts to
// app/api/auth/signup/route.ts, which calls Supabase's real signUp() — no session is created here;
// the visitor lands on /verify-email and only gets a session once they click the confirmation link
// Supabase emails them (app/auth/confirm/route.ts).
// `notice` is a server-supplied message, e.g. why an email-confirmation link failed
// (app/create-account/page.tsx reads ?error= and maps it via lib/auth/confirm-errors.ts).
export function CreateAccountForm({ notice, adminEmail = null }: { notice?: string | null; adminEmail?: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<SignupIssue>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(notice ?? null);

  // Supabase's default template reports a failed confirmation link (expired / already used) only in the
  // URL fragment, which survives /auth/confirm's redirect to this page. Only the error code is read.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = hash.get("error_code") ?? hash.get("error");
    if (!code) return;
    setLinkNotice(confirmationErrorMessage(code === "otp_expired" ? "expired" : "invalid-link"));
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  // This page ALWAYS shows the registration form — it never checks the session on load and never
  // navigates by itself (that used to send a signed-in admin straight to /admin). Nothing is sent
  // until the user submits. Registering works even if this browser is already signed in (e.g. an
  // admin registering someone else): the signup API uses an isolated client that cannot replace
  // or change the current session (app/api/auth/signup/route.ts), so that session stays as it is.
  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name) next.name = "Enter your full name.";
    if (!form.email) next.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Enter a valid email address.";
    const passwordError = validatePassword(form.password);
    if (passwordError) {
      next.password = passwordError;
    } else if (form.password !== form.confirmPassword) {
      next.confirmPassword = "Passwords do not match.";
    }
    if (!agreed) next.agreed = "Please accept the Terms & Conditions.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    setIssue(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "email_exists" || data.code === "confirmation_pending") setIssue(data.code);
        throw new Error(data.message ?? "Something went wrong. Please try again.");
      }
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setErrors({ email: err instanceof Error ? err.message : "Something went wrong. Please try again." });
      setLoading(false);
    }
  };

  return (
    <AuthShell
      quote="“HRUNA gave my wedding lehenga a designer who understood exactly what I meant, sketch by sketch.”"
    >
      <p className="text-label-md text-outline mb-2">JOIN HRUNA</p>
      <h1 className="text-headline-md mb-8">Create your account</h1>
      {adminEmail && (
        <p role="status" data-testid="admin-registering" className="text-sm text-ink-variant bg-primary-container/40 rounded-md px-4 py-3 mb-6">
          You&apos;re signed in as the admin ({adminEmail}). You can register someone else here; they confirm the account from their own
          email, and you stay signed in as the admin.
        </p>
      )}
      {linkNotice && (
        <p role="alert" className="text-sm text-error bg-error-container/40 rounded-md px-4 py-3 mb-6">
          {linkNotice}
        </p>
      )}
      {issue === "email_exists" && (
        <div className="flex gap-4 text-sm mb-6" data-testid="email-exists-actions">
          <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          <Link href="/forgot-password" className="text-primary font-medium hover:underline">Reset your password</Link>
        </div>
      )}
      {issue === "confirmation_pending" && (
        <div className="text-sm mb-6" data-testid="confirmation-pending-actions">
          <Link href={`/verify-email?email=${encodeURIComponent(form.email)}`} className="text-primary font-medium hover:underline">
            Resend the confirmation email
          </Link>
        </div>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Full name" htmlFor="name" required error={errors.name}>
          <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email address" htmlFor="email" required error={errors.email}>
          <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password" required error={errors.password} hint={PASSWORD_HINT}>
          <PasswordInput
            id="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" required error={errors.confirmPassword}>
          <PasswordInput
            id="confirmPassword"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <p className="text-xs text-outline -mt-2">
          Create your password to secure your HRUNA account.
        </p>
        <label className="flex items-start gap-2 text-sm text-ink-variant">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
          <span>
            I agree to HRUNA&apos;s{" "}
            <Link href="/terms" className="text-primary hover:underline" target="_blank">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.agreed && <p className="text-xs text-error -mt-3">{errors.agreed}</p>}
        <Button type="submit" className="w-full mt-2" disabled={loading}>
          {loading ? "Creating account…" : "Create Account"}
        </Button>
      </form>
      <p className="text-sm text-ink-variant mt-8 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
