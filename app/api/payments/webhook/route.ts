/**
 * Razorpay webhook — the authoritative path for payment outcomes. No Supabase session exists here
 * (Razorpay's servers call this directly); trust comes ENTIRELY from `x-razorpay-signature`,
 * verified over the raw request body with the webhook secret (constant-time compare). Nothing in
 * the payload is trusted before that check passes, and nothing is stored for unsigned requests.
 *
 * Every signed event is logged once in public.payment_events, keyed by Razorpay's event id
 * (x-razorpay-event-id; a hash of the body if it's ever missing). A delivery whose event was
 * already processed/ignored/rejected is acknowledged without doing anything again; one that
 * previously failed mid-way is processed again.
 *
 * Events:
 *   - payment.captured / order.paid → re-fetch the payment from Razorpay (it must STILL be captured,
 *     for this order, in INR — a payment refunded since the event fired never activates), then
 *     activate through the same atomic database operation /verify uses (amount re-checked there;
 *     a pending OR earlier-failed payment row is accepted, so a successful retry still activates).
 *   - payment.failed → record the failure on a still-pending payment. Never downgrades a payment
 *     that already succeeded, and never blocks a later successful retry.
 *   - refund.processed → record Razorpay's cumulative refunded amount; a FULL refund marks the
 *     payment refunded and takes back the 30 days it granted, a PARTIAL refund leaves access unchanged.
 *   - anything else → logged as ignored.
 * Responses: 200 once an event is safely recorded (processed, ignored or rejected); 500 when our
 * side failed transiently, so Razorpay retries. Secrets, signatures and payloads are never logged.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRazorpayPayment, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { activatePayment, applyRefund, recordPaymentFailure } from "@/lib/payments/activate";
import { checkCapturedPayment, safeReason } from "@/lib/payments/rules";

export const dynamic = "force-dynamic";

interface PaymentEntity {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  amount_refunded?: number;
  error_code?: string | null;
  error_reason?: string | null;
}
interface RazorpayEvent {
  event?: string;
  payload?: {
    payment?: { entity?: PaymentEntity };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
  };
}

type Outcome = { status: "processed" | "ignored" | "rejected"; error?: string };

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ status: "ok", ...extra });

export async function POST(request: Request) {
  // Raw text, not request.json() — the signature covers the exact raw bytes.
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ status: "error", message: "Invalid webhook signature." }, { status: 400 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: "error", message: "Malformed webhook payload." }, { status: 400 });
  }

  const eventType = typeof event.event === "string" ? event.event : "unknown";
  const eventId = request.headers.get("x-razorpay-event-id") || `sha256:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;
  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  const orderId = payment?.order_id ?? event.payload?.order?.entity?.id ?? null;
  const ids = { order_id: orderId, payment_id: payment?.id ?? refund?.payment_id ?? null, refund_id: refund?.id ?? null };

  // Untyped until types/supabase.ts includes payment_events.
  const db = createAdminClient() as unknown as SupabaseClient;
  const events = () => db.from("payment_events");

  try {
    // Record the event once; a redelivery of something already settled is a no-op.
    const { error: insertError } = await events().insert({ provider: "razorpay", event_id: eventId, event_type: eventType, ...ids });
    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      const { data: existing, error: readError } = await events().select("status").eq("provider", "razorpay").eq("event_id", eventId).maybeSingle();
      if (readError) throw readError;
      if (existing && existing.status !== "failed" && existing.status !== "received") return ok({ duplicate: true });
    }

    const outcome = await handle(eventType, payment, refund, orderId);
    if (outcome.status === "rejected") console.warn("[payments:webhook] rejected", eventType, outcome.error);
    const { error: updateError } = await events()
      .update({ status: outcome.status, error: outcome.error ?? null, processed_at: new Date().toISOString() })
      .eq("provider", "razorpay")
      .eq("event_id", eventId);
    if (updateError) throw updateError;
    return ok({ result: outcome.status });
  } catch (err) {
    const reason = safeReason("processing_error", err instanceof Error ? err.message : "unknown");
    console.error("[payments:webhook]", eventType, reason);
    await events()
      .update({ status: "failed", error: reason })
      .eq("provider", "razorpay")
      .eq("event_id", eventId)
      .then(() => undefined, () => undefined);
    // 500 → Razorpay retries this delivery later.
    return NextResponse.json({ status: "error", message: "Webhook processing failed." }, { status: 500 });
  }
}

async function handle(
  eventType: string,
  payment: PaymentEntity | undefined,
  refund: { id?: string; payment_id?: string; amount?: number } | undefined,
  orderId: string | null
): Promise<Outcome> {
  if (eventType === "payment.captured" || eventType === "order.paid") {
    if (!payment?.id || !orderId) return { status: "rejected", error: "missing_payment_or_order" };
    if (payment.status !== "captured") return { status: "ignored", error: safeReason("status", payment.status) };
    // The payload is a snapshot from when the event fired; deliveries can arrive late or out of
    // order (e.g. after a refund). Activate only on the payment's CURRENT state at Razorpay.
    // A fetch failure throws → 500 → Razorpay retries the delivery.
    const current = await fetchRazorpayPayment(payment.id);
    const check = checkCapturedPayment(current, { orderId, amountMinor: current.amount });
    if (!check.ok) {
      return check.code === "not_captured" ? { status: "ignored", error: safeReason("status", current.status) } : { status: "rejected", error: check.code };
    }
    const result = await activatePayment({ orderId, razorpayPaymentId: current.id, amountMinor: current.amount, currency: current.currency });
    if (result.ok) return { status: "processed" };
    if (result.code === "payment_not_found") return { status: "ignored", error: "order_not_created_by_hruna" };
    return { status: "rejected", error: result.code };
  }

  if (eventType === "payment.failed") {
    if (!orderId) return { status: "ignored", error: "no_order" };
    const changed = await recordPaymentFailure(orderId, safeReason("payment_failed", payment?.error_code, payment?.error_reason));
    return changed ? { status: "processed" } : { status: "ignored", error: "not_pending" };
  }

  if (eventType === "refund.processed") {
    const paymentId = payment?.id ?? refund?.payment_id;
    // Full vs partial needs Razorpay's cumulative amount_refunded on the payment entity — without
    // it the event is recorded but nothing is guessed.
    if (!paymentId || typeof payment?.amount_refunded !== "number") return { status: "rejected", error: "missing_refund_totals" };
    const result = await applyRefund(paymentId, payment.amount_refunded);
    if (result.ok) return { status: "processed", error: result.full ? "full_refund" : "partial_refund" };
    if (result.code === "payment_not_found") return { status: "ignored", error: "unknown_payment" };
    return { status: "rejected", error: result.code ?? "refund_not_applied" };
  }

  return { status: "ignored", error: "unhandled_event_type" };
}
