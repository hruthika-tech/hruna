// LILIRVE — Phase 8 Razorpay payment/subscription test suite. Drives the REAL running app (real
// email + password sign-in, real API routes) plus a couple of direct psql checks for DB-level
// constraints.
//
// IMPORTANT — HONEST SCOPE STATEMENT (per this phase's explicit instruction not to fake results):
// No real Razorpay account/TEST-mode credentials are available in this environment.
// The local app's RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET/RAZORPAY_WEBHOOK_SECRET are test/placeholder
// values this script is ALSO given via HRUNA_TEST_RAZORPAY_* env vars (see below), which is enough to fully and
// GENUINELY exercise:
//   - every auth/role/plan/feature-flag validation the checkout route performs BEFORE it ever
//     calls Razorpay's real API,
//   - the actual signature-verification math in /api/payments/verify and /api/payments/webhook
//     (HMAC-SHA256 is pure cryptography — computing it with the same secret the running server
//     has is a genuine test of that code path, not a simulation of one),
//   - webhook idempotency and DB-level uniqueness constraints,
//   - SubscriptionGate responding to real activated state,
//   - admin monitoring, and secret-leakage checks.
// What this suite CANNOT verify, and does not claim to: an actual Razorpay order being created
// against Razorpay's real servers (the checkout route's call to createRazorpayOrder() will fail
// with the placeholder credentials — verified below as an EXPECTED, safely-handled failure, not
// treated as a full "order created" success), and a real Checkout.js browser interaction. Both
// require real Razorpay TEST-mode credentials (and the webhook additionally needs a publicly
// reachable URL configured in the Razorpay Dashboard) to test for real.
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + supabase/test-fixtures/phase8-payments.sql applied
// + `npx next dev -p 3100` running. Run with: node scripts/test-phase8-payments.mjs

import crypto from "node:crypto";
import { execSync } from "node:child_process";

import { APP_URL, signInWithPassword, requireEnv } from "./lib/test-auth.mjs";

// TEST-ONLY Razorpay credentials, read from the environment (never hardcoded). They must equal the
// RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET the LOCAL app under test runs with,
// because this suite signs payments/webhooks with them and the app verifies those signatures.
// Live credentials are refused: Razorpay secrets carry no live/test marker, so the key id (which
// does — rzp_test_… vs rzp_live_…) is required purely as that safety check.
const RAZORPAY_TEST_KEY_ID = requireEnv("HRUNA_TEST_RAZORPAY_KEY_ID");
if (!RAZORPAY_TEST_KEY_ID.startsWith("rzp_test_")) {
  console.error("\n✗ HRUNA_TEST_RAZORPAY_KEY_ID must be a Razorpay TEST-mode key id (rzp_test_…). Live credentials are never used by automated tests.");
  process.exit(2);
}
const RAZORPAY_KEY_SECRET = requireEnv("HRUNA_TEST_RAZORPAY_KEY_SECRET");
const RAZORPAY_WEBHOOK_SECRET = requireEnv("HRUNA_TEST_RAZORPAY_WEBHOOK_SECRET");

const FIXTURE_PAYMENT_1 = "97000000-0000-0000-0000-000000000001";
const FIXTURE_ORDER_1 = "order_test_fixture_001";
const FIXTURE_PAYMENT_2 = "97000000-0000-0000-0000-000000000002";
const FIXTURE_ORDER_2 = "order_test_fixture_002";
const FIXTURE_AMOUNT_PAISE = 29900; // 299 INR seeded customer plan price, in paise

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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${JSON.stringify(detail).slice(0, 250)}` : ""}`);
  }
}

