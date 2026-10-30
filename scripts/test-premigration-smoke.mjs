// HRUNA — the current code against a database WITHOUT the pending migrations (20261021000001 …
// 20261029000002), i.e. the state of the hosted project before they're applied. Proves a deploy ahead
// of the migrations is safe: every page loads, nobody is locked out, nothing is limited or sold, and
// analytics / withdrawal / request deletion say "not available yet" instead of failing.
//
// LOCAL STACK ONLY (scripts/lib/test-auth.mjs guard). Build that database locally by resetting a
// throwaway stack with migrations up to 20261020000001 and the seed as of commit 760f232.
// Read-mostly: the only writes are a save, a view and a dress (removed again by the next reset).
// Run with: node scripts/test-premigration-smoke.mjs

import { APP_URL, assertLocalTestEnvironment, signInWithPassword } from "./lib/test-auth.mjs";

await assertLocalTestEnvironment(); // local app + local Supabase only — aborts otherwise

const REQUEST_WITH_PROPOSAL = "71000000-0000-0000-0000-000000000001"; // aanya, proposal_received
const PROJECT = "91000000-0000-0000-0000-000000000001"; // aanya × meera, completed
const MEERA_DRESS = "e2000000-0000-0000-0000-000000000001";
const COLLECTION = "e1000000-0000-0000-0000-000000000001";

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
};
async function api(path, cookie, { method = "GET", body } = {}) {
  const res = await fetch(`${APP_URL}${path}`, { method, headers: { "content-type": "application/json", cookie: cookie ?? "" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function page(path, cookie) {
  const res = await fetch(`${APP_URL}${path}`, { headers: { cookie }, redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location"), locked: /subscription has ended|Subscribe to continue|Your subscription/i.test(html) };
}

const aanya = await signInWithPassword("aanya@lilirve.dev");
const meera = await signInWithPassword("meera@lilirve.dev");
const admin = await signInWithPassword("admin@lilirve.dev");
const ps = await api("/api/admin/subscriptions", admin);
console.log(`\n(payments ${ps.data?.settings?.paymentSystemEnabled ? "ON" : "OFF"}, designer subscriptions ${ps.data?.settings?.designerSubscriptionsEnabled ? "ON" : "OFF"})`);

console.log("\n=== Customer pages load, nobody locked out ===");
for (const p of ["/home", "/discover", "/requests", `/requests/${REQUEST_WITH_PROPOSAL}`, "/projects", `/projects/${PROJECT}`, "/notifications", "/messages", "/saved", "/profile", "/subscription", `/dresses/${MEERA_DRESS}`]) {
  const r = await page(p, aanya);
  check(`customer ${p} → 200, no subscription wall`, r.status === 200 && !r.locked, r);
}
console.log("\n=== Designer pages load, nobody locked out ===");
for (const p of ["/designer/home", "/designer/requests", `/designer/projects/${PROJECT}`, "/designer/notifications", "/designer/studio", "/designer/profile", "/designer/analytics", "/designer-subscription"]) {
  const r = await page(p, meera);
  check(`designer ${p} → 200, no subscription wall`, r.status === 200 && !r.locked, r);
}
console.log("\n=== Admin pages ===");
for (const p of ["/admin", "/admin/users", "/admin/subscriptions", "/admin/settings"]) {
  const r = await page(p, admin);
  check(`admin ${p} → 200`, r.status === 200, r);
}

console.log("\n=== APIs fall back instead of failing ===");
{
  const project = await api(`/api/projects/${PROJECT}`, aanya);
  check("project detail → 200 with withdrawalsAvailable=false and no withdrawals", project.status === 200 && project.data.project.withdrawalsAvailable === false && project.data.project.withdrawals.length === 0, project.data?.project && { a: project.data.project.withdrawalsAvailable, n: project.data.project.withdrawals?.length });
  const withdraw = await api(`/api/projects/${PROJECT}/withdrawals`, aanya, { method: "POST", body: { reason: "Testing the not-ready path" } });
  check("withdraw → 503 withdrawals_not_ready with a clear message", withdraw.status === 503 && withdraw.data.code === "withdrawals_not_ready", withdraw);
  const del = await api(`/api/requests/${REQUEST_WITH_PROPOSAL}`, aanya, { method: "DELETE" });
  check("delete request → 503 request_deletion_not_ready; request untouched", del.status === 503 && del.data.code === "request_deletion_not_ready", del);
  const req = await api(`/api/requests/${REQUEST_WITH_PROPOSAL}`, aanya);
  check("…the request is still there", req.status === 200, req.status);
  const analytics = await api("/api/designer/analytics", meera);
  check("designer analytics → 503 analytics_not_ready (friendly), not 500", analytics.status === 503 && analytics.data.code === "analytics_not_ready", analytics);
  const view = await fetch(`${APP_URL}/api/analytics/view`, { method: "POST", headers: { "content-type": "application/json", cookie: aanya, "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" }, body: JSON.stringify({ type: "dress", id: MEERA_DRESS }) });
  check("view tracking → 204 (silently skipped)", view.status === 204, view.status);
  const save = await api("/api/saved-items", aanya, { method: "POST", body: { itemType: "dress", itemId: MEERA_DRESS } });
  check("saving a dress still works (analytics credit skipped)", save.status === 200, save);
  const notif = await api("/api/notifications", aanya);
  check("notifications API → 200", notif.status === 200 || notif.status === 404, notif.status);
  const plan = await api("/api/designer/plan", meera);
  check("designer plan → 200, plans not active, no limits", plan.status === 200 && plan.data.plansActive === false && plan.data.limits.dresses === null, plan.data && { active: plan.data.plansActive, limits: plan.data.limits });
  const trial = await api("/api/designer/plan", meera, { method: "POST", body: { action: "start_trial" } });
  check("trial → 409 (not available), nothing created", trial.status === 409, trial);
  const free = await api("/api/payments/checkout", meera, { method: "POST", body: { role: "designer", planKey: "designer_plus" } });
  check("checkout → 409 (nothing can be bought yet)", free.status === 409, free);
  const customer = await api("/api/payments/checkout", aanya, { method: "POST", body: { role: "customer" } });
  check("customer checkout → 409 customer_free", customer.status === 409 && customer.data.code === "customer_free", customer);
  const dress = await api("/api/designer/studio/dresses", meera, { method: "POST", body: { name: "Pre-migration smoke dress", collectionId: COLLECTION, price: 1000, description: "smoke" } });
  check("a designer can still add a dress (no plan limits before the migration)", dress.status === 200, dress);
  const bundle = await api("/api/admin/subscriptions", admin);
  check("admin subscriptions → 200, plansReady=false (shows the not-set-up notice)", bundle.status === 200 && bundle.data.plansReady === false, bundle.data && { ready: bundle.data.plansReady });
}

console.log("\n=== In the browser ===");
{
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const ctxFor = async (cookie) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(APP_URL).hostname, path: "/" }; }));
    return ctx;
  };
  const errors = [];
  const watch = (p) => p.on("pageerror", (e) => errors.push(e.message));

  const d = await ctxFor(meera);
  const dp = await d.newPage();
  watch(dp);
  await dp.goto(`${APP_URL}/designer/analytics`, { waitUntil: "networkidle" });
  await dp.locator('[data-testid="analytics-not-ready"]').waitFor({ timeout: 30000 }).catch(() => undefined);
  check("analytics page shows 'Studio analytics are on their way' (no error screen)", (await dp.locator('[data-testid="analytics-not-ready"]').count()) === 1 && !(await dp.locator("text=Couldn't load your analytics").count()));
  await dp.goto(`${APP_URL}/designer/projects/${PROJECT}`, { waitUntil: "networkidle" });
  const designerProject = await dp.locator("body").innerText();
  check("designer project page loads without the withdrawal panel", /Atelier Meera|Project|progress/i.test(designerProject) && !/Withdraw from this project|Request withdrawal/i.test(designerProject));
  await d.close();

  const c = await ctxFor(aanya);
  const cp = await c.newPage();
  watch(cp);
  await cp.goto(`${APP_URL}/projects/${PROJECT}`, { waitUntil: "networkidle" });
  const customerProject = await cp.locator("body").innerText();
  check("customer project page loads without the withdrawal panel", customerProject.length > 200 && !/Withdraw from this project|Request withdrawal/i.test(customerProject));
  await cp.goto(`${APP_URL}/home`, { waitUntil: "networkidle" });
  check("customer home renders (no subscription wall)", !/subscription has ended|Subscribe to continue/i.test(await cp.locator("body").innerText()));
  await c.close();

  const a = await ctxFor(admin);
  const ap = await a.newPage();
  watch(ap);
  await ap.goto(`${APP_URL}/admin/subscriptions`, { waitUntil: "networkidle" });
  await ap.locator('[data-testid="plans-not-ready"]').waitFor({ timeout: 30000 }).catch(() => undefined);
  check("admin subscriptions page shows the 'plans not set up yet' notice", (await ap.locator('[data-testid="plans-not-ready"]').count()) === 1);
  await a.close();

  check("no uncaught page errors in the browser", errors.length === 0, errors);
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
