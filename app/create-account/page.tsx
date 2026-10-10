"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PASSWORD_HINT, validatePassword } from "@/lib/auth/password";

// Collects Full Name + Email + Password + Confirm Password, then posts to
// app/api/auth/signup/route.ts, which calls Supabase's real signUp() — no session is created here;
// the visitor lands on /verify-email and only gets a session once they click the confirmation link
// Supabase emails them (app/auth/confirm/route.ts).
export default function CreateAccountPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // An already-authenticated visitor (e.g. an existing customer using "Become a Designer") skips
  // this form entirely — straight to /choose-role if they already have a password, or
  // /setup-password if they have a confirmed session but never set one (matches
  // app/setup-password/page.tsx's own guard and app/api/auth/session/route.ts's `passwordSet`).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        if (data.authenticated) {
          router.replace(data.passwordSet ? "/choose-role" : "/setup-password");
        }
      } catch {
        // Not authenticated (or the check failed) — stay on this page, normal signup applies.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (!res.ok) throw new Error(data.message ?? "Something went wrong. Please try again.");
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
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Full name" htmlFor="name" required error={errors.name}>
          <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email address" htmlFor="email" required error={errors.email}>
          <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password" required error={errors.password} hint={PASSWORD_HINT}>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" required error={errors.confirmPassword}>
          <Input
            id="confirmPassword"
            type="password"
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