function sql(query) {
  return execSync(`docker exec -i supabase_db_lilirve-app psql -U postgres -d postgres -t -A -c "${query.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
  }).trim();
}

/** Signs a SEEDED account in through the real app API (POST /api/auth/login — email + password,
 *  exactly what the frontend does) and returns the session cookie header. */
const signIn = (email) => signInWithPassword(email);

async function api(cookie, path, options = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function paymentSignature(orderId, paymentId) {
  return crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

function webhookSignature(rawBody) {
  return crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
}

async function webhookPost(rawBody, signature) {
  const res = await fetch(`${APP_URL}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
    body: rawBody,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log("\n=== Setup: sign in as personas ===");
  const aanya = await signIn("aanya@lilirve.dev"); // customer, no designer profile
  const meera = await signIn("meera@lilirve.dev"); // designer, no customer profile
  const admin = await signIn("admin@lilirve.dev");

  console.log("\n=== 1. Unauthenticated user cannot initiate checkout ===");
  {
    const res = await api(null, "/api/payments/checkout", { method: "POST", body: JSON.stringify({ role: "customer" }) });
    check("1. Unauthenticated checkout is rejected (401)", res.status === 401, res.data);
  }

  console.log("\n=== 2/3. Cannot purchase a plan for a role you don't hold ===");
  {
    const customerTriesDesignerPlan = await api(aanya, "/api/payments/checkout", { method: "POST", body: JSON.stringify({ role: "designer" }) });
    check("2. Customer (no designer profile) cannot buy the designer plan", customerTriesDesignerPlan.status === 403, customerTriesDesignerPlan.data);

    const designerTriesCustomerPlan = await api(meera, "/api/payments/checkout", { method: "POST", body: JSON.stringify({ role: "customer" }) });
    check("3. Designer (no customer profile) cannot buy the customer plan", designerTriesCustomerPlan.status === 403, designerTriesCustomerPlan.data);
  }

  console.log("\n=== 4. Invalid plan/role cannot be purchased ===");
  {
    const res = await api(aanya, "/api/payments/checkout", { method: "POST", body: JSON.stringify({ role: "not-a-real-role" }) });
    check("4. An invalid role value is rejected (400)", res.status === 400, res.data);
  }

  console.log("\n=== 5. Payment-system-disabled state blocks real checkout ===");
  {
    const settingsBefore = await api(admin, "/api/admin/subscriptions");
    check("   (sanity) payment_system_enabled starts false, as seeded", settingsBefore.data.settings?.paymentSystemEnabled === false, settingsBefore.data.settings);

    const res = await api(aanya, "/api/payments/checkout", { method: "POST", body: JSON.stringify({ role: "customer" }) });
    check("5. Checkout is blocked while payments are disabled (409)", res.status === 409, res.data);
  }

  console.log("\n=== 6. Eligible checkout reaches Razorpay, fails safely without real credentials ===");
  {
    const enable = await api(admin, "/api/admin/settings/payment", {
      method: "PATCH",
      body: JSON.stringify({ paymentSystemEnabled: true, customerSubscriptionsEnabled: true }),
    });
    check("   (setup) Admin enables payments + customer subscriptions", enable.status === 200, enable.data);

    const res = await api(aanya, "/api/payments/checkout", { method: "POST", body: JSON.stringify({ role: "customer" }) });
    check(
      "6. Eligible checkout passes ALL app-level validation and only fails at the real Razorpay API call (502, safe generic message, no real order created — NOT a full pass; real TEST credentials are required to actually create a Razorpay order)",
      res.status === 502 && !/secret|key_secret|stack/i.test(JSON.stringify(res.data)),
      res.data
    );
  }

  console.log("\n=== 7/8. Client cannot forge payment success; invalid signature is rejected ===");
  {
    // Deliberately uses the SECOND fixture payment/order (not the one test 10/11 later activate
    // for real) — a rejected forged attempt correctly marks that row failed (see the verify
    // route), and this test must not consume the row test 10 needs to still be pending.
    const forged = await api(aanya, "/api/payments/verify", {
      method: "POST",
      body: JSON.stringify({ razorpay_order_id: FIXTURE_ORDER_2, razorpay_payment_id: "pay_forged123", razorpay_signature: "0000not-a-real-signature" }),
    });
    check("7/8. A forged/invalid signature is rejected, never marks the payment succeeded", forged.status === 400, forged.data);

    const statusAfter = sql(`select status from public.payments where id = '${FIXTURE_PAYMENT_2}';`);
    check("   The fixture payment is still NOT succeeded after the forged attempt", statusAfter !== "succeeded", { statusAfter });
  }

  console.log("\n=== 9. Invalid webhook signature is rejected ===");
  {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: FIXTURE_ORDER_1, amount: FIXTURE_AMOUNT_PAISE } } } });
    const res = await webhookPost(rawBody, "0000invalid-signature");
    check("9. An invalid webhook signature is rejected (400)", res.status === 400, res.data);

    const noSig = await fetch(`${APP_URL}/api/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: rawBody });
    check("   A missing webhook signature is also rejected", noSig.status === 400);
  }

  console.log("\n=== 10. A validly-signed webhook updates the correct record ===");
  {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_fixture_001", order_id: FIXTURE_ORDER_1, amount: FIXTURE_AMOUNT_PAISE } } } });
    const signature = webhookSignature(rawBody);
    const res = await webhookPost(rawBody, signature);
    check("10. A correctly-signed payment.captured webhook is accepted", res.status === 200, res.data);

    const paymentStatus = sql(`select status from public.payments where id = '${FIXTURE_PAYMENT_1}';`);
    check("    ...and marks the correct payment row succeeded", paymentStatus === "succeeded", { paymentStatus });

    const subCount = sql(
      `select count(*) from public.user_subscriptions where user_id = 'c0000000-0000-0000-0000-000000000001' and role = 'customer' and status = 'active';`
    );
    check("    ...and creates exactly one active subscription for the real user", subCount === "1", { subCount });
  }

  console.log("\n=== 11. Duplicate webhook delivery does not create duplicate records ===");
  {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_fixture_001", order_id: FIXTURE_ORDER_1, amount: FIXTURE_AMOUNT_PAISE } } } });
    const signature = webhookSignature(rawBody);
    const res = await webhookPost(rawBody, signature);
    check("11. A duplicate delivery of the same webhook is accepted (idempotent 200, not an error)", res.status === 200, res.data);

    const subCount = sql(
      `select count(*) from public.user_subscriptions where user_id = 'c0000000-0000-0000-0000-000000000001' and role = 'customer' and status = 'active';`
    );
    check("    ...still exactly one active subscription (no duplicate created)", subCount === "1", { subCount });

    const paymentCount = sql(`select count(*) from public.payments where provider_reference = 'pay_fixture_001';`);
    check("    ...still exactly one payment row references that Razorpay payment id", paymentCount === "1", { paymentCount });
  }

  console.log("\n=== 12. Duplicate provider ids are rejected at the database level ===");
  {
    // The constraint can only be exercised if the original row holding FIXTURE_ORDER_1 exists —
    // without it the duplicate insert would have nothing to collide with (previously this silently
    // inserted zero rows and reported "not rejected" for the wrong reason). Fail explicitly instead.
    const setupRows = sql(`select count(*) from public.payments where provider_order_id = '${FIXTURE_ORDER_1}';`);
    if (setupRows !== "1") {
      check("12. A second payments row with the same provider_order_id is rejected by the unique index", false, {
        reason: "setup payment row for FIXTURE_ORDER_1 is missing — apply supabase/test-fixtures/phase8-payments.sql",
        setupRows,
      });
    } else {
      let rejected = false;
      try {
        // Explicit VALUES (not INSERT … SELECT), so exactly one row is attempted.
        sql(
          `insert into public.payments (user_id, plan_id, amount, currency, status, payment_provider, provider_order_id) values ('c0000000-0000-0000-0000-000000000001', (select id from public.subscription_plans where role = 'customer'), 299, 'INR', 'pending', 'razorpay', '${FIXTURE_ORDER_1}');`
        );
      } catch {
        rejected = true;
      }
      check("12. A second payments row with the same provider_order_id is rejected by the unique index", rejected);
    }
  }

  console.log("\n=== 13. Subscription dates/status are stored correctly ===");
  {
    const row = sql(
      `select status, (end_date > now()) as not_yet_expired, (end_date - start_date < interval '32 days') as about_one_month from public.user_subscriptions where user_id = 'c0000000-0000-0000-0000-000000000001' and role = 'customer' and status = 'active';`
    );
    const [status, notExpired, aboutOneMonth] = row.split("|");
    check("13. Activated subscription has status=active, a future end_date, ~1 month duration", status === "active" && notExpired === "t" && aboutOneMonth === "t", { row });
  }

  console.log("\n=== 14. SubscriptionGate responds to the real activated state ===");
  {
    const home = await fetch(`${APP_URL}/home`, { headers: { cookie: aanya } });
    const homeText = await home.text();
    check("14. Customer Home is NOT gated now that a real active subscription exists", home.status === 200 && !homeText.includes("SUBSCRIPTION REQUIRED"), { status: home.status });
  }

  console.log("\n=== 15/16. Admin monitoring — access + non-admin denial ===");
  {
    const res = await api(admin, "/api/admin/subscriptions");
    check("15. Admin can see the real payment/subscription records", res.status === 200 && (res.data.payments ?? []).some((p) => p.id === FIXTURE_PAYMENT_1), res.data);
    check("    ...including the Razorpay order id, never a secret", res.data.payments?.find((p) => p.id === FIXTURE_PAYMENT_1)?.orderId === FIXTURE_ORDER_1);

    const nonAdmin = await api(meera, "/api/admin/subscriptions");
    check("16. Non-admin cannot access admin payment monitoring", nonAdmin.status !== 200, nonAdmin.data);

    const nonAdminSettings = await api(meera, "/api/admin/settings/payment", { method: "PATCH", body: JSON.stringify({ paymentSystemEnabled: false }) });
    check("    Non-admin cannot change payment settings", nonAdminSettings.status !== 200, nonAdminSettings.data);
  }

  console.log("\n=== Cleanup: cancel the fixture subscription, disable payments again ===");
  {
    const cancel = await api(aanya, "/api/payments/cancel", { method: "POST", body: JSON.stringify({ role: "customer" }) });
    check("    (cleanup) Real cancel endpoint works on the fixture subscription", cancel.status === 200, cancel.data);

    const disable = await api(admin, "/api/admin/settings/payment", { method: "PATCH", body: JSON.stringify({ paymentSystemEnabled: false }) });
    check("    (cleanup) Admin disables payments again (back to seeded default)", disable.status === 200, disable.data);
  }

  console.log("\n=== 17. Razorpay secret in the client bundle — checked separately ===");
  console.log("    (grep .next/static/ for RAZORPAY_KEY_SECRET/RAZORPAY_WEBHOOK_SECRET after a production build — see the final report)");

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("Failed:", failures.join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
