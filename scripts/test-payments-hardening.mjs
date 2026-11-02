// HRUNA — Razorpay payment hardening suite (migration 20261101000001). Drives the REAL running app
// (real sign-in, real checkout / verify / webhook / cancel routes, real local database) against a
// MOCK Razorpay API started by this script on 127.0.0.1 — no Razorpay account, no network, no money.
//
// The app only talks to the mock because it runs with RAZORPAY_API_BASE_URL_FOR_TESTS pointing at
// it; lib/payments/razorpay.ts honours that ONLY outside production, ONLY with a rzp_test_ key id
// and ONLY for a loopback host. Signatures are computed with the same TEST secrets the local app
// runs with (HRUNA_TEST_RAZORPAY_*), so the app's real HMAC checks are exercised, not bypassed.
//
// Prereqs: local Supabase reset (no fixtures needed), the app on :3100 started against it with
//   RAZORPAY_KEY_ID=rzp_test_…, RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET = the HRUNA_TEST_ values,
//   RAZORPAY_API_BASE_URL_FOR_TESTS=http://127.0.0.1:<HRUNA_TEST_RAZORPAY_MOCK_PORT, default 55690>/v1
// Run with: node scripts/test-payments-hardening.mjs

import crypto, { randomUUID } from "node:crypto";
import http from "node:http";
import { spawnSync } from "node:child_process";

import { APP_URL, signInWithPassword, requireEnv, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

await assertLocalTestEnvironment(); // local app + local Supabase only — aborts otherwise

const KEY_ID = requireEnv("HRUNA_TEST_RAZORPAY_KEY_ID");
if (!KEY_ID.startsWith("rzp_test_")) {
  console.error("\n✗ HRUNA_TEST_RAZORPAY_KEY_ID must be a Razorpay TEST-mode key id (rzp_test_…). Live credentials are never used by automated tests.");
  process.exit(2);
}
const KEY_SECRET = requireEnv("HRUNA_TEST_RAZORPAY_KEY_SECRET");
const WEBHOOK_SECRET = requireEnv("HRUNA_TEST_RAZORPAY_WEBHOOK_SECRET");
const MOCK_PORT = Number(process.env.HRUNA_TEST_RAZORPAY_MOCK_PORT ?? 55690);
const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
const MEERA = "d0000000-0000-0000-0000-000000000001";
const AANYA_EMAIL = "aanya@lilirve.dev";

let pass = 0;
let fail = 0;
const failures = [];
function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  }
}

/** psql inside the LOCAL database container (SQL on stdin, so no shell quoting). */
function sql(query) {
  const r = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-q"], { input: query, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return r.stdout.trim();
}

// ---------------------------------------------------------------------------------------------
// Mock Razorpay API: POST /v1/orders, GET /v1/payments/:id. Payments are planted by the tests.
// ---------------------------------------------------------------------------------------------
const mock = { orders: new Map(), payments: new Map(), authOk: true, fetches: 0 };
const server = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const auth = req.headers.authorization ?? "";
  const expected = `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`;
  if (auth !== expected) {
    mock.authOk = false;
    return send(401, { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } });
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/v1/orders") {
      const body = JSON.parse(raw || "{}");
      const order = { id: `order_mock${randomUUID().replace(/-/g, "").slice(0, 14)}`, entity: "order", amount: body.amount, currency: body.currency, receipt: body.receipt, notes: body.notes, status: "created" };
      mock.orders.set(order.id, order);
      return send(200, order);
    }
    const m = req.method === "GET" && req.url.match(/^\/v1\/payments\/(pay_[A-Za-z0-9]+)$/);
    if (m) {
      mock.fetches++;
      const p = mock.payments.get(m[1]);
      return p ? send(200, p) : send(404, { error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } });
    }
    send(404, { error: { code: "NOT_FOUND" } });
  });
});
await new Promise((resolve, reject) => server.once("error", reject).listen(MOCK_PORT, "127.0.0.1", resolve));

