import "server-only";

/**
 * The one place a successful Razorpay payment turns into an active subscription (Phase 8). Called
 * from BOTH `POST /api/payments/verify` (the client's own success callback) and the webhook
 * handler — Razorpay's own guidance is to treat the webhook as the authoritative source (the
 * client can close the browser mid-flow and never call back), while verifying synchronously too
 * gives the user instant feedback. Both paths converge here so the activation logic exists exactly
 * once, not twice with room to drift.
 *
 * Uses the service-role client (lib/supabase/admin.ts) — required, not a convenience choice:
 * `payments`/`user_subscriptions` RLS is admin-write-only by Phase 1's own explicit design (see
 * that migration's comment: "the real subscribe/charge flow will run through a privileged service
 * ... not a raw client insert"). The caller of this function is never the browser and never
 * trusts a client-supplied user id — `paymentId` identifies a `payments` row that was already
 * created for a specific, already-authenticated user at checkout time.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlansNotReadyError } from "@/lib/subscriptions/plans";

export interface ActivationResult {
  payment: Tables<"payments">;
  /** True only if THIS call is the one that actually transitioned pending -> succeeded — false for
   *  a duplicate webhook delivery / a verify-vs-webhook race the other side already won. */
  activatedNow: boolean;
  subscription: Tables<"user_subscriptions"> | null;
}

export async function activateSubscriptionForPayment(paymentId: string, razorpayPaymentId: string): Promise<ActivationResult> {
  const supabase = createAdminClient();

  // Atomic optimistic-concurrency transition — `.eq("status", "pending")` in the WHERE clause
  // means only the request that actually finds the row still pending performs the update; a
  // concurrent duplicate (webhook + client verify racing, or the webhook firing twice) affects
  // zero rows and is treated as already-processed below, never as an error and never re-creates a
  // subscription. This is the DB-level idempotency guarantee Step 14 asks for — no in-memory lock
  // needed.
  const { data: wonRace, error: updateError } = await supabase
    .from("payments")
    .update({ status: "succeeded", provider_reference: razorpayPaymentId, paid_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (updateError) throw updateError;

  if (!wonRace) {
    const { data: current, error: fetchError } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (fetchError) throw fetchError;
    if (!current) throw new Error("Payment record not found.");
    const { data: existingSub } = current.subscription_id
      ? await supabase.from("user_subscriptions").select("*").eq("id", current.subscription_id).maybeSingle()
      : { data: null };
    return { payment: current, activatedNow: false, subscription: existingSub ?? null };
  }

  const payment = wonRace;

  // Role isn't stored on `payments` directly — resolved from the plan, which is required at
  // checkout-creation time (see the checkout route), so this is never null for a real payment.
  const { data: plan, error: planError } = await supabase.from("subscription_plans").select("role").eq("id", payment.plan_id!).maybeSingle();
  if (planError) throw planError;
  if (!plan) throw new Error("The plan for this payment no longer exists.");

  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);

  // A paid plan replaces a running trial (ended now), and a row past its end date is expired:
  // record both, so the one-active-subscription index admits the new paid row instead of this
  // payment being linked to the trial.
  const nowIso = now.toISOString();
  const subs = (supabase as unknown as SupabaseClient).from("user_subscriptions");
  const { error: endTrialError } = await subs
    .update({ status: "expired", end_date: nowIso, updated_at: nowIso })
    .eq("user_id", payment.user_id).eq("role", plan.role).eq("status", "active").eq("is_trial", true);
  // No is_trial column = the plan migrations aren't applied, so there are no trials to end.
  if (endTrialError && !isPlansNotReadyError(endTrialError)) throw endTrialError;
  const { error: lapseError } = await (supabase as unknown as SupabaseClient).from("user_subscriptions")
    .update({ status: "expired", updated_at: nowIso })
    .eq("user_id", payment.user_id).eq("role", plan.role).eq("status", "active").lte("end_date", nowIso);
  if (lapseError) throw lapseError;

  const { data: subscription, error: insertError } = await supabase
    .from("user_subscriptions")
    .insert({
      user_id: payment.user_id,
      role: plan.role,
      plan_id: payment.plan_id!,
      status: "active",
      start_date: now.toISOString(),
      end_date: end.toISOString(),
      renewal_date: end.toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    // 23505 on user_subscriptions_one_active_per_role — a near-simultaneous second successful
    // payment for the same user+role (e.g. two checkout tabs). The charge is real and stays
    // `succeeded` (never falsely marked failed over a linking race) — it's just linked to the
    // ALREADY-active subscription instead of creating a conflicting second active row.
    if ((insertError as { code?: string }).code === "23505") {
      const { data: activeSub } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", payment.user_id)
        .eq("role", plan.role)
        .eq("status", "active")
        .maybeSingle();
      if (activeSub) {
        await supabase.from("payments").update({ subscription_id: activeSub.id }).eq("id", payment.id);
      }
      return { payment: { ...payment, subscription_id: activeSub?.id ?? payment.subscription_id }, activatedNow: true, subscription: activeSub ?? null };
    }
    throw insertError;
  }

  const { data: updatedPayment, error: linkError } = await supabase
    .from("payments")
    .update({ subscription_id: subscription!.id })
    .eq("id", payment.id)
    .select()
    .single();
  if (linkError) throw linkError;

  return { payment: updatedPayment, activatedNow: true, subscription: subscription! };
}
