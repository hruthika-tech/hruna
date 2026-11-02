// Unit tests for lib/payments/rules.ts — the 30-day access rule, what makes a Razorpay payment
// eligible to activate a plan, full vs partial refunds, and safe failure text. No database, no app.
// Run with: node --test scripts/test-payments-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { PAID_ACCESS_DAYS, checkCapturedPayment, paidAccessEnd, refundKind, safeReason, toMinorUnit } from "../lib/payments/rules.ts";

test("paid access is exactly 30 × 24 hours, never a calendar month", () => {
  assert.equal(PAID_ACCESS_DAYS, 30);
  for (const start of ["2026-01-31T10:00:00Z", "2026-02-28T23:59:59Z", "2026-03-29T00:30:00Z", "2026-12-15T05:00:00Z"]) {
    const from = new Date(start);
    assert.equal(paidAccessEnd(from).getTime() - from.getTime(), 30 * 86_400_000, start);
  }
  // A calendar month from 31 Jan would land in March; 30 days lands on 2 Mar.
  assert.equal(paidAccessEnd(new Date("2026-01-31T00:00:00Z")).toISOString(), "2026-03-02T00:00:00.000Z");
});

test("amounts convert to paise without float drift", () => {
  assert.equal(toMinorUnit(199), 19900);
  assert.equal(toMinorUnit("299.00"), 29900);
  assert.equal(toMinorUnit(0.29 * 100), 2900);
});

test("only a captured INR payment for the same order and exact amount may activate a plan", () => {
  const expected = { orderId: "order_1", amountMinor: 19900 };
  const good = { order_id: "order_1", amount: 19900, currency: "INR", status: "captured" };
  assert.deepEqual(checkCapturedPayment(good, expected), { ok: true });
  assert.deepEqual(checkCapturedPayment({ ...good, order_id: "order_2" }, expected), { ok: false, code: "order_mismatch" });
  assert.deepEqual(checkCapturedPayment({ ...good, order_id: null }, expected), { ok: false, code: "order_mismatch" });
  assert.deepEqual(checkCapturedPayment({ ...good, amount: 100 }, expected), { ok: false, code: "amount_mismatch" });
  assert.deepEqual(checkCapturedPayment({ ...good, amount: 29900 }, expected), { ok: false, code: "amount_mismatch" });
  assert.deepEqual(checkCapturedPayment({ ...good, currency: "USD" }, expected), { ok: false, code: "currency_mismatch" });
  for (const status of ["authorized", "created", "failed", "refunded"]) {
    assert.deepEqual(checkCapturedPayment({ ...good, status }, expected), { ok: false, code: "not_captured" }, status);
  }
});

test("refunds: Razorpay's cumulative refunded amount decides full vs partial", () => {
  assert.equal(refundKind(19900, 0), "none");
  assert.equal(refundKind(19900, 5000), "partial");
  assert.equal(refundKind(19900, 19899), "partial");
  assert.equal(refundKind(19900, 19900), "full");
  assert.equal(refundKind(29900, 30000), "full");
});

test("failure text is short and stripped of anything unusual", () => {
  assert.equal(safeReason("payment_failed", "BAD_REQUEST_ERROR", "payment_cancelled"), "payment_failed: BAD_REQUEST_ERROR: payment_cancelled");
  assert.equal(safeReason(null, undefined, ""), "unspecified");
  assert.ok(safeReason("x".repeat(500)).length <= 300);
  assert.ok(!/[<>{}"`$]/.test(safeReason('<script>"secret"</script> ${x}')));
});
