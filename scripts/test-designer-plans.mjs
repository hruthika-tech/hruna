// HRUNA — designer subscription plans end to end, against the LOCAL seeded stack with plans
// switched on (payment_settings, local only): plan lookup, Free limits enforced by the API AND the
// database (direct inserts, simultaneous requests), monthly proposal quota (IST calendar month) and
// duplicate proposals, the 14-day Pro trial (eligibility, one per account, races, no payment, expiry
// → Free without losing work), paid plans and downgrade, analytics ranges per plan (API + database),
// plans switched off = unrestricted, customers always free, authorization, and the plans page UI.
// Seed: meera (approved designer d1…01), ramesh (pending designer d1…02), aanya (customer), admin.
// Run on a freshly reset local stack. Prereqs as scripts/test-analytics.mjs.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_URL, anonKey, assertLocalTestEnvironment, signInDirect, signInWithPassword } from "./lib/test-auth.mjs";

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
const RAMESH = "d1000000-0000-0000-0000-000000000002";
const RAMESH_USER = "d0000000-0000-0000-0000-000000000002";
const AANYA_CUSTOMER = "c1000000-0000-0000-0000-000000000001";
const COLLECTION = "e1000000-0000-0000-0000-000000000001";
const DRESS = "e2000000-0000-0000-0000-000000000001";
const plansOn = () => sql("update public.payment_settings set payment_system_enabled = true, designer_subscriptions_enabled = true, customer_subscriptions_enabled = true where id");
const plansOff = () => sql("update public.payment_settings set payment_system_enabled = false where id");
// A paid plan granted directly in the database the way lib/payments/activate.ts does: lapsed rows
// are recorded as expired first (expiry itself is evaluated, so they may still read 'active').
const grantPlan = (planWhere, endExpr = "now() + interval '1 month'") => {
  sql(`update public.user_subscriptions set status = 'expired' where user_id = '${MEERA_USER}' and role = 'designer' and status = 'active' and end_date <= now()`);
  sql(`insert into public.user_subscriptions (user_id, role, plan_id, status, start_date, end_date, renewal_date) select '${MEERA_USER}', 'designer', id, 'active', now(), ${endExpr}, ${endExpr} from public.subscription_plans where ${planWhere} limit 1`);
};

