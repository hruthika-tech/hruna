/**
 * Verifies a Razorpay Checkout success response server-side and, only if every check passes,
 * activates the designer's plan. The browser's report of "payment succeeded" is never trusted:
 *   1. the payment must belong to an order this signed-in user created (RLS-scoped lookup);
 *   2. the Checkout signature HMAC(order_id|payment_id, key_secret) must match;
 *   3. the payment is fetched from Razorpay itself (server-to-server) and must be for the same
 *      order, the exact server-side amount, in INR, and CAPTURED — an authorized-but-uncaptured,
 *      failed or created payment never unlocks a plan;
 *   4. activation then runs atomically in the database (lib/payments/activate.ts).
 * The webhook (app/api/payments/webhook/route.ts) is the other, authoritative path into the same
 * activation — so a browser that closes mid-flow still ends up with its plan.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { fetchRazorpayPayment, verifyPaymentSignature, type RazorpayPayment } from "@/lib/payments/razorpay";
import { activatePayment, recordPaymentFailure } from "@/lib/payments/activate";
import { checkCapturedPayment, safeReason, toMinorUnit } from "@/lib/payments/rules";
import { mapUserSubscription } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

const fail = (status: number, code: string, message: string) => NextResponse.json({ status: "error", code, message }, { status });

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const body = await request.json().catch(() => null);
    const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";
    if (!orderId || !paymentId || !signature) return fail(400, "missing_fields", "Missing payment verification fields.");

    const supabase = createClient();
    // Ownership via the AUTHENTICATED caller's own client — RLS (payments_select: user_id =
    // auth.uid() OR is_admin()) returns nothing for someone else's order.
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("provider_order_id", orderId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!payment) return fail(404, "not_found", "Payment record not found.");

    const subscriptionOf = async (id: string | null) => {
      if (!id) return null;
      const { data: sub } = await supabase.from("user_subscriptions").select("*").eq("id", id).maybeSingle();
      return sub ? mapUserSubscription(sub) : null;
    };

    // Already activated for this very payment (the webhook may have won): idempotent success.
    if (payment.status === "succeeded" && payment.provider_reference === paymentId) {
      return NextResponse.json({ status: "ok", subscription: await subscriptionOf(payment.subscription_id) });
    }
    if (payment.status === "refunded") return fail(409, "payment_refunded", "This payment was refunded.");

    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
      await recordPaymentFailure(orderId, "signature_mismatch");
      return fail(400, "invalid_signature", "Payment verification failed.");
    }

    let rzp: RazorpayPayment;
    try {
      rzp = await fetchRazorpayPayment(paymentId);
    } catch (err) {
      console.error("[payments:verify] could not fetch the payment from Razorpay", err instanceof Error ? err.message : "unknown");
      return fail(502, "provider_unavailable", "We couldn't confirm your payment with Razorpay yet. If you were charged, your plan will activate automatically within a few minutes.");
    }

    const check = checkCapturedPayment(rzp, { orderId, amountMinor: toMinorUnit(payment.amount) });
    if (!check.ok) {
      if (check.code === "not_captured") {
        if (rzp.status === "failed") {
          await recordPaymentFailure(orderId, "payment_failed");
          return fail(400, "payment_failed", "This payment didn't go through. You haven't been charged for a plan.");
        }
        if (rzp.status === "refunded") return fail(409, "payment_refunded", "This payment was refunded.");
        // authorized/created: not money yet — the webhook activates it once Razorpay captures it.
        return fail(409, "payment_not_captured", "Your payment is still being confirmed. Your plan will activate as soon as Razorpay completes it.");
      }
      await recordPaymentFailure(orderId, safeReason("verify", check.code));
      return fail(400, check.code, "Payment verification failed.");
    }

    const result = await activatePayment({ orderId, razorpayPaymentId: paymentId, amountMinor: rzp.amount, currency: rzp.currency });
    if (!result.ok) {
      console.error("[payments:verify] activation refused", result.code);
      return fail(409, result.code, "This payment couldn't be applied to a plan. Please contact support — your payment is recorded.");
    }
    return NextResponse.json({ status: "ok", subscription: await subscriptionOf(result.subscriptionId) });
  } catch (err) {
    return errorResponse(err, "api.payments.verify");
  }
}
