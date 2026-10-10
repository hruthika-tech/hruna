"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Hourglass, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Onboarding { emailVerified: boolean; roles: string[]; portfolioItems: unknown[]; portfolioOwnershipAccepted: boolean }
interface Verification { identityStatus: string; overallStatus: string }

// Real data (Phase 7 fix) — this page used to always read the seeded mock "pending designer"
// (PENDING_DESIGNER_ID from lib/store.ts) no matter who was signed in. It now reads the CURRENT
// signed-in designer's own onboarding/verification rows via the real Phase 5 GET routes.
export default function VerificationPendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [onboardingRes, verificationRes] = await Promise.all([
          fetch("/api/designer/onboarding"),
          fetch("/api/designer/verification"),
        ]);
        const onboardingData = await onboardingRes.json();
        const verificationData = await verificationRes.json();
        if (!onboardingRes.ok) throw new Error(onboardingData.message ?? "Couldn't load your onboarding status.");
        if (!verificationRes.ok) throw new Error(verificationData.message ?? "Couldn't load your verification status.");
        setOnboarding(onboardingData.onboarding);
        setVerification(verificationData.verification);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-ink-variant text-sm">
        <Loader2 className="animate-spin" size={16} /> Loading…
      </div>
    );
  }
  if (status === "error" || !onboarding || !verification) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 text-sm text-ink-variant">
        Couldn't load your verification status. Please try again in a moment.
      </div>
    );
  }

  const checklist = [
    { label: "Account created", done: true },
    { label: "Email verified", done: onboarding.emailVerified },
    { label: "Professional profile completed", done: onboarding.roles.length > 0 },
    { label: "Portfolio submitted", done: onboarding.portfolioItems.length >= 3 && onboarding.portfolioOwnershipAccepted },
    { label: "Identity verification", done: verification.identityStatus === "verified", inProgress: verification.identityStatus === "pending" },
    { label: "Profile review", done: verification.overallStatus === "approved", inProgress: verification.overallStatus === "pending" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-16 h-16 rounded-full bg-primary-container text-primary flex items-center justify-center mb-8">
        <Hourglass size={26} />
      </div>
      <p className="text-label-md text-outline mb-3">
        {verification.overallStatus === "approved" ? "APPROVED" : "UNDER REVIEW"}
      </p>
      <h1 className="text-headline-md max-w-md mb-8">Your HRUNA profile is under review</h1>

      <div className="w-full max-w-sm flex flex-col gap-3 mb-10 text-left">
        {checklist.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                item.done ? "bg-emerald-100 text-emerald-700" : item.inProgress ? "bg-amber-100 text-amber-700" : "bg-surface-container text-outline"
              )}
            >
              {item.done ? <Check size={14} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
            </span>
            <span className={cn("text-sm", item.done ? "text-ink" : "text-ink-variant")}>{item.label}</span>
          </div>
        ))}
      </div>

      <p className="text-ink-variant max-w-sm mb-2">
        We're reviewing your profile and portfolio. You'll be notified when your verification is complete.
      </p>
      <p className="text-xs text-outline max-w-sm mb-10">
        In the meantime, feel free to complete your studio profile — it won't be visible to customers until
        verification is approved.
      </p>
      <Button onClick={() => router.push("/designer/home")}>Continue to Dashboard</Button>
    </div>
  );
}