async function api(path, cookie, { method = "GET", body } = {}) {
  const res = await fetch(`${APP_URL}${path}`, { method, headers: { "content-type": "application/json", cookie: cookie ?? "" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const dresses = () => n(`select count(*) from public.dresses where designer_id='${MEERA}'`);
const newDress = (cookie, i) => api("/api/designer/studio/dresses", cookie, { method: "POST", body: { name: `Plan test dress ${i}`, collectionId: COLLECTION, price: 1000 + i, description: "fixture" } });

// Reset subscription state for the test accounts; plans on.
sql(`delete from public.user_subscriptions where user_id in ('${MEERA_USER}','${RAMESH_USER}')`);
sql("delete from public.analytics_events");
plansOn();

const meera = await signInWithPassword("meera@lilirve.dev");
const ramesh = await signInWithPassword("ramesh@lilirve.dev");
const aanya = await signInWithPassword("aanya@lilirve.dev");
const admin = await signInWithPassword("admin@lilirve.dev");

console.log("\n=== Plan lookup ===");
{
  const rows = sql("select plan_key || '|' || price::int || '|' || is_active || '|' || coalesce(max_dresses::text,'∞') || '|' || coalesce(max_collections::text,'∞') || '|' || coalesce(max_previous_creations::text,'∞') || '|' || max_highlights || '|' || max_meet_entries || '|' || coalesce(max_proposals_per_month::text,'∞') || '|' || analytics_max_days || '|' || analytics_comparison from public.subscription_plans where plan_key is not null order by tier_rank").split("\n");
  check("exactly three designer plans with the agreed prices and limits", JSON.stringify(rows) === JSON.stringify([
    "designer_free|0|true|5|3|10|3|2|5|7|false",
    "designer_plus|199|true|20|10|50|3|2|25|90|true",
    "designer_pro|299|true|∞|∞|∞|3|2|∞|90|true",
  ]), rows);
  check("the legacy single designer plan is retired (kept for history)", n("select count(*) from public.subscription_plans where role='designer' and plan_key is null and is_active") === 0);
  let freeBad = false;
  try { sql("update public.subscription_plans set price = 10 where plan_key = 'designer_free'"); } catch { freeBad = true; }
  check("the database refuses a non-zero price on Free", freeBad);

  const p = await api("/api/designer/plan", meera);
  check("GET /api/designer/plan: plans on, 3 plans, meera on Free, trial offered", p.status === 200 && p.data.plansActive === true && p.data.plans.length === 3 && p.data.current.planKey === "designer_free" && p.data.current.isTrial === false && p.data.trial.eligible === true, p.data?.current);
  check("…with her real usage (1 dress, 1 collection, 1 previous creation)", p.data.usage.dresses === 1 && p.data.usage.collections === 1 && p.data.usage.previous_creations === 1, p.data.usage);
  check("plan API: signed out → 401, customer → 403, admin → 403", (await api("/api/designer/plan")).status === 401 && (await api("/api/designer/plan", aanya)).status === 403 && (await api("/api/designer/plan", admin)).status === 403);
}

console.log("\n=== Free limits: dresses ===");
{
  for (let i = 0; i < 4; i++) await newDress(meera, i);
  check("Free: up to 5 dresses can be created", dresses() === 5);
  const over = await newDress(meera, 99);
  check("6th dress → 403 plan_limit (dresses, 5, Free) with a clear message; nothing created", over.status === 403 && over.data.code === "plan_limit" && over.data.resource === "dresses" && over.data.limit === 5 && /Free plan includes up to 5 dress listings/.test(over.data.message) && dresses() === 5, over.data);

  const { client: meeraDb } = await signInDirect("meera@lilirve.dev");
  const direct = await meeraDb.from("dresses").insert({ designer_id: MEERA, collection_id: COLLECTION, name: "bypass", price: 1, available: true }).select("id");
  check("a direct database insert can't bypass the limit (trigger: plan_limit)", !!direct.error && /plan_limit:dresses:5/.test(direct.error.message) && dresses() === 5, direct.error?.message);

  sql(`delete from public.dresses where designer_id='${MEERA}' and name like 'Plan test dress%' and price >= 1002`);
  check("(setup) back to 3 dresses", dresses() === 3, dresses());
  const race = await Promise.all([0, 1, 2, 3, 4].map((i) => newDress(meera, 200 + i)));
  check("5 simultaneous creates with room for 2 → exactly 2 succeed, total stays 5", race.filter((r) => r.status === 200).length === 2 && race.filter((r) => r.status === 403).length === 3 && dresses() === 5, race.map((r) => r.status));
  const edit = await api(`/api/designer/studio/dresses/${DRESS}`, meera, { method: "PATCH", body: { description: "Edited while at the limit." } });
  check("editing an existing dress at the limit still works", edit.status === 200, edit.data);
}

console.log("\n=== Free limits: collections and previous creations ===");
{
  const bytes = readFileSync(new URL("../public/images/stitch/dress-form-draping.png", import.meta.url));
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "image/png" }), "cover.png");
  form.set("bucket", "studioImages");
  form.set("entityType", "collection_cover");
  const up = await (await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie: meera }, body: form })).json();
  const fileId = up.file?.id ?? up.fileId ?? up.id;
  check("(setup) an image upload for covers", !!fileId, up);
  for (let i = 0; i < 2; i++) await api("/api/designer/studio/collections", meera, { method: "POST", body: { name: `Plan test collection ${i}`, coverImageFileId: fileId } });
  const c4 = await api("/api/designer/studio/collections", meera, { method: "POST", body: { name: "Plan test collection 4", coverImageFileId: fileId } });
  check("Free: 3 collections, the 4th → 403 plan_limit", n(`select count(*) from public.collections where designer_id='${MEERA}'`) === 3 && c4.status === 403 && c4.data.resource === "collections" && c4.data.limit === 3, c4.data);

  const pcForm = new FormData();
  pcForm.set("file", new Blob([bytes], { type: "image/png" }), "pc.png");
  pcForm.set("bucket", "studioImages");
  pcForm.set("entityType", "previous_creation");
  const pcUp = await (await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie: meera }, body: pcForm })).json();
  const pcFile = pcUp.file?.id ?? pcUp.fileId ?? pcUp.id;
  const made = await Promise.all(Array.from({ length: 12 }, (_, i) => api("/api/designer/studio/previous-creations", meera, { method: "POST", body: { imageFileId: pcFile, description: `Plan test creation ${i}`, year: "2026" } })));
  const total = n(`select count(*) from public.previous_creations where designer_id='${MEERA}'`);
  check("Free: previous creations stop at exactly 10, even with 12 sent at once", total === 10 && made.filter((r) => r.status === 200).length === 9 && made.every((r) => r.status === 200 || (r.status === 403 && r.data.resource === "previous_creations")), { total, statuses: made.map((r) => r.status) });
}

