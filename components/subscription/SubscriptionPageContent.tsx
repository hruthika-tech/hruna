"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ShieldCheck, Loader2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SubscriberRole } from "@/types";
import type { SubscriptionSummary } from "@/lib/subscription-access";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Real Razorpay checkout (Phase 8) — `summary` is resolved server-side for the REAL signed-in user
// (see lib/subscription-access.ts) on every page load/router.refresh(). The frontend is never the
// final authority for payment success: Checkout's own success callback is only ever used to POST
// razorpay_order_id/payment_id/signature to /api/payments/verify, and the UI only shows "active"
// once that server call returns — never merely because Checkout.js reported success.
export function SubscriptionPageContent({
  role,
  summary,
  brandLabel,
  backHref,
}: {
  role: SubscriberRole;
  summary: SubscriptionSummary;
  brandLabel: string;
  backHref: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<"checkout" | "verifying" | "cancelling" | null>(null);
  const { enforced, plan, subscription } = summary;
  const isActive = subscription?.status === "active";

  const handleSubscribe = async () => {
    if (busy) return; // prevents a double-click opening two checkouts / creating two orders
    setBusy("checkout");
    try {
      const checkoutRes = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkoutData.message ?? "Couldn't start checkout.");

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) throw new Error("Couldn't load the payment checkout. Please try again.");

      const razorpay = new window.Razorpay({
        key: checkoutData.keyId,
        order_id: checkoutData.orderId,
        amount: checkoutData.amount,
        currency: checkoutData.currency,
        name: brandLabel,
        description: checkoutData.planName,
        theme: { color: "#9C5347" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setBusy("verifying");
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.message ?? "We couldn't verify that payment.");
            push("Subscribed! Your plan is now active.", "success");
            router.refresh();
          } catch (err) {
            push(err instanceof Error ? err.message : "We couldn't verify that payment. Contact support if you were charged.", "error");
          } finally {
            setBusy(null);
          }
        },
        modal: {
          ondismiss: () => {
            // Cancelled checkout (closed the modal without paying) — not an error, just reset.
            setBusy(null);
          },
        },
      });
      razorpay.open();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't start checkout.", "error");
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy("cancelling");
    try {
      const res = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't cancel your subscription.");
      push("Subscription cancelled.", "info");
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't cancel your subscription.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-10">
          <Link href={backHref} className="font-display text-2xl">{brandLabel}</Link>
          <Link href={backHref} className="text-sm text-primary hover:underline">← Back</Link>
        </div>

        <p className="text-label-md text-outline mb-2">SUBSCRIPTION</p>
        <h1 className="text-headline-md mb-8">
          {role === "customer" ? "Your HRUNA membership" : "Your HRUNA Studio membership"}
        </h1>

        {!enforced && (
          <div className="flex items-center gap-3 p-4 rounded-md bg-primary-container/40 mb-8">
            <ShieldCheck className="text-primary shrink-0" size={20} />
            <p className="text-sm text-ink-variant">
              Subscriptions are currently unavailable / not required. You have full access to HRUNA at no cost right now.
            </p>
          </div>
        )}

        {plan && (
          <div className="border border-outline-variant rounded-md p-6 mb-8">
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-xl">{plan.name}</p>
              {subscription && <StatusBadge status={subscription.status} />}
            </div>
            <p className="text-2xl font-medium text-primary mb-1">
              {formatCurrency(plan.price, plan.currency)}<span className="text-sm text-outline font-normal"> / {plan.billingInterval}</span>
            </p>
            {plan.description && <p className="text-sm text-ink-variant mb-5">{plan.description}</p>}
            {plan.features.length > 0 && (
              <div className="flex flex-col gap-2 mb-6">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-ink-variant">
                    <Check size={14} className="text-primary shrink-0" /> {f}
                  </div>
                ))}
              </div>
            )}

            {!enforced ? (
              <p className="text-xs text-outline">Not required right now.</p>
            ) : isActive ? (
              <div className="flex flex-col gap-3">
                {subscription?.renewalDate && (
                  <p className="text-xs text-outline">Renews on {formatDate(subscription.renewalDate)}</p>
                )}
                <Button variant="danger" onClick={handleCancel} disabled={busy !== null} className="w-fit">
                  {busy === "cancelling" ? <><Loader2 size={14} className="animate-spin" /> Cancelling…</> : "Cancel Subscription"}
                </Button>
              </div>
            ) : (
              <Button onClick={handleSubscribe} disabled={busy !== null} className="w-full">
                {busy === "checkout" ? (
                  <><Loader2 size={14} className="animate-spin" /> Opening checkout…</>
                ) : busy === "verifying" ? (
                  <><Loader2 size={14} className="animate-spin" /> Confirming payment…</>
                ) : (
                  "Subscribe"
                )}
              </Button>
            )}
          </div>
        )}

        <LinkButton href={backHref} variant="secondary" className="w-full justify-center">
          Continue to {role === "customer" ? "HRUNA" : "Dashboard"}
        </LinkButton>
      </div>
    </div>
  );
}
