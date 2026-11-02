import "server-only";

/**
 * The one place a verified Razorpay payment turns into paid access — called from BOTH
 * `POST /api/payments/verify` (the browser's success callback, after the server re-checks the
 * payment with Razorpay) and the webhook (the authoritative path when the browser never calls back).
 *
 * All the work happens inside the database in ONE transaction (public.activate_designer_payment,
 * migration 20261101000001): the payment row is locked, the amount/currency re-checked, a pending
 * OR previously-failed row accepted (a retry inside the same Razorpay checkout), any trial or lapsed
 * row ended, exactly 30 days granted, and the payment marked succeeded + linked — or nothing at all
 * changes. Calling it again for the same payment returns the existing result, so a duplicate webhook
 * or a verify/webhook race can never create a second subscription or extend access twice.
 *
 * The functions are executable only by service_role, so this uses the server's admin client; the
 * browser can never call them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActivationCode =
  | "invalid_input"
  | "payment_not_found"
  | "order_already_paid"
  | "payment_refunded"
  | "amount_mismatch"
  | "payment_id_in_use"
  | "not_a_designer_plan"
  | "no_designer_profile";

export type ActivationResult =
  | { ok: true; activated: boolean; already: boolean; paymentId: string; subscriptionId: string; endDate: string | null }
  | { ok: false; code: ActivationCode };

// Untyped until types/supabase.ts is regenerated with these functions.
const db = () => createAdminClient() as unknown as SupabaseClient;

export async function activatePayment(input: { orderId: string; razorpayPaymentId: string; amountMinor: number; currency: string }): Promise<ActivationResult> {
  const { data, error } = await db().rpc("activate_designer_payment", {
    p_order_id: input.orderId,
    p_razorpay_payment_id: input.razorpayPaymentId,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
  });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  if (!r.ok) return { ok: false, code: r.code as ActivationCode };
  return {
    ok: true,
    activated: Boolean(r.activated),
    already: Boolean(r.already),
    paymentId: String(r.payment_id),
    subscriptionId: String(r.subscription_id),
    endDate: (r.end_date as string | null) ?? null,
  };
}

/** Marks a still-pending (or failed) payment failed. Never downgrades a succeeded/refunded one. */
export async function recordPaymentFailure(orderId: string, reason: string): Promise<boolean> {
  const { data, error } = await db().rpc("record_payment_failure", { p_order_id: orderId, p_reason: reason });
  if (error) throw error;
  return Boolean((data as { changed?: boolean }).changed);
}

/** Records Razorpay's cumulative refunded amount; a full refund ends the plan that payment bought. */
export async function applyRefund(razorpayPaymentId: string, amountRefundedMinor: number) {
  const { data, error } = await db().rpc("apply_payment_refund", {
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount_refunded_minor: amountRefundedMinor,
  });
  if (error) throw error;
  return data as { ok: boolean; code?: string; full?: boolean };
}