console.log("\n=== Proposal quota (calendar month, IST) and duplicates ===");
{
  const monthStart = sql("select to_char(public.ist_month_start() at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')");
  const istNow = new Date(Date.now() + 330 * 60_000).toISOString();
  check("month boundary = 1st of the current month, 00:00 India time", monthStart === `${istNow.slice(0, 7)}-01 00:00`, monthStart);

  const reqIds = sql(`insert into public.fashion_requests (customer_id, title, category, description, status) select '${AANYA_CUSTOMER}', 'Plan quota request ' || g, 'Occasion Wear', 'fixture', 'submitted' from generate_series(1, 8) g returning id`).split("\n").filter((l) => /^[0-9a-f-]{36}$/.test(l));
  check("(setup) 8 open public requests", reqIds.length === 8, reqIds.length);
  // An older proposal from last month must not count.
  sql(`insert into public.proposals (request_id, designer_id, price, description, status, created_at) values ('${reqIds[7]}', '${MEERA}', 500, 'last month', 'pending', public.ist_month_start() - interval '1 day')`);
  const used0 = n(`select count(*) from public.proposals where designer_id='${MEERA}' and created_at >= public.ist_month_start()`);
  const propose = (rid) => api("/api/designer/proposals", meera, { method: "POST", body: { requestId: rid, price: 9000, estimatedDays: 10, description: "Plan quota proposal" } });

  const dup = await Promise.all([propose(reqIds[0]), propose(reqIds[0])]);
  check("two simultaneous proposals on the same request → exactly one", dup.filter((r) => r.status === 200).length === 1 && n(`select count(*) from public.proposals where request_id='${reqIds[0]}' and designer_id='${MEERA}'`) === 1, dup.map((r) => [r.status, r.data?.code]));
  const again = await propose(reqIds[0]);
  check("a second proposal on the same request → 409 duplicate_proposal", again.status === 409 && again.data.code === "duplicate_proposal", again.data);

  let i = 1;
  while (n(`select count(*) from public.proposals where designer_id='${MEERA}' and created_at >= public.ist_month_start()`) < 5 && i < 7) await propose(reqIds[i++]);
  const atQuota = n(`select count(*) from public.proposals where designer_id='${MEERA}' and created_at >= public.ist_month_start()`);
  const over = await propose(reqIds[i]);
  check(`Free: 5 proposals this month (${used0} existed; last month's not counted), the next → 403 plan_limit`, atQuota === 5 && over.status === 403 && over.data.resource === "proposals_per_month" && over.data.limit === 5 && /calendar month/.test(over.data.message), { atQuota, over: over.data });
  const { client: meeraDb } = await signInDirect("meera@lilirve.dev");
  const direct = await meeraDb.from("proposals").insert({ request_id: reqIds[i], designer_id: MEERA, price: 1, description: "bypass" }).select("id");
  check("a direct database insert can't bypass the monthly quota", !!direct.error && /plan_limit:proposals_per_month:5/.test(direct.error.message), direct.error?.message);
  globalThis.__reqIds = reqIds;
  globalThis.__nextReq = i;
}

