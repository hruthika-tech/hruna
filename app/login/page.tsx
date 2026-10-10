"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { safeNextPath } from "@/lib/auth/safe-redirect";

// Password sign-in, via app/api/auth/login/route.ts's supabase.auth.signInWithPassword() call —
// replaces the old email-OTP request+verify flow. `?next=` is preserved from before (set by
// middleware when redirecting an unauthenticated visitor away from a protected page). useSearchParams
// requires a Suspense boundary to avoid opting the whole route out of static rendering at build time.
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only same-site relative paths — anything else (absolute URLs, //host, /\host…) becomes /home.
  const next = safeNextPath(searchParams.get("next"));
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Something went wrong. Please try again.");
      router.push(data.redirectTo ?? next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <>
      <p className="text-label-md text-outline mb-2">WELCOME BACK</p>
      <h1 className="text-headline-md mb-8">Sign in to HRUNA</h1>
      {/* Set by app/reset-password/ResetPasswordFlow.tsx after a successful password reset. */}
      {searchParams.get("reset") === "success" && (
        <p className="text-sm text-primary -mt-4 mb-6" role="status">
          Your password has been updated. Sign in with your new password.
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field label="Email address" htmlFor="email" required error={error && !form.password ? error : undefined}>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Password" htmlFor="password" required error={error && form.password ? error : undefined}>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Link href="/forgot-password" className="text-sm text-primary hover:underline -mt-2 self-end">
          Forgot password?
        </Link>
        <Button type="submit" className="w-full mt-2" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </form>
      <p className="text-sm text-ink-variant mt-8 text-center">
        New to HRUNA?{" "}
        <Link href="/create-account" className="text-primary font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
