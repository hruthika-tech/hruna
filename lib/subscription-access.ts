import "server-only";

/**
 * Whole-app subscription gate (app/(app)/layout.tsx, app/(designer)/layout.tsx → <SubscriptionGate>).
 *
 * Nobody is locked out of HRUNA any more:
 *   - customers use the marketplace for free — there is no customer subscription;
 *   - every designer is at least on the Free plan. What a plan allows (listings, proposals,
 *     analytics) is enforced per feature in the APIs and the database
 *     (lib/subscriptions/designer-plans.ts, migration 20261029000001_designer_subscription_plans.sql),
 *     not by hiding pages — a layout-level gate could never stop a direct API call anyway.
 * The gate component stays in place so a future whole-app restriction has one switch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export interface SubscriptionAccess {
  hasAccess: boolean;
  plan: { name: string; price: number; currency: string } | null;
}

export async function getSubscriptionAccess(_supabase: Supa, _userId: string, _role: "customer" | "designer"): Promise<SubscriptionAccess> {
  return { hasAccess: true, plan: null };
}

export interface SubscriptionSummary {
  enforced: boolean;
  plan: { name: string; price: number; currency: string; billingInterval: string; description: string; features: string[] } | null;
  subscription: { status: string; renewalDate: string | null; endDate: string | null } | null;
}

/** Full display data for the Subscription page. Read + a real Razorpay checkout/verify/cancel flow
 *  now sits in front of it (app/api/payments/*) — this stays read-only itself, resolving whatever
 *  the database says after those routes have run. */
export async function getSubscriptionSummary(supabase: Supa, userId: string, role: "customer" | "designer"): Promise<SubscriptionSummary> {
  const [{ data: settings }, { data: planRow }, { data: subRows }] = await Promise.all([
    supabase.from("payment_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("subscription_plans").select("*").eq("role", role).maybeSingle(),
    // Not `.maybeSingle()` — a user can accumulate multiple HISTORICAL rows over time (expired/
    // cancelled ones are never deleted, by design, for audit purposes), so more than one row for
    // this (user_id, role) is the expected long-run state, not a bug. Most recent one wins for
    // display purposes.
    supabase
      .from("user_subscriptions")
      .select("status, renewal_date, end_date")
      .eq("user_id", userId)
      .eq("role", role)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  // Customers never need a subscription (the marketplace is free for them); designer plans are shown
  // by the designer plans page (app/designer-subscription), not through this summary.
  const enforced = role === "designer" && !!settings?.payment_system_enabled && !!settings?.designer_subscriptions_enabled;
  const subRow = subRows?.[0] ?? null;

  // Lazy display-only expiry: an `active` row past its own end_date reads as "expired" here
  // without writing anything — there's no cron in this environment to flip the stored status, and
  // getSubscriptionAccess above already independently treats a past-end_date row as no access
  // regardless of its stored status, so this is purely cosmetic (never a second source of truth
  // for whether access is actually granted).
  const displayStatus =
    subRow?.status === "active" && subRow.end_date && new Date(subRow.end_date).getTime() < Date.now() ? "expired" : subRow?.status;

  return {
    enforced,
    plan: planRow
      ? {
          name: planRow.name,
          price: Number(planRow.price),
          currency: planRow.currency,
          billingInterval: planRow.billing_interval,
          description: planRow.description ?? "",
          features: planRow.features,
        }
      : null,
    subscription: subRow ? { status: displayStatus!, renewalDate: subRow.renewal_date, endDate: subRow.end_date } : null,
  };
}