console.log("\n=== 14-day Designer Pro trial ===");
{
  const payments0 = n(`select count(*) from public.payments where user_id='${MEERA_USER}'`);
  check("an unapproved designer can't start a trial (409, approval first)", (await api("/api/designer/plan", ramesh, { method: "POST", body: { action: "start_trial" } })).status === 409);
  check("a customer can't start a designer trial (403)", (await api("/api/designer/plan", aanya, { method: "POST", body: { action: "start_trial" } })).status === 403);
  const t = await api("/api/designer/plan", meera, { method: "POST", body: { action: "start_trial" } });
  const days = (Date.parse(t.data?.trial?.endsAt) - Date.now()) / 86_400_000;
  check("meera starts the trial → Designer Pro for 14 days", t.status === 200 && t.data.trial.planKey === "designer_pro" && days > 13.9 && days <= 14, t.data);
  check("no payment was created and nothing can be charged (no payment row, no Razorpay order)", n(`select count(*) from public.payments where user_id='${MEERA_USER}'`) === payments0);
  const p = await api("/api/designer/plan", meera);
  check("the plan API shows Pro (trial) and no further trial offer", p.data.current.planKey === "designer_pro" && p.data.current.isTrial === true && p.data.trial.eligible === false && p.data.trial.used === true, p.data.current);
  const extra = await newDress(meera, 300);
  const prop = await api("/api/designer/proposals", meera, { method: "POST", body: { requestId: globalThis.__reqIds[globalThis.__nextReq], price: 9000, estimatedDays: 10, description: "Pro trial proposal" } });
  check("on the trial: a 6th dress and a 6th proposal this month are allowed", extra.status === 200 && prop.status === 200 && dresses() === 6, [extra.status, prop.status]);
  check("a second trial → 409 (already used)", (await api("/api/designer/plan", meera, { method: "POST", body: { action: "start_trial" } })).status === 409);

  // Simultaneous trial starts by one account → exactly one trial.
  sql(`update public.designer_verifications set overall_status = 'approved', identity_status = 'verified', portfolio_status = 'approved' where designer_id = '${RAMESH}'`);
  const both = await Promise.all([0, 1, 2].map(() => api("/api/designer/plan", ramesh, { method: "POST", body: { action: "start_trial" } })));
  check("3 simultaneous trial starts → exactly one trial", both.filter((r) => r.status === 200).length === 1 && n(`select count(*) from public.user_subscriptions where user_id='${RAMESH_USER}' and is_trial`) === 1, both.map((r) => r.status));
  sql(`update public.designer_verifications set overall_status = 'pending', identity_status = 'pending', portfolio_status = 'submitted' where designer_id = '${RAMESH}'`);

  // Expiry: move the trial's end into the past.
  sql(`update public.user_subscriptions set end_date = now() - interval '1 minute' where user_id='${MEERA_USER}' and is_trial`);
  const after = await api("/api/designer/plan", meera);
  check("after the trial ends → Free automatically (no job needed), no charge", after.data.current.planKey === "designer_free" && after.data.current.isTrial === false && n(`select count(*) from public.payments where user_id='${MEERA_USER}'`) === payments0, after.data.current);
  check("…nothing was deleted: all 6 dresses and 10 previous creations remain", dresses() === 6 && n(`select count(*) from public.previous_creations where designer_id='${MEERA}'`) === 10);
  check("…existing dresses can still be edited", (await api(`/api/designer/studio/dresses/${DRESS}`, meera, { method: "PATCH", body: { price: 70000 } })).status === 200);
  check("…but a new dress over Free's limit is refused", (await newDress(meera, 400)).status === 403);
  check("…and the trial can't be restarted", (await api("/api/designer/plan", meera, { method: "POST", body: { action: "start_trial" } })).status === 409);
  const studio = await fetch(`${APP_URL}/studio/${MEERA}`);
  check("…the public studio still shows every dress", studio.status === 200 && (await studio.text()).includes("Plan test dress 300"));
}

