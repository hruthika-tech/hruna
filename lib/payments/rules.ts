// Payment rules shared by the verify route and the webhook — pure functions, no runtime imports, so
// they're unit-tested directly (scripts/test-payments-unit.mjs).

/** Paid designer plans are a one-time purchase of exactly this many days (no renewal). */
export const PAID_ACCESS_DAYS = 30;

/** Major unit (rupees) → minor unit (paise), rounding away float drift (299.00 * 100). */
export const toMinorUnit = (amount: number | string) => Math.round(Number(amount) * 100);

/** Exactly PAID_ACCESS_DAYS × 24 h after `from` (UTC arithmetic — no calendar months). */
export const paidAccessEnd = (from: Date) => new Date(from.getTime() + PAID_ACCESS_DAYS * 24 * 60 * 60 * 1000);

export interface PaymentFacts {
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
}

export type CaptureCheck = { ok: true } | { ok: false; code: "order_mismatch" | "amount_mismatch" | "currency_mismatch" | "not_captured" };

/**
 * Whether a payment Razorpay reports may activate a plan: same order, the exact server-side amount,
 * INR, and actually captured (an authorized-but-uncaptured payment can still be voided).
 */
export function checkCapturedPayment(payment: PaymentFacts, expected: { orderId: string; amountMinor: number }): CaptureCheck {
  if (payment.order_id !== expected.orderId) return { ok: false, code: "order_mismatch" };
  if (payment.currency !== "INR") return { ok: false, code: "currency_mismatch" };
  if (payment.amount !== expected.amountMinor) return { ok: false, code: "amount_mismatch" };
  if (payment.status !== "captured") return { ok: false, code: "not_captured" };
  return { ok: true };
}

/** Full vs partial refund, from Razorpay's own payment amount and cumulative refunded amount. */
export function refundKind(amountMinor: number, amountRefundedMinor: number): "none" | "partial" | "full" {
  if (!amountRefundedMinor || amountRefundedMinor <= 0) return "none";
  return amountRefundedMinor >= amountMinor ? "full" : "partial";
}

/** Short, safe failure text for the payments/payment_events tables (never secrets or payloads). */
export const safeReason = (...parts: (string | null | undefined)[]) =>
  parts
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(": ")
    .replace(/[^\w .,:;()'/-]/g, "")
    .slice(0, 300) || "unspecified";