const newPayId = () => `pay_mock${randomUUID().replace(/-/g, "").slice(0, 14)}`;
function plantPayment(orderId, { amount, status = "captured", currency = "INR", id = newPayId(), amount_refunded = 0 } = {}) {
  const p = { id, entity: "payment", order_id: orderId, amount, currency, status, amount_refunded, captured: status === "captured", method: "upi" };
  mock.payments.set(id, p);
  return p;
}

// ---------------------------------------------------------------------------------------------
// App helpers
// ---------------------------------------------------------------------------------------------
async function api(cookie, path, body, method = "POST") {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})), raw: res };
}
const sign = (orderId, paymentId) => crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
const verify = (cookie, orderId, paymentId, signature = sign(orderId, paymentId)) =>
  api(cookie, "/api/payments/verify", { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });

async function webhook(event, { eventId = `evt_${randomUUID().slice(0, 12)}`, signature } = {}) {
  const rawBody = JSON.stringify(event);
  const res = await fetch(`${APP_URL}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": signature ?? crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex"),
      "x-razorpay-event-id": eventId,
    },
    body: rawBody,
  });
  return { status: res.status, data: await res.json().catch(() => ({})), eventId };
}
const capturedEvent = (p, type = "payment.captured") => ({ entity: "event", event: type, payload: { payment: { entity: p }, ...(type === "order.paid" ? { order: { entity: { id: p.order_id } } } : {}) } });
const failedEvent = (orderId) => ({ entity: "event", event: "payment.failed", payload: { payment: { entity: { id: newPayId(), order_id: orderId, amount: 19900, currency: "INR", status: "failed", error_code: "BAD_REQUEST_ERROR", error_reason: "payment_failed" } } } });
const refundEvent = (p, refundedTotal, refundAmount = refundedTotal) => ({
  entity: "event",
  event: "refund.processed",
  payload: {
    refund: { entity: { id: `rfnd_${randomUUID().slice(0, 12)}`, payment_id: p.id, amount: refundAmount, currency: "INR" } },
    payment: { entity: { ...p, amount_refunded: refundedTotal, status: refundedTotal >= p.amount ? "refunded" : "captured" } },
  },
});

const paymentRow = (orderId) => {
  const [status, ref, reason, refunded, subId, amount] = sql(`select status, coalesce(provider_reference,''), coalesce(failure_reason,''), refunded_amount, coalesce(subscription_id::text,''), amount from public.payments where provider_order_id = '${orderId}';`).split("|");
  return { status, ref, reason, refunded: Number(refunded), subId, amount: Number(amount) };
};
/** Subscriptions that currently grant access (a lapsed row stays 'active' until expired lazily). */
const activeDesignerSubs = () => sql(`select count(*) from public.user_subscriptions where user_id = '${MEERA}' and role = 'designer' and status = 'active' and (end_date is null or end_date > now());`);
const subInfo = (id) => {
  const [status, plan, secs, endFuture, trial] = sql(`select s.status, p.plan_key, extract(epoch from s.end_date - s.start_date)::bigint, s.end_date > now(), s.is_trial from public.user_subscriptions s join public.subscription_plans p on p.id = s.plan_id where s.id = '${id}';`).split("|");
  return { status, plan, seconds: Number(secs), endFuture: endFuture === "t", trial: trial === "t" };
};
/** Ends meera's paid plan in the DB (as if its 30 days ran out) so the next purchase can start. */
const lapsePaidPlan = () => sql(`update public.user_subscriptions set end_date = now() - interval '1 second' where user_id = '${MEERA}' and role = 'designer' and status = 'active' and not is_trial;`);

const THIRTY_DAYS = 30 * 86400;

async function main() {
  const meera = await signInWithPassword("meera@lilirve.dev"); // approved designer
  const aanya = await signInWithPassword(AANYA_EMAIL); // customer
  const admin = await signInWithPassword("admin@lilirve.dev");

  const checkout = (planKey, cookie = meera, extra = {}) => api(cookie, "/api/payments/checkout", { role: "designer", planKey, ...extra });
  const settings = (body) => api(admin, "/api/admin/settings/payment", body, "PATCH");

  console.log("\n=== Setup ===");
  check("(setup) payments switched on locally by the admin", (await settings({ paymentSystemEnabled: true, designerSubscriptionsEnabled: true })).status === 200);
  const paymentsAtStart = Number(sql(`select count(*) from public.payments where user_id = '${MEERA}';`));
  const subsAtStart = Number(sql(`select count(*) from public.user_subscriptions where user_id = '${MEERA}';`));
  const trial = await api(meera, "/api/designer/plan", { action: "start_trial" });
  check("(setup) meera starts the free 14-day Pro trial (no payment)", trial.status === 200, trial.data);
  const trialId = sql(`select id from public.user_subscriptions where user_id = '${MEERA}' and is_trial and status = 'active';`);
  const trialEnd = sql(`select end_date from public.user_subscriptions where id = '${trialId}';`);

  console.log("\n=== 3/4. Who and what can be bought ===");
  {
    const customer = await checkout("designer_plus", aanya);
    check("3. A customer can't buy a designer plan (403)", customer.status === 403, customer.data);
    const free = await checkout("designer_free");
    check("4. The Free plan can't be checked out (400)", free.status === 400, free.data);
    check("   ...and neither request created a Razorpay order", mock.orders.size === 0, mock.orders.size);
  }

  console.log("\n=== 13. Activation is all-or-nothing (forced failure rolls back) ===");
  let plus1;
  {
    const co = await checkout("designer_plus");
    check("   (setup) checkout succeeds against the mock Razorpay API", co.status === 200 && co.data.orderId?.startsWith("order_mock"), co.data);
    check("   ...authenticated to Razorpay with the server-side key (never sent to the browser)", mock.authOk && !JSON.stringify(co.data).includes(KEY_SECRET));
    plus1 = { orderId: co.data.orderId, pay: plantPayment(co.data.orderId, { amount: 19900 }) };
    const subsBefore = sql(`select count(*) from public.user_subscriptions where user_id = '${MEERA}';`);
    sql(`create or replace function public.__test_fail_sub_insert() returns trigger language plpgsql as $f$ begin raise exception 'test-induced activation failure'; end $f$;
         create trigger __test_fail_sub_insert before insert on public.user_subscriptions for each row execute function public.__test_fail_sub_insert();`);
    let res;
    try {
      res = await verify(meera, plus1.orderId, plus1.pay.id);
    } finally {
      sql(`drop trigger if exists __test_fail_sub_insert on public.user_subscriptions; drop function if exists public.__test_fail_sub_insert();`);
    }
    const row = paymentRow(plus1.orderId);
    check("13. A failure mid-activation returns an error (5xx), not success", res.status >= 500, { status: res.status });
    check("    ...the payment is NOT marked succeeded and has no Razorpay payment id stored", row.status === "pending" && row.ref === "", row);
    check("    ...no subscription row was added", sql(`select count(*) from public.user_subscriptions where user_id = '${MEERA}';`) === subsBefore);
    check("    ...and the trial it would have ended is untouched (still active, same end date)",
      sql(`select status || '|' || end_date from public.user_subscriptions where id = '${trialId}';`) === `active|${trialEnd}`);
  }

  console.log("\n=== 1/14. Designer Plus — ₹199, exactly 30 days ===");
  let plusSubId;
  {
    check("1. The Plus order was created for exactly ₹199 (19900 paise, INR)", mock.orders.get(plus1.orderId)?.amount === 19900 && mock.orders.get(plus1.orderId)?.currency === "INR", mock.orders.get(plus1.orderId));
    const res = await verify(meera, plus1.orderId, plus1.pay.id);
    check("   Retrying after the rolled-back attempt activates the plan", res.status === 200 && !!res.data.subscription, res.data);
    const row = paymentRow(plus1.orderId);
    plusSubId = row.subId;
    check("   The payment is succeeded, linked and stores the Razorpay payment id", row.status === "succeeded" && row.ref === plus1.pay.id && !!row.subId, row);
    const sub = subInfo(plusSubId);
    check("14. Access is EXACTLY 30 days (2,592,000 seconds), never a calendar month", sub.plan === "designer_plus" && sub.seconds === THIRTY_DAYS && sub.endFuture && !sub.trial, sub);
    check("   renewal_date is empty — nothing renews", sql(`select renewal_date is null from public.user_subscriptions where id = '${plusSubId}';`) === "t");
    check("   The trial was ended (expired), not deleted", sql(`select status from public.user_subscriptions where id = '${trialId}';`) === "expired");
    check("   Exactly one active designer subscription", activeDesignerSubs() === "1");
    const plan = await api(meera, "/api/designer/plan", undefined, "GET");
    check("   The designer's effective plan is now Designer Plus", plan.data.current?.planKey === "designer_plus" && plan.data.current?.isTrial === false, plan.data.current);
    const again = await checkout("designer_plus");
    check("   Buying again while paid days remain is refused (409 plan_active — early renewal is out of scope)", again.status === 409 && again.data.code === "plan_active", again.data);
  }

  console.log("\n=== 10. Duplicate captured webhooks change nothing ===");
  {
    const endBefore = sql(`select end_date from public.user_subscriptions where id = '${plusSubId}';`);
    const first = await webhook(capturedEvent(plus1.pay));
    const dup = await webhook(capturedEvent(plus1.pay), { eventId: first.eventId });
    const orderPaid = await webhook(capturedEvent(plus1.pay, "order.paid"));
    check("10. The captured webhook for an already-verified payment is accepted (200)", first.status === 200 && first.data.result === "processed", first.data);
    check("    The same event delivered again is acknowledged as a duplicate", dup.status === 200 && dup.data.duplicate === true, dup.data);
    check("    A different event (order.paid) for the same payment is also harmless", orderPaid.status === 200, orderPaid.data);
    check("    The end date did not move (no double 30 days)", sql(`select end_date from public.user_subscriptions where id = '${plusSubId}';`) === endBefore);
    check("    Still exactly one active subscription, one payment row for that Razorpay id", activeDesignerSubs() === "1" && sql(`select count(*) from public.payments where provider_reference = '${plus1.pay.id}';`) === "1");
    check("    The duplicated event is logged once", sql(`select count(*) from public.payment_events where event_id = '${first.eventId}';`) === "1");
  }

  console.log("\n=== 15. Cancel does not remove paid access ===");
  {
    const res = await api(meera, "/api/payments/cancel", { role: "designer" });
    check("15. Cancel is refused with a clear explanation (409 non_renewing)", res.status === 409 && res.data.code === "non_renewing", res.data);
    const sub = subInfo(plusSubId);
    check("    The paid plan is still active with its full 30 days", sub.status === "active" && sub.seconds === THIRTY_DAYS && sub.endFuture, sub);
  }

  console.log("\n=== 17. Partial refund is recorded, access unchanged ===");
  {
    mock.payments.get(plus1.pay.id).amount_refunded = 5000; // Razorpay's view after the partial refund
    const res = await webhook(refundEvent(plus1.pay, 5000));
    const row = paymentRow(plus1.orderId);
    check("17. A partial refund webhook is processed (200)", res.status === 200 && res.data.result === "processed", res.data);
    check("    ...records ₹50 refunded, payment stays succeeded", row.refunded === 50 && row.status === "succeeded", row);
    check("    ...and the plan stays active", subInfo(plusSubId).status === "active");
    await webhook(refundEvent(plus1.pay, 5000));
    check("    Replaying Razorpay's cumulative total never double-counts", paymentRow(plus1.orderId).refunded === 50);
  }

  console.log("\n=== 16. Full refund revokes the plan it bought ===");
  {
    Object.assign(mock.payments.get(plus1.pay.id), { amount_refunded: 19900, status: "refunded" });
    const res = await webhook(refundEvent(plus1.pay, 19900, 14900));
    const row = paymentRow(plus1.orderId);
    check("16. A full refund webhook is processed (200)", res.status === 200 && res.data.result === "processed", res.data);
    check("    ...the payment is refunded with ₹199 recorded", row.status === "refunded" && row.refunded === 199, row);
    const sub = subInfo(plusSubId);
    check("    ...the subscription is cancelled and ends now (not deleted)", sub.status === "cancelled" && !sub.endFuture, sub);
    const plan = await api(meera, "/api/designer/plan", undefined, "GET");
    check("    ...and the designer is back on Free", plan.data.current?.planKey === "designer_free", plan.data.current);
    const reverify = await verify(meera, plus1.orderId, plus1.pay.id);
    check("    Re-verifying the refunded payment can't bring the plan back (409 payment_refunded)", reverify.status === 409 && reverify.data.code === "payment_refunded", reverify.data);
    const rewebhook = await webhook(capturedEvent(plus1.pay));
    check("    ...nor can a replayed captured webhook", rewebhook.status === 200 && activeDesignerSubs() === "0", { r: rewebhook.data, active: activeDesignerSubs() });
  }

  console.log("\n=== 2. Designer Pro — ₹299 ===");
  let pro;
  {
    const co = await checkout("designer_pro");
    check("2. The Pro order is created for exactly ₹299 (29900 paise)", co.status === 200 && co.data.amount === 29900 && mock.orders.get(co.data.orderId)?.amount === 29900, co.data);
    pro = { orderId: co.data.orderId, pay: plantPayment(co.data.orderId, { amount: 29900 }) };
    const res = await verify(meera, pro.orderId, pro.pay.id);
    const row = paymentRow(pro.orderId);
    check("   Verified → Designer Pro for exactly 30 days, payment ₹299 succeeded", res.status === 200 && row.status === "succeeded" && row.amount === 299 && subInfo(row.subId).plan === "designer_pro" && subInfo(row.subId).seconds === THIRTY_DAYS, { res: res.data, row });
    lapsePaidPlan();
  }

  console.log("\n=== 5. Amount tampering ===");
  let tamper;
  {
    const co = await checkout("designer_plus", meera, { amount: 1, price: 1, currency: "USD" });
    check("5. Client-sent amount/price/currency are ignored — the order is still ₹199 INR", co.status === 200 && mock.orders.get(co.data.orderId)?.amount === 19900 && mock.orders.get(co.data.orderId)?.currency === "INR", co.data);
    tamper = { orderId: co.data.orderId };
    const cheap = plantPayment(tamper.orderId, { amount: 100 });
    const res = await verify(meera, tamper.orderId, cheap.id);
    check("   A captured payment for ₹1 on that order is rejected (400 amount_mismatch)", res.status === 400 && res.data.code === "amount_mismatch", res.data);
    const hook = await webhook(capturedEvent(cheap));
    check("   ...and the same via webhook is rejected and logged, never activated",
      hook.status === 200 && sql(`select status || '|' || error from public.payment_events where event_id = '${hook.eventId}';`) === "rejected|amount_mismatch", hook.data);
    const usd = plantPayment(tamper.orderId, { amount: 19900, currency: "USD" });
    const usdRes = await verify(meera, tamper.orderId, usd.id);
    check("   A non-INR payment is rejected (400 currency_mismatch)", usdRes.status === 400 && usdRes.data.code === "currency_mismatch", usdRes.data);
    check("   The order is not paid and no plan was granted", paymentRow(tamper.orderId).status !== "succeeded" && activeDesignerSubs() === "0");
  }

  console.log("\n=== 6. Invalid signatures ===");
  {
    const good = plantPayment(tamper.orderId, { amount: 19900 });
    const fetchesBefore = mock.fetches;
    const res = await verify(meera, tamper.orderId, good.id, "0".repeat(64));
    check("6. A forged Checkout signature is rejected (400 invalid_signature) before Razorpay is even asked", res.status === 400 && res.data.code === "invalid_signature" && mock.fetches === fetchesBefore, res.data);
    const hook = await webhook(capturedEvent(good), { signature: "f".repeat(64) });
    check("   A webhook with a bad signature is rejected (400) and nothing is stored",
      hook.status === 400 && sql(`select count(*) from public.payment_events where event_id = '${hook.eventId}';`) === "0" && paymentRow(tamper.orderId).status !== "succeeded", hook.data);
    const anon = await verify(null, tamper.orderId, good.id);
    check("   Verify without a session is refused (401)", anon.status === 401, anon.status);
  }

  console.log("\n=== 7. Wrong order id ===");
  {
    const elsewhere = plantPayment("order_somebodyelse0001", { amount: 19900 });
    const res = await verify(meera, tamper.orderId, elsewhere.id);
    check("7. A genuinely-signed payment that belongs to another order is rejected (400 order_mismatch)", res.status === 400 && res.data.code === "order_mismatch", res.data);
    const notMine = await verify(meera, "order_doesnotexist0001", elsewhere.id);
    check("   An order the caller didn't create is not found (404)", notMine.status === 404, notMine.data);
    const otherUser = await verify(aanya, tamper.orderId, elsewhere.id);
    check("   Another user can't verify meera's order (404)", otherUser.status === 404, otherUser.data);
  }

  console.log("\n=== 8. Uncaptured payment ===");
  {
    const authorized = plantPayment(tamper.orderId, { amount: 19900, status: "authorized" });
    const res = await verify(meera, tamper.orderId, authorized.id);
    check("8. An authorized-but-not-captured payment does NOT unlock the plan (409 payment_not_captured)", res.status === 409 && res.data.code === "payment_not_captured", res.data);
    const hook = await webhook(capturedEvent(authorized));
    check("   A webhook whose payment isn't captured is ignored", hook.status === 200 && hook.data.result === "ignored" && activeDesignerSubs() === "0", hook.data);
  }

  console.log("\n=== 9. Failed attempt, then a successful retry ===");
  {
    const failedRzp = plantPayment(tamper.orderId, { amount: 19900, status: "failed" });
    const res = await verify(meera, tamper.orderId, failedRzp.id);
    const hook = await webhook(failedEvent(tamper.orderId));
    check("9. A failed payment is reported as failed (400 payment_failed) and recorded", res.status === 400 && res.data.code === "payment_failed" && hook.status === 200 && paymentRow(tamper.orderId).status === "failed", { res: res.data, row: paymentRow(tamper.orderId) });
    const retry = plantPayment(tamper.orderId, { amount: 19900 });
    const ok = await verify(meera, tamper.orderId, retry.id);
    const row = paymentRow(tamper.orderId);
    check("   A successful retry on the same order still activates the plan", ok.status === 200 && row.status === "succeeded" && row.ref === retry.id && row.reason === "" && activeDesignerSubs() === "1", { ok: ok.data, row });
    const lateFail = await webhook(failedEvent(tamper.orderId));
    check("   A late payment.failed webhook never downgrades the succeeded payment", lateFail.status === 200 && paymentRow(tamper.orderId).status === "succeeded" && activeDesignerSubs() === "1");
    tamper.pay = retry;
    lapsePaidPlan();
  }

  console.log("\n=== 12. One Razorpay payment id can't pay for two orders ===");
  {
    const co = await checkout("designer_plus");
    const orderB = co.data.orderId;
    // Signed webhook claiming the already-used payment id paid order B — Razorpay's own record
    // says that payment belongs to the first order, so it's refused before reaching the database.
    const reused = { ...tamper.pay, order_id: orderB };
    const hook = await webhook(capturedEvent(reused));
    check("12. Reusing a Razorpay payment id for another order is rejected (order_mismatch at Razorpay)",
      hook.status === 200 && sql(`select error from public.payment_events where event_id = '${hook.eventId}';`) === "order_mismatch" && paymentRow(orderB).status === "pending", hook.data);
    const direct = sql(`select public.activate_designer_payment('${orderB}', '${tamper.pay.id}', 19900, 'INR')->>'code';`);
    check("    ...and the activation function itself refuses it (payment_id_in_use)", direct === "payment_id_in_use", direct);
    let dbRejected = false;
    try {
      sql(`update public.payments set provider_reference = '${tamper.pay.id}' where provider_order_id = '${orderB}';`);
    } catch (e) {
      dbRejected = /payments_provider_reference_key/.test(e.message);
    }
    check("    ...and the database itself refuses a second row with that payment id (unique index)", dbRejected);
    check("    No plan was granted", activeDesignerSubs() === "0");

    console.log("\n=== 11. Webhook and verify racing for the same payment ===");
    const pay = plantPayment(orderB, { amount: 19900 });
    const [v, w] = await Promise.all([verify(meera, orderB, pay.id), webhook(capturedEvent(pay))]);
    const row = paymentRow(orderB);
    check("11. Both the browser verify and the webhook succeed", v.status === 200 && w.status === 200 && w.data.result === "processed", { v: v.data, w: w.data });
    check("    ...exactly one subscription is created, with exactly 30 days", activeDesignerSubs() === "1" && subInfo(row.subId).seconds === THIRTY_DAYS && sql(`select count(*) from public.payments where subscription_id = '${row.subId}';`) === "1", subInfo(row.subId));
  }

  console.log("\n=== 18. History is preserved ===");
  {
    const subsNow = Number(sql(`select count(*) from public.user_subscriptions where user_id = '${MEERA}';`));
    // trial + plus(refunded) + pro + plus(retry) + plus(race) = 5 rows created by this run.
    check("18. Every subscription this run created is still there (trial, refunded, lapsed, active)", subsNow === subsAtStart + 5, { subsAtStart, subsNow });
    // plus (refunded) + pro + tamper/retry + race = 4 payment rows created by this run.
    const statuses = sql(`select string_agg(status::text, ',' order by created_at) from public.payments where user_id = '${MEERA}';`);
    check("    Every payment row is kept, the refunded one included", statuses.split(",").length === paymentsAtStart + 4 && statuses.includes("refunded"), { paymentsAtStart, statuses });
    check("    Webhook events are kept as an audit log, ids only", Number(sql(`select count(*) from public.payment_events;`)) >= 10);
    check("    Browser roles can't read the event log (admin-only, RLS)", sql(`select has_table_privilege('anon', 'public.payment_events', 'select');`) === "f");
    check("    Browser roles can't call the activation functions",
      sql(`select bool_or(has_function_privilege(r, f, 'execute')) from unnest(array['anon','authenticated','public']) r,
           unnest(array['public.activate_designer_payment(text,text,bigint,text)','public.record_payment_failure(text,text)','public.apply_payment_refund(text,bigint)']) f;`) === "f");
    check("    The SECURITY DEFINER payment functions pin search_path to public, pg_temp",
      sql(`select bool_and(prosecdef and proconfig @> array['search_path=public, pg_temp']) from pg_proc where proname in ('activate_designer_payment','record_payment_failure','apply_payment_refund');`) === "t");
  }

  console.log("\n=== 21. A refund delivered before the captured event never activates ===");
  {
    lapsePaidPlan();
    const co = await checkout("designer_plus");
    const p = plantPayment(co.data.orderId, { amount: 19900, status: "refunded", amount_refunded: 19900 });
    const refund = await webhook(refundEvent({ ...p, status: "captured", amount_refunded: 0 }, 19900));
    const late = await webhook(capturedEvent({ ...p, status: "captured", amount_refunded: 0 })); // stale snapshot
    check("21. The late captured webhook is ignored: Razorpay says the payment is refunded now",
      refund.status === 200 && late.status === 200 && late.data.result === "ignored" && paymentRow(co.data.orderId).status === "pending" && activeDesignerSubs() === "0", { refund: refund.data, late: late.data });
    const v = await verify(meera, co.data.orderId, p.id);
    check("    ...and verify reports it as refunded (409 payment_refunded)", v.status === 409 && v.data.code === "payment_refunded", v.data);
  }

  console.log("\n=== 22. Two payments on one plan: refunding one keeps the other's 30 days ===");
  {
    const a = await checkout("designer_plus");
    const b = await checkout("designer_plus"); // a second tab, before either was paid
    const pa = plantPayment(a.data.orderId, { amount: 19900 });
    const pb = plantPayment(b.data.orderId, { amount: 19900 });
    await verify(meera, a.data.orderId, pa.id);
    await verify(meera, b.data.orderId, pb.id);
    const subId = paymentRow(a.data.orderId).subId;
    check("22. Both payments land on one subscription with exactly 60 days", paymentRow(b.data.orderId).subId === subId && subInfo(subId).seconds === 2 * THIRTY_DAYS && activeDesignerSubs() === "1", subInfo(subId));
    Object.assign(mock.payments.get(pb.id), { amount_refunded: 19900, status: "refunded" });
    await webhook(refundEvent(pb, 19900));
    const afterB = subInfo(subId);
    check("    Refunding the second payment takes back exactly its 30 days; the plan stays active", afterB.status === "active" && afterB.seconds === THIRTY_DAYS && afterB.endFuture, afterB);
    await webhook(refundEvent(pb, 19900));
    check("    Replaying that refund takes nothing more", subInfo(subId).seconds === THIRTY_DAYS);
    Object.assign(mock.payments.get(pa.id), { amount_refunded: 19900, status: "refunded" });
    await webhook(refundEvent(pa, 19900));
    const afterA = subInfo(subId);
    check("    Refunding the first payment too ends the plan now", afterA.status === "cancelled" && !afterA.endFuture && activeDesignerSubs() === "0", afterA);
  }

  console.log("\n=== 19. Payment switches off block purchases ===");
  {
    lapsePaidPlan();
    const ordersBefore = mock.orders.size;
    await settings({ designerSubscriptionsEnabled: false });
    const r1 = await checkout("designer_plus");
    await settings({ designerSubscriptionsEnabled: true, paymentSystemEnabled: false });
    const r2 = await checkout("designer_pro");
    check("19. Designer subscriptions off → checkout refused (409)", r1.status === 409, r1.data);
    check("    Payment system off → checkout refused (409)", r2.status === 409, r2.data);
    check("    ...and no Razorpay order was created in either case", mock.orders.size === ordersBefore, mock.orders.size - ordersBefore);
  }

  console.log("\n=== 20. Customers stay free ===");
  {
    const res = await api(aanya, "/api/payments/checkout", { role: "customer" });
    check("20. There is no customer plan to buy (409 customer_free)", res.status === 409 && res.data.code === "customer_free", res.data);
    const home = await fetch(`${APP_URL}/home`, { headers: { cookie: aanya } });
    check("    Customer Home works with no subscription", home.status === 200 && !(await home.text()).includes("SUBSCRIPTION REQUIRED"));
    check("    No payments or subscriptions exist for the customer", sql(`select count(*) from public.payments p join public.users u on u.id = p.user_id where u.email = '${AANYA_EMAIL}';`) === "0");
  }

  console.log("\n=== No secrets in responses ===");
  {
    const adminView = await api(admin, "/api/admin/subscriptions", undefined, "GET");
    const blob = JSON.stringify(adminView.data);
    check("    Admin payment monitoring never contains the key secret or webhook secret", adminView.status === 200 && !blob.includes(KEY_SECRET) && !blob.includes(WEBHOOK_SECRET));
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) console.log("Failed:", failures.join(", "));
}

try {
  await main();
} catch (err) {
  console.error("Test suite crashed:", err);
  fail++;
} finally {
  // Back to the seeded default (payments off), then stop the mock.
  try { sql(`update public.payment_settings set payment_system_enabled = false, designer_subscriptions_enabled = false;`); } catch {}
  server.close();
}
process.exit(fail > 0 ? 1 : 0);
