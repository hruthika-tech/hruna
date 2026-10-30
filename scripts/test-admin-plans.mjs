// HRUNA — admin designer-plan management end to end, against the LOCAL seeded stack: the admin
// bundle lists exactly the three designer plans (legacy ₹499 designer / ₹299 customer plans kept
// separately as history), each plan can be edited safely and the edit takes effect (checkout price,
// database limits), server-side validation, retired plans are read-only, non-admins can't edit
// (API and RLS), customers stay free even with the legacy customer flag on, Free never checks out,
// historical payments are unchanged by edits, and the admin page in a browser.
// Run on a freshly reset local stack (placeholder Razorpay keys: checkout stops at Razorpay with 502
// after the pending payment row has been written at the server price). Prereqs as test-analytics.

import { execSync } from "node:child_process";
import { APP_URL, assertLocalTestEnvironment, signInDirect, signInWithPassword } from "./lib/test-auth.mjs";

await assertLocalTestEnvironment();
const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 500)}` : ""}`);
  }
};
const sql = (q) => execSync(`docker exec ${DB_CONTAINER} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "${q.replace(/\s*\n\s*/g, " ").replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const n = (q) => Number(sql(q).split("\n").pop());

const MEERA = "d1000000-0000-0000-0000-000000000001";
const MEERA_USER = "d0000000-0000-0000-0000-000000000001";
const AANYA_USER = "c0000000-0000-0000-0000-000000000001";
const COLLECTION = "e1000000-0000-0000-0000-000000000001";
const planId = (key) => sql(`select id from public.subscription_plans where plan_key = '${key}'`);
const LEGACY_DESIGNER = sql("select id from public.subscription_plans where role = 'designer' and plan_key is null limit 1");
const LEGACY_CUSTOMER = sql("select id from public.subscription_plans where role = 'customer' limit 1");

async function api(path, cookie, { method = "GET", body } = {}) {
  const res = await fetch(`${APP_URL}${path}`, { method, headers: { "content-type": "application/json", cookie: cookie ?? "" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const patchPlan = (cookie, id, body) => api(`/api/admin/subscriptions/plans/${id}`, cookie, { method: "PATCH", body });

// Plans + payments on (local only); the legacy customer flag on too, as an old database may have it.
sql(`delete from public.user_subscriptions where user_id in ('${MEERA_USER}','${AANYA_USER}')`);
sql("update public.payment_settings set payment_system_enabled = true, designer_subscriptions_enabled = true, customer_subscriptions_enabled = true where id");
// Historical payments on the retired plans (₹499 designer, ₹299 customer) that edits must not touch.
sql(`insert into public.payments (user_id, plan_id, amount, currency, status, payment_provider, provider_reference, paid_at) values
  ('${MEERA_USER}', '${LEGACY_DESIGNER}', 499, 'INR', 'succeeded', 'razorpay', 'pay_legacy_admin_test_1', now() - interval '60 days'),
  ('${AANYA_USER}', '${LEGACY_CUSTOMER}', 299, 'INR', 'succeeded', 'razorpay', 'pay_legacy_admin_test_2', now() - interval '45 days')`);
const historyBefore = sql("select string_agg(id || ':' || plan_id || ':' || amount || ':' || status, ',' order by provider_reference) from public.payments where provider_reference like 'pay_legacy_admin_test_%'");

const admin = await signInWithPassword("admin@lilirve.dev");
const meera = await signInWithPassword("meera@lilirve.dev");
const aanya = await signInWithPassword("aanya@lilirve.dev");

console.log("\n=== The admin sees the three designer plans ===");
let bundle;
{
  bundle = await api("/api/admin/subscriptions", admin);
  const d = bundle.data;
  const summary = (d?.designerPlans ?? []).map((p) => `${p.planKey}|${p.name}|${p.price}|${p.billingInterval}|${p.isActive}|${p.limits?.dresses ?? "∞"}|${p.limits?.collections ?? "∞"}|${p.limits?.previous_creations ?? "∞"}|${p.limits?.highlights}|${p.limits?.meet_entries}|${p.limits?.proposals_per_month ?? "∞"}|${p.limits?.analytics_max_days}|${p.limits?.analytics_comparison}`);
  check("GET /api/admin/subscriptions: plansReady and exactly Free / Designer Plus / Designer Pro, in order, with prices and limits", bundle.status === 200 && d.plansReady === true && JSON.stringify(summary) === JSON.stringify([
    "designer_free|Free|0|monthly|true|5|3|10|3|2|5|7|false",
    "designer_plus|Designer Plus|199|monthly|true|20|10|50|3|2|25|90|true",
    "designer_pro|Designer Pro|299|monthly|true|∞|∞|∞|3|2|∞|90|true",
  ]), summary);
  const legacy = (d?.legacyPlans ?? []).map((p) => `${p.role}|${p.price}|${p.legacy}`).sort();
  check("the old ₹499 designer plan and the ₹299 customer plan are listed separately as legacy, not as designer plans", JSON.stringify(legacy) === JSON.stringify(["customer|299|true", "designer|499|true"]) && !d.designerPlans.some((p) => p.legacy || p.price === 499 || p.role === "customer"), legacy);
  const hist = (d?.payments ?? []).filter((p) => /pay_legacy_admin_test_/.test(p.transactionId ?? ""));
  check("historical payments show their (legacy) plan", hist.length === 2 && hist.every((p) => p.planLegacy === true && p.planName), hist);
  check("non-admins can't read the admin bundle (signed out 401, designer/customer 403)", (await api("/api/admin/subscriptions")).status === 401 && (await api("/api/admin/subscriptions", meera)).status === 403 && (await api("/api/admin/subscriptions", aanya)).status === 403);
}

console.log("\n=== The admin can edit each plan ===");
{
  const plus = await patchPlan(admin, planId("designer_plus"), { name: "Designer Plus", price: 249, features: ["Up to 20 dress listings", "30/90-day analytics"], limits: { proposals_per_month: 30 } });
  check("Designer Plus: price 249, features and proposals limit saved", plus.status === 200 && plus.data.plan.price === 249 && plus.data.plan.limits.proposals_per_month === 30 && n("select price from public.subscription_plans where plan_key='designer_plus'") === 249, plus.data);
  const pro = await patchPlan(admin, planId("designer_pro"), { description: "Everything unlimited.", limits: { dresses: null, analytics_max_days: 90, analytics_comparison: true } });
  check("Designer Pro: description saved, unlimited stays unlimited (null)", pro.status === 200 && pro.data.plan.limits.dresses === null && sql("select coalesce(max_dresses::text,'null') from public.subscription_plans where plan_key='designer_pro'") === "null", pro.data);
  const free = await patchPlan(admin, planId("designer_free"), { limits: { dresses: 2 } });
  check("Free: dress limit lowered to 2", free.status === 200 && free.data.plan.limits.dresses === 2, free.data);
  check("every edit is written to the admin audit log", n("select count(*) from public.admin_audit_log where action like 'Updated designer plan%'") >= 3);

  // The edit takes effect: meera (Free, 1 existing dress) can add one more, not two.
  const add = (i) => api("/api/designer/studio/dresses", meera, { method: "POST", body: { name: `Admin plan dress ${i}`, collectionId: COLLECTION, price: 1000 + i, description: "fixture" } });
  const first = await add(1);
  const second = await add(2);
  check("the new Free limit is enforced at once (2nd extra dress → 403 plan_limit dresses:2); existing dresses untouched", first.status === 200 && second.status === 403 && second.data.limit === 2 && n(`select count(*) from public.dresses where designer_id='${MEERA}'`) === 2, [first.status, second.data]);
  const restore = await patchPlan(admin, planId("designer_free"), { limits: { dresses: 5 } });
  check("Free restored to 5 dresses", restore.status === 200 && restore.data.plan.limits.dresses === 5);
  const ent = await api("/api/designer/plan", meera);
  check("designers see the edited plans (Plus at ₹249)", ent.data?.plans?.find((p) => p.planKey === "designer_plus")?.price === 249, ent.data?.plans);
}

console.log("\n=== Server-side validation ===");
{
  const bad = [
    ["Free price ≠ 0", "designer_free", { price: 10 }],
    ["Free switched off", "designer_free", { isActive: false }],
    ["paid plan at ₹0", "designer_plus", { price: 0 }],
    ["negative price", "designer_pro", { price: -1 }],
    ["3-decimal price", "designer_pro", { price: 199.999 }],
    ["price as a string", "designer_pro", { price: "299" }],
    ["fractional limit", "designer_plus", { limits: { dresses: 2.5 } }],
    ["negative limit", "designer_plus", { limits: { collections: -1 } }],
    ["analytics 60 days", "designer_plus", { limits: { analytics_max_days: 60 } }],
    ["highlights per plan", "designer_plus", { limits: { highlights: 10 } }],
    ["unknown limit", "designer_plus", { limits: { max_dresses: 1 } }],
    ["empty name", "designer_plus", { name: "  " }],
    ["13 features", "designer_plus", { features: Array.from({ length: 13 }, (_, i) => `f${i}`) }],
    ["empty edit", "designer_plus", {}],
  ];
  const statuses = [];
  for (const [, key, body] of bad) statuses.push((await patchPlan(admin, planId(key), body)).status);
  check(`${bad.length} invalid edits all → 400 with nothing changed`, statuses.every((s) => s === 400) && n("select price from public.subscription_plans where plan_key='designer_free'") === 0 && sql("select is_active from public.subscription_plans where plan_key='designer_free'") === "t" && n("select max_highlights from public.subscription_plans where plan_key='designer_plus'") === 3, bad.map(([label], i) => `${label}:${statuses[i]}`));
  const keys = await patchPlan(admin, planId("designer_plus"), { name: "Designer Plus", planKey: "designer_pro", role: "customer", tierRank: 9 });
  check("plan key / role / tier can't be changed (ignored)", keys.status === 200 && sql("select plan_key || role || tier_rank from public.subscription_plans where id = '" + planId("designer_plus") + "'") === "designer_plusdesigner1", keys.data);
  const legacy = await patchPlan(admin, LEGACY_DESIGNER, { price: 199, isActive: true });
  const legacyCust = await patchPlan(admin, LEGACY_CUSTOMER, { isActive: false });
  check("retired plans can't be edited (409 legacy_plan) and stay unchanged", legacy.status === 409 && legacy.data.code === "legacy_plan" && legacyCust.status === 409 && n(`select price from public.subscription_plans where id='${LEGACY_DESIGNER}'`) === 499 && sql(`select is_active from public.subscription_plans where id='${LEGACY_DESIGNER}'`) === "f");
  check("unknown plan id → 404", (await patchPlan(admin, "00000000-0000-0000-0000-000000000000", { name: "x" })).status === 404 && (await patchPlan(admin, "not-a-uuid", { name: "x" })).status === 404);
  check("no duplicate plans were created", n("select count(*) from public.subscription_plans where plan_key is not null") === 3 && n("select count(*) from public.subscription_plans") === 5);
}

console.log("\n=== Unauthorized users can't edit ===");
{
  const id = planId("designer_plus");
  const out = await patchPlan(null, id, { price: 1 });
  const des = await patchPlan(meera, id, { price: 1 });
  const cus = await patchPlan(aanya, id, { price: 1 });
  check("PATCH plan: signed out 401, designer 403, customer 403", out.status === 401 && des.status === 403 && cus.status === 403, [out.status, des.status, cus.status]);
  const { client: meeraDb } = await signInDirect("meera@lilirve.dev");
  await meeraDb.from("subscription_plans").update({ price: 1 }).eq("id", id);
  const ins = await meeraDb.from("subscription_plans").insert({ role: "designer", name: "Hack", price: 1, currency: "INR", billing_interval: "monthly" });
  check("RLS: a designer can't update or add plans directly", n(`select price from public.subscription_plans where id='${id}'`) === 249 && !!ins.error);
  const settings = await api("/api/admin/settings/payment", meera, { method: "PATCH", body: { paymentSystemEnabled: false } });
  check("payment switches: designer → 403", settings.status === 403);
}

console.log("\n=== Customers stay free ===");
{
  const on = await api("/api/admin/settings/payment", admin, { method: "PATCH", body: { customerSubscriptionsEnabled: true } });
  check("the admin can't switch customer subscriptions on (400)", on.status === 400, on.data);
  check("(state) the legacy customer flag is still on in the database", sql("select customer_subscriptions_enabled from public.payment_settings") === "t");
  const before = n("select count(*) from public.payments");
  const c1 = await api("/api/payments/checkout", aanya, { method: "POST", body: { role: "customer" } });
  const c2 = await api("/api/payments/checkout", aanya, { method: "POST", body: { role: "customer", planId: LEGACY_CUSTOMER, price: 299 } });
  check("customer checkout → 409 customer_free (also with a plan id / price in the body); no payment row", c1.status === 409 && c1.data.code === "customer_free" && c2.status === 409 && n("select count(*) from public.payments") === before, [c1.data, c2.data]);
  for (const path of ["/home", "/discover", "/requests", "/projects", "/messages", "/profile", "/subscription"]) {
    const res = await fetch(`${APP_URL}${path}`, { headers: { cookie: aanya }, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    check(`customer ${path} loads (200), no subscription wall`, res.status === 200 && !/subscription has ended|Subscribe to continue/i.test(html), res.status);
  }
  const page = await (await fetch(`${APP_URL}/subscription`, { headers: { cookie: aanya } })).text();
  check("/subscription says HRUNA is free for customers and offers no plan to buy", /HRUNA is free for customers/.test(page) && !/Customer Monthly|>Subscribe</.test(page));
  const off = await api("/api/admin/settings/payment", admin, { method: "PATCH", body: { customerSubscriptionsEnabled: false } });
  check("the admin can turn the legacy customer flag off", off.status === 200 && sql("select customer_subscriptions_enabled from public.payment_settings") === "f", off.data);
}

console.log("\n=== Checkout uses the server price; Free never checks out ===");
{
  const before = n("select count(*) from public.payments");
  const free = await api("/api/payments/checkout", meera, { method: "POST", body: { role: "designer", planKey: "designer_free" } });
  check("Free → 400, no payment row, no Razorpay order", free.status === 400 && n("select count(*) from public.payments") === before, free.data);
  const plus = await api("/api/payments/checkout", meera, { method: "POST", body: { role: "designer", planKey: "designer_plus", price: 1, amount: 100 } });
  const plusRow = sql(`select amount || '|' || status from public.payments where user_id='${MEERA_USER}' and plan_id='${planId("designer_plus")}' order by created_at desc limit 1`);
  check("Plus checkout records the admin-set ₹249 (browser price ignored); stops at the placeholder Razorpay (502, row failed)", plus.status === 502 && plusRow === "249.00|failed", [plus.status, plusRow]);
  const pro = await api("/api/payments/checkout", meera, { method: "POST", body: { role: "designer", planKey: "designer_pro", price: 1 } });
  const proRow = sql(`select amount from public.payments where user_id='${MEERA_USER}' and plan_id='${planId("designer_pro")}' order by created_at desc limit 1`);
  check("Pro checkout records the server price ₹299", pro.status === 502 && proRow === "299.00", [pro.status, proRow]);
  await patchPlan(admin, planId("designer_pro"), { isActive: false });
  const inactive = await api("/api/payments/checkout", meera, { method: "POST", body: { role: "designer", planKey: "designer_pro" } });
  check("an inactive paid plan can't be bought", inactive.status >= 400 && inactive.status < 500 && inactive.status !== 401, inactive.data);
  await patchPlan(admin, planId("designer_pro"), { isActive: true });
}

console.log("\n=== Historical payments are unchanged ===");
{
  const after = sql("select string_agg(id || ':' || plan_id || ':' || amount || ':' || status, ',' order by provider_reference) from public.payments where provider_reference like 'pay_legacy_admin_test_%'");
  check("the ₹499 / ₹299 legacy payments keep their plan, amount and status after all the edits", after === historyBefore && /:499\.00:succeeded/.test(after), { historyBefore, after });
  const b = await api("/api/admin/subscriptions", admin);
  check("the admin bundle still has exactly three designer plans after the edits", b.data.designerPlans.length === 3 && b.data.legacyPlans.length === 2);
}

console.log("\n=== Admin page (browser) ===");
{
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies(admin.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(APP_URL).hostname, path: "/" }; }));
    const page = await ctx.newPage();
    await page.goto(`${APP_URL}/admin/subscriptions`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="designer-plans-admin"]').waitFor({ timeout: 30000 });
    const cards = await page.locator('[data-testid^="admin-plan-designer_"]').count();
    const text = await page.locator("body").innerText();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`@${w}: three plan cards, retired-plan history, no customer-subscription toggle, no sideways scroll`, cards === 3 && (await page.locator('[data-testid="legacy-plans"]').count()) === 1 && !/Customer Plan|Customer subscriptions(?! *: none)/.test(text) && /customers are always free/i.test(text) && overflow <= 0, { cards, overflow });
    if (w === 1440) {
      const freePrice = await page.locator('[data-testid="admin-plan-designer_free"] input[type=number]').first().isDisabled();
      check("the Free price field is locked", freePrice);
      const proposals = page.locator('[data-testid="admin-plan-designer_plus"] input[id^="proposals_per_month-"]');
      await proposals.fill("26");
      await page.locator('[data-testid="save-designer_plus"]').click();
      await page.waitForFunction(() => document.body.innerText.includes("saved."), null, { timeout: 15000 }).catch(() => {});
      check("saving a plan from the page persists it", n("select max_proposals_per_month from public.subscription_plans where plan_key='designer_plus'") === 26);
    }
    await ctx.close();
  }
  await browser.close();
}

// Restore the seeded plans and switches.
await patchPlan(admin, planId("designer_plus"), { price: 199, limits: { proposals_per_month: 25 } });
sql("delete from public.payments where provider_reference like 'pay_legacy_admin_test_%'");
sql(`delete from public.dresses where designer_id='${MEERA}' and name like 'Admin plan dress%'`);
sql("update public.payment_settings set payment_system_enabled = false where id");
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