console.log("\n=== Paid plans and downgrade ===");
{
  grantPlan("plan_key = 'designer_plus'");
  const p = await api("/api/designer/plan", meera);
  check("an active paid Designer Plus subscription → Plus limits (20 dresses)", p.data.current.planKey === "designer_plus" && p.data.limits.dresses === 20 && (await newDress(meera, 500)).status === 200, p.data.current);
  const buy = await api("/api/payments/checkout", meera, { method: "POST", body: { role: "designer", planKey: "designer_pro" } });
  check("buying another plan while a paid plan is active → 409 (no stacked charges)", buy.status === 409, buy.data);
  sql(`update public.user_subscriptions set end_date = now() - interval '1 minute' where user_id='${MEERA_USER}' and not is_trial and status = 'active'`);
  check("when the paid month ends → Free again, without deleting anything", (await api("/api/designer/plan", meera)).data.current.planKey === "designer_free" && dresses() === 7);
  // Legacy plan subscriptions are honoured as Pro until they end.
  grantPlan("role = 'designer' and plan_key is null", "now() + interval '3 days'");
  check("a subscription on the retired legacy plan counts as Designer Pro until it ends", (await api("/api/designer/plan", meera)).data.current.planKey === "designer_pro");
  sql(`delete from public.user_subscriptions where user_id='${MEERA_USER}' and plan_id in (select id from public.subscription_plans where role='designer' and plan_key is null)`);
}

