"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Info, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/use-toast";
import { loadRazorpayScript } from "@/components/subscription/SubscriptionPageContent";
import { formatCurrency, cn } from "@/lib/utils";
import { PLAN_NAMES, formatLimit, type DesignerPlanKey, type PlanLimits } from "@/lib/subscriptions/plans";

// The designer's plans page: the three plans, what they're on now, their usage against it, the
// one-time Designer Pro trial, and checkout for paid plans through the existing Razorpay flow
// (/api/payments/checkout → Checkout.js → /api/payments/verify). Everything shown comes from
// GET /api/designer/plan; nothing here grants anything — the server and database decide.

interface PlanRow {
  planKey: DesignerPlanKey;
  name: string;
  price: number;
  currency: string;
  description: string;
  features: string[];
  limits: PlanLimits;
}
interface PlanData {
  plansActive: boolean;
  plans: PlanRow[];
  current: { planKey: DesignerPlanKey; isTrial: boolean; endsAt: string | null };
  limits: PlanLimits;
  usage: { dresses: number; collections: number; previous_creations: number; proposals_this_month: number };
  trial: { days: number; eligible: boolean; used: boolean };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function DesignerPlansView() {
  const { push } = useToast();
  const [data, setData] = useState<PlanData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/designer/plan");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.message ?? "Couldn't load your plan.");
      return;
    }
    setData(json);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const startTrial = async () => {
    if (busy) return;
    setBusy("trial");
    try {
      const res = await fetch("/api/designer/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start_trial" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Couldn't start the trial.");
      push(`Your Designer Pro trial is on until ${fmtDate(json.trial.endsAt)}.`, "success");
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't start the trial.", "error");
    } finally {
      setBusy(null);
    }
  };

  const choose = async (planKey: DesignerPlanKey) => {
    if (busy) return;
    setBusy(planKey);
    try {
      const res = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "designer", planKey }) });
      const checkout = await res.json();
      if (!res.ok) throw new Error(checkout.message ?? "Couldn't start checkout.");
      if (!(await loadRazorpayScript()) || !window.Razorpay) throw new Error("Couldn't load the payment checkout. Please try again.");
      new window.Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "HRUNA STUDIO",
        description: checkout.planName,
        theme: { color: "#9C5347" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verify = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) });
          const v = await verify.json().catch(() => ({}));
          if (verify.ok) push("Payment received — your plan is active.", "success");
          else push(v.message ?? "We couldn't verify that payment. Contact support if you were charged.", "error");
          setBusy(null);
          await load();
        },
        modal: { ondismiss: () => setBusy(null) },
      }).open();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't start checkout.", "error");
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy("cancel");
    try {
      const res = await fetch("/api/payments/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "designer" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Couldn't cancel your plan.");
      push("Your plan was cancelled. You're on Free — nothing you created was removed.", "info");
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't cancel your plan.", "error");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-center text-ink-variant py-24" role="alert">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
        <Loader2 className="animate-spin" size={18} /> Loading your plan…
      </div>
    );
  }

  const { current, usage, limits } = data;
  const onPaid = current.planKey !== "designer_free" && !current.isTrial;
  const usageRows: [string, number, number | null][] = [
    ["Dress listings", usage.dresses, limits.dresses],
    ["Collections", usage.collections, limits.collections],
    ["Previous creations", usage.previous_creations, limits.previous_creations],
    ["Proposals this month", usage.proposals_this_month, limits.proposals_per_month],
  ];

  return (
    <div data-testid="designer-plans">
      <p className="text-label-md text-outline mb-2">HRUNA STUDIO</p>
      <h1 className="text-headline-md">Your plan</h1>
      <p className="text-ink-variant text-sm mt-2" data-testid="current-plan">
        You&apos;re on <span className="text-ink font-medium">{PLAN_NAMES[current.planKey]}</span>
        {current.isTrial && current.endsAt ? ` — free trial until ${fmtDate(current.endsAt)}` : onPaid && current.endsAt ? ` until ${fmtDate(current.endsAt)}` : ""}.
        {" "}Verification and approval apply on every plan, and customers always use HRUNA for free.
      </p>

      {!data.plansActive && (
        <div className="flex gap-3 items-start bg-primary-container/40 rounded-md px-4 py-3 mt-6 text-sm text-ink-variant" data-testid="plans-inactive">
          <Info size={18} className="shrink-0 mt-0.5 text-primary" aria-hidden />
          <p>Plans aren&apos;t switched on yet, so no limits apply and paid plans can&apos;t be bought. The limits below take effect once HRUNA turns plans on.</p>
        </div>
      )}

      {data.trial.eligible && (
        <div className="mt-6 rounded-md border border-primary/20 bg-surface-lowest p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between" data-testid="trial-offer">
          <div>
            <p className="font-medium text-ink flex items-center gap-2"><Sparkles size={16} className="text-primary" aria-hidden /> Try Designer Pro free for {data.trial.days} days</p>
            <p className="text-sm text-ink-variant mt-1">No payment details needed and nothing is charged when it ends — you simply move to Free, and everything you&apos;ve created stays.</p>
          </div>
          <Button onClick={startTrial} disabled={busy !== null} data-testid="start-trial">{busy === "trial" ? "Starting…" : "Start free trial"}</Button>
        </div>
      )}

      <section className="mt-8" aria-label="Your usage">
        <h2 className="text-headline-sm mb-3">Your usage</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {usageRows.map(([label, used, limit]) => (
            <div key={label} className="bg-surface-lowest border border-primary/10 rounded-md p-4" data-testid="usage-item">
              <p className="text-xs text-ink-variant">{label}</p>
              <p className="text-lg font-semibold text-ink mt-1">
                {used.toLocaleString("en-IN")} <span className="text-sm font-normal text-outline">/ {data.plansActive ? formatLimit(limit) : "no limit yet"}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-outline mt-2">Proposals count per calendar month (India Standard Time). Going over a lower plan&apos;s limits never removes anything — it only pauses adding more.</p>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Plans">
        {data.plans.map((plan) => {
          const isCurrent = plan.planKey === current.planKey;
          return (
            <div key={plan.planKey} className={cn("bg-surface-lowest border rounded-md p-5 flex flex-col", isCurrent ? "border-primary" : "border-primary/10")} data-testid={`plan-${plan.planKey}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-body text-base font-medium text-ink">{plan.name}</h3>
                {isCurrent && <span className="text-[11px] font-medium text-primary bg-primary-container rounded-full px-2 py-0.5">{current.isTrial ? "Trial" : "Current"}</span>}
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">{formatCurrency(plan.price, plan.currency)}<span className="text-sm font-normal text-outline">/month</span></p>
              <p className="text-sm text-ink-variant mt-1">{plan.description}</p>
              <ul className="mt-4 flex flex-col gap-1.5 text-sm text-ink-variant flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check size={15} className="text-primary shrink-0 mt-0.5" aria-hidden />{f}</li>
                ))}
              </ul>
              {plan.price > 0 && data.plansActive && !(isCurrent && onPaid) && !onPaid && (
                <Button className="mt-5 w-full" onClick={() => choose(plan.planKey)} disabled={busy !== null}>
                  {busy === plan.planKey ? "Opening checkout…" : `Choose ${plan.name}`}
                </Button>
              )}
              {isCurrent && onPaid && (
                <Button variant="secondary" className="mt-5 w-full" onClick={cancel} disabled={busy !== null}>
                  {busy === "cancel" ? "Cancelling…" : "Cancel plan (back to Free)"}
                </Button>
              )}
            </div>
          );
        })}
      </section>

      <p className="text-xs text-outline mt-6">
        Paid plans are a one-month purchase with no automatic renewal. To change plans, cancel first (takes effect immediately).{" "}
        <Link href="/designer/home" className="text-primary hover:underline">Back to your studio</Link>
      </p>
    </div>
  );
}