console.log("\n=== Analytics ranges per plan ===");
{
  const def = await api("/api/designer/analytics", meera);
  check("Free: the default analytics period is 7 days, with no previous-period comparison", def.status === 200 && def.data.analytics.range.days === 7 && def.data.analytics.entitlement.periodComparison === false && def.data.analytics.cards.find((c) => c.id === "requests").delta.kind === "unavailable", def.data?.analytics?.range);
  const thirty = await api("/api/designer/analytics?range=30", meera);
  check("Free: asking for 30 days → 403 plan_limit (analytics_days, 7)", thirty.status === 403 && thirty.data.resource === "analytics_days" && thirty.data.limit === 7, thirty.data);
  const { client: meeraDb } = await signInDirect("meera@lilirve.dev");
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const minus = (d) => new Date(Date.parse(`${today}T00:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);
  const direct30 = await meeraDb.rpc("designer_analytics", { p_start: minus(29), p_end: today });
  const directOld = await meeraDb.rpc("designer_analytics", { p_start: minus(20), p_end: minus(14) });
  const direct7 = await meeraDb.rpc("designer_analytics", { p_start: minus(6), p_end: today });
  check("…enforced in the database too: 30 days or older history refused, 7 days allowed without previous figures", /plan_limit:analytics_days:7/.test(direct30.error?.message ?? "") && /plan_limit:analytics_days:7/.test(directOld.error?.message ?? "") && !direct7.error && direct7.data.previous === null && direct7.data.unique_visitors.previous === null, { a: direct30.error?.message, b: directOld.error?.message, c: direct7.error });
  const internal = await meeraDb.rpc("designer_analytics_unrestricted", { p_start: minus(29), p_end: today });
  check("…and the unrestricted internal function can't be called directly", !!internal.error, internal.error?.code);
  grantPlan("plan_key = 'designer_plus'");
  const plus90 = await api("/api/designer/analytics?range=90", meera);
  check("Plus: 7/30/90 days with comparisons", plus90.status === 200 && plus90.data.analytics.range.days === 90 && JSON.stringify(plus90.data.analytics.entitlement.ranges) === "[7,30,90]" && plus90.data.analytics.entitlement.periodComparison === true, plus90.data?.analytics?.entitlement);
  sql(`delete from public.user_subscriptions where user_id='${MEERA_USER}' and not is_trial`);
}

console.log("\n=== Essential access stays on Free (over the limit) ===");
{
  const conv = await api("/api/designer/conversations", meera, { method: "POST", body: { customerId: AANYA_CUSTOMER } });
  const convId = conv.data?.conversation?.id ?? conv.data?.conversationId ?? conv.data?.id;
  const msg = convId ? await api(`/api/conversations/${convId}/messages`, meera, { method: "POST", body: { text: "Still here on Free." } }) : { status: 0 };
  check("messaging works on Free while over listing limits", conv.status === 200 && msg.status === 200, { conv: conv.status, msg: msg.status });
  check("projects, reviews and notifications load on Free", (await api("/api/designer/projects", meera)).status === 200 && (await api("/api/designer/reviews", meera)).status === 200 && (await api("/api/designer/notifications", meera)).status === 200);
}

console.log("\n=== Plans switched off (today's production state) ===");
{
  plansOff();
  const p = await api("/api/designer/plan", meera);
  check("plans off → plansActive false, no trial offered", p.data.plansActive === false && p.data.trial.eligible === false, p.data);
  check("…nothing is restricted: a Free designer over the limit can still add a dress", (await newDress(meera, 600)).status === 200);
  check("…and every analytics range is available", (await api("/api/designer/analytics?range=90", meera)).status === 200);
  check("…and a trial can't be started", (await api("/api/designer/plan", ramesh, { method: "POST", body: { action: "start_trial" } })).status === 409);
  plansOn();
}

console.log("\n=== Customers stay free ===");
{
  const home = await fetch(`${APP_URL}/home`, { headers: { cookie: aanya } });
  check("with every payment switch on, customer pages are never gated", home.status === 200 && !(await home.text()).includes("SUBSCRIPTION REQUIRED"));
  const co = await api("/api/payments/checkout", aanya, { method: "POST", body: { role: "customer" } });
  check("there's nothing for a customer to buy (409 customer_free)", co.status === 409 && co.data.code === "customer_free", co.data);
  const anon = createClient(SUPABASE_URL, anonKey(), { auth: { persistSession: false } });
  const ent = await anon.rpc("my_designer_entitlements");
  const startAnon = await anon.rpc("start_designer_pro_trial");
  check("signed out: entitlements and trial functions refuse", !!ent.error && !!startAnon.error);
  const { client: aanyaDb } = await signInDirect("aanya@lilirve.dev");
  const own = await aanyaDb.from("user_subscriptions").select("user_id");
  check("RLS: a user never sees another account's subscriptions", !own.error && (own.data ?? []).every((r) => r.user_id !== MEERA_USER));
  const forge = await aanyaDb.from("user_subscriptions").insert({ user_id: MEERA_USER, role: "designer", plan_id: sql("select id from public.subscription_plans where plan_key='designer_pro'"), status: "active" });
  check("RLS: nobody can grant themselves or others a plan directly", !!forge.error);
}

console.log("\n=== Plans page (browser) ===");
{
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addCookies(meera.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), domain: new URL(APP_URL).hostname, path: "/" }; }));
    const page = await ctx.newPage();
    await page.goto(`${APP_URL}/designer-subscription`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="designer-plans"]').waitFor({ timeout: 30000 });
    const plans = await page.locator('[data-testid^="plan-designer_"]').count();
    const current = await page.locator('[data-testid="current-plan"]').innerText();
    const usage = await page.locator('[data-testid="usage-item"]').count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`@${w}: 3 plans, current plan (Free), 4 usage figures, no sideways scroll`, plans === 3 && /Free/.test(current) && usage === 4 && overflow <= 0, { plans, current, usage, overflow });
    await ctx.close();
  }
  await browser.close();
}

sql("delete from public.fashion_requests where title like 'Plan quota request%'");
plansOff();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
