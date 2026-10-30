// HRUNA — request deletion (before a designer is chosen) and mutual project withdrawal (after).
// Real API routes + direct PostgREST attempts, local seeded stack only. Customer: aanya; assigned
// designer: meera (A); unrelated designer: ramesh (B, approved locally); unrelated customer: a fresh
// account. Migrations 20261023000001/2.
// Prereqs: app on HRUNA_TEST_APP_URL; HRUNA_TEST_SEED_PASSWORD, HRUNA_TEST_SUPABASE_ANON_KEY,
// HRUNA_TEST_SERVICE_KEY, HRUNA_TEST_MAILPIT_URL (fresh customer signup). Run: node scripts/test-request-withdrawal.mjs

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_URL, signInWithPassword, rawClientFromCookie, registerAndConfirm, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

const SERVICE_KEY = process.env.HRUNA_TEST_SERVICE_KEY;
if (!SERVICE_KEY) throw new Error("HRUNA_TEST_SERVICE_KEY (local stack only) is required");
await assertLocalTestEnvironment();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 450)}` : ""}`);
  }
};
const must = ({ error, data }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const CUSTOMER = "c1000000-0000-0000-0000-000000000001";
const A = "d1000000-0000-0000-0000-000000000001";
const B = "d1000000-0000-0000-0000-000000000002";
must(await admin.from("designer_verifications").update({ identity_status: "verified", portfolio_status: "approved", overall_status: "approved" }).eq("designer_id", B), "approve B (local)");

const customer = await signInWithPassword("aanya@lilirve.dev");
const designerA = await signInWithPassword("meera@lilirve.dev");
const designerB = await signInWithPassword("ramesh@lilirve.dev");
const { cookie: otherCustomer } = await registerAndConfirm(`withdrawal-other-${Date.now()}@example.test`, "Other Customer");
const api = async (cookie, method, path, body) => {
  const res = await fetch(`${APP_URL}${path}`, { method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const onboard = await api(otherCustomer, "POST", "/api/profile/customer", { name: "Other Customer", city: "Pune" });
if (onboard.status !== 200) throw new Error(`other customer onboarding: ${JSON.stringify(onboard.body)}`);
const customerDb = await rawClientFromCookie(customer);
const aDb = await rawClientFromCookie(designerA);
const bDb = await rawClientFromCookie(designerB);
const status = async (table, id) => must(await admin.from(table).select("status").eq("id", id).single(), table).status;
const inFeed = async (cookie, id) => ((await api(cookie, "GET", "/api/designer/feed")).body?.requests ?? []).some((r) => r.id === id);
const notes = async (cookie, path) => JSON.stringify((await api(cookie, "GET", path)).body ?? {});
const refused = (r) => !!r.error;

async function newRequest(title) {
  const r = await api(customer, "POST", "/api/requests", { title: `${title} ${Date.now()}`, category: "Occasion Wear", description: "withdrawal test" });
  if (r.status !== 200) throw new Error(`request: ${JSON.stringify(r.body)}`);
  return r.body.request.id;
}
async function newProject(title) {
  const req = await newRequest(title);
  const p = await api(designerA, "POST", "/api/designer/proposals", { requestId: req, price: 40000, estimatedDays: 20, description: "A" });
  const acc = await api(customer, "POST", `/api/proposals/${p.body.proposal.id}/accept`);
  if (acc.status !== 200) throw new Error(`accept: ${JSON.stringify(acc.body)}`);
  return { req, proj: acc.body.project.id };
}
const projectView = async (cookie, proj) => (await api(cookie, "GET", `/api/projects/${proj}`)).body?.project;

console.log("\n1. Customer deletes an eligible (unaccepted) request");
{
  const req = await newRequest("Delete me");
  const pA = await api(designerA, "POST", "/api/designer/proposals", { requestId: req, price: 30000, estimatedDays: 10, description: "A" });
  const pB = await api(designerB, "POST", "/api/designer/proposals", { requestId: req, price: 32000, estimatedDays: 12, description: "B" });
  check("(setup) two pending proposals on an open request", pA.status === 200 && pB.status === 200);
  const del = await api(customer, "DELETE", `/api/requests/${req}`);
  check("customer DELETE → 200", del.status === 200, del.body);
  const props = must(await admin.from("proposals").select("status").eq("request_id", req), "props");
  check("request closed as 'cancelled' (row kept), pending proposals declined", (await status("fashion_requests", req)) === "cancelled" && props.length === 2 && props.every((p) => p.status === "declined"), props);
  check("gone from both designers' Discover feeds", !(await inFeed(designerA, req)) && !(await inFeed(designerB, req)));
  const aNotes = await notes(designerA, "/api/designer/notifications");
  check("affected designer is notified the customer deleted it", aNotes.includes(`request-deleted-${pA.body.proposal.id}`) && /deleted/.test(aNotes));
  check("no longer a 'new request' notification for an unrelated designer", !(await notes(designerB, "/api/designer/notifications")).includes(`"request-${req}"`));
  const late = await api(designerB, "POST", "/api/designer/proposals", { requestId: req, price: 1, estimatedDays: 1, description: "late" });
  check("new proposals are refused (409)", late.status === 409 || late.status >= 400, late);
  const list = await api(customer, "GET", "/api/requests");
  check("hidden from the customer's own Requests list", !(list.body?.requests ?? []).some((r) => r.id === req));
  const again = await api(customer, "DELETE", `/api/requests/${req}`);
  check("deleting again → 409 'already deleted'", again.status === 409 && /already been deleted/i.test(again.body?.message ?? ""), again);
}

console.log("\n2. Designers (and other customers) can't delete a customer's request");
{
  const req = await newRequest("Not yours");
  const byDesigner = await api(designerA, "DELETE", `/api/requests/${req}`);
  check("designer DELETE → 403", byDesigner.status === 403, byDesigner);
  check("designer calling cancel_request() directly → refused", refused(await aDb.rpc("cancel_request", { p_request_id: req })));
  const viaUpdate = await aDb.from("fashion_requests").update({ status: "cancelled" }).eq("id", req).select();
  check("designer direct status update → nothing changed", (viaUpdate.data ?? []).length === 0 && (await status("fashion_requests", req)) === "submitted", viaUpdate);
  const byOther = await api(otherCustomer, "DELETE", `/api/requests/${req}`);
  check("another customer → 404 (not theirs)", byOther.status === 404, byOther);
  await api(designerA, "POST", "/api/designer/proposals", { requestId: req, price: 1000, estimatedDays: 5, description: "pending" });
  check("customer can't skip the workflow with a direct status update (pending proposal left)", refused(await customerDb.from("fashion_requests").update({ status: "cancelled" }).eq("id", req)) && refused(await customerDb.from("fashion_requests").update({ status: "accepted" }).eq("id", req)));
  const p = await newProject("Accepted, not deletable");
  const late = await api(customer, "DELETE", `/api/requests/${p.req}`);
  check("an accepted request with a project can't be deleted (409, points to withdrawal)", late.status === 409 && /withdrawal/i.test(late.body?.message ?? ""), late);
}

console.log("\n3–7. Withdrawal: request, validation, response, mutual approval");
{
  const P1 = await newProject("Withdraw: rejected");
  const empty = await api(customer, "POST", `/api/projects/${P1.proj}/withdrawals`, { reason: "   " });
  check("missing / blank reason → 400", empty.status === 400 && (await api(customer, "POST", `/api/projects/${P1.proj}/withdrawals`, {})).status === 400, empty);
  check("blank reason refused by the database too", refused(await customerDb.rpc("request_project_withdrawal", { p_project_id: P1.proj, p_reason: "  " })));
  const req1 = await api(customer, "POST", `/api/projects/${P1.proj}/withdrawals`, { reason: "My event was postponed." });
  check("CUSTOMER requests withdrawal → 200, pending", req1.status === 200 && req1.body?.withdrawal?.status === "pending" && req1.body.withdrawal.requestedByRole === "customer", req1.body);
  const row = must(await admin.from("project_withdrawals").select("*").eq("id", req1.body.withdrawal.id).single(), "row");
  check("stored: requester, role, reason, timestamp, pending", row.requested_by_role === "customer" && row.reason === "My event was postponed." && !!row.created_at && row.status === "pending" && !!row.requested_by);
  check("duplicate pending request (same side) → 409", (await api(customer, "POST", `/api/projects/${P1.proj}/withdrawals`, { reason: "again" })).status === 409);
  check("duplicate pending request (other side) → 409", (await api(designerA, "POST", `/api/projects/${P1.proj}/withdrawals`, { reason: "me too" })).status === 409);
  const dView = await projectView(designerA, P1.proj);
  check("the designer sees it on the project page (pending, from the customer, with the reason)", dView?.viewerRole === "designer" && dView?.withdrawals?.[0]?.status === "pending" && dView.withdrawals[0].reason === "My event was postponed.", dView?.withdrawals);
  check("…and gets a notification", (await notes(designerA, "/api/designer/notifications")).includes(`withdrawal-${req1.body.withdrawal.id}-pending`));
  const own = await api(customer, "POST", `/api/projects/${P1.proj}/withdrawals/${req1.body.withdrawal.id}`, { decision: "approve" });
  check("the requester can't approve their own request → 403", own.status === 403, own);
  const outsider = await api(designerB, "POST", `/api/projects/${P1.proj}/withdrawals/${req1.body.withdrawal.id}`, { decision: "approve" });
  check("an unrelated designer can't respond (404/403)", outsider.status === 404 || outsider.status === 403, outsider);
  check("…nor via the database function", refused(await bDb.rpc("respond_project_withdrawal", { p_withdrawal_id: req1.body.withdrawal.id, p_approve: true })));
  check("an unrelated designer / customer can't request one", (await api(designerB, "POST", `/api/projects/${P1.proj}/withdrawals`, { reason: "x" })).status >= 400 && (await api(otherCustomer, "POST", `/api/projects/${P1.proj}/withdrawals`, { reason: "x" })).status >= 400);
  const reject = await api(designerA, "POST", `/api/projects/${P1.proj}/withdrawals/${req1.body.withdrawal.id}`, { decision: "reject", reason: "Let's move the date instead." });
  const rej = must(await admin.from("project_withdrawals").select("*").eq("id", req1.body.withdrawal.id).single(), "rej");
  check("designer REJECTS → recorded with reason; pending cleared; project still active", reject.status === 200 && rej.status === "rejected" && rej.response_reason === "Let's move the date instead." && !!rej.responded_at && (await status("projects", P1.proj)) === "active", rej);
  check("…the customer is notified of the rejection", (await notes(customer, "/api/notifications")).includes(`withdrawal-${req1.body.withdrawal.id}-rejected`));
  const replay = await api(designerA, "POST", `/api/projects/${P1.proj}/withdrawals/${req1.body.withdrawal.id}`, { decision: "approve" });
  check("an answered request can't be answered again (409)", replay.status === 409, replay);

  const P2 = await newProject("Withdraw: approved");
  const req2 = await api(designerA, "POST", `/api/projects/${P2.proj}/withdrawals`, { reason: "Fabric supplier closed." });
  check("DESIGNER requests withdrawal → 200, pending", req2.status === 200 && req2.body?.withdrawal?.requestedByRole === "designer");
  check("…still active while only the designer has agreed", (await status("projects", P2.proj)) === "active");
  const approve = await api(customer, "POST", `/api/projects/${P2.proj}/withdrawals/${req2.body.withdrawal.id}`, { decision: "approve" });
  check("customer APPROVES → project 'withdrawn' (both agreed); request closed", approve.status === 200 && (await status("projects", P2.proj)) === "withdrawn" && (await status("fashion_requests", P2.req)) === "cancelled", approve.body);
  const cView = await projectView(customer, P2.proj);
  const dView2 = await projectView(designerA, P2.proj);
  check("'withdrawn' is visible to both participants, with the history", cView?.status === "withdrawn" && dView2?.status === "withdrawn" && dView2.withdrawals?.[0]?.status === "approved");
  check("…the designer is notified it was approved", (await notes(designerA, "/api/designer/notifications")).includes(`withdrawal-${req2.body.withdrawal.id}-approved`));
  const upd = await api(designerA, "POST", `/api/projects/${P2.proj}/updates`, { stage: "Cutting", note: "after withdrawal" });
  check("a withdrawn project's progress history is locked (409)", upd.status === 409 && upd.body?.code === "project_locked", upd);
  check("withdrawn is final: no status change, no new withdrawal", refused(await aDb.from("projects").update({ status: "active" }).eq("id", P2.proj)) && (await api(customer, "POST", `/api/projects/${P2.proj}/withdrawals`, { reason: "again" })).status === 409);
  const msgsKept = must(await admin.from("projects").select("id").eq("id", P2.proj), "kept");
  check("nothing physically deleted (project, proposal, request rows kept)", msgsKept.length === 1 && must(await admin.from("proposals").select("id").eq("request_id", P2.req), "p").length >= 1 && must(await admin.from("fashion_requests").select("id").eq("id", P2.req), "r").length === 1);
}

console.log("\n8. Direct database bypass attempts");
{
  const P = await newProject("Bypass");
  check("customer can't set status 'withdrawn' directly", refused(await customerDb.from("projects").update({ status: "withdrawn" }).eq("id", P.proj)));
  check("designer can't set status 'withdrawn' directly", refused(await aDb.from("projects").update({ status: "withdrawn" }).eq("id", P.proj)));
  const ins = await customerDb.from("project_withdrawals").insert({ project_id: P.proj, requested_by: randomUUID(), requested_by_role: "customer", reason: "x", status: "approved", responded_at: new Date().toISOString() });
  check("no one can write withdrawal rows directly (e.g. a fake 'approved')", refused(ins));
  const w = await api(customer, "POST", `/api/projects/${P.proj}/withdrawals`, { reason: "direct test" });
  const forged = await customerDb.from("project_withdrawals").update({ status: "approved" }).eq("id", w.body.withdrawal.id).select();
  check("…or flip a pending one to approved", (forged.data ?? []).length === 0 && (await status("project_withdrawals", w.body.withdrawal.id)) === "pending");
  check("…and the project is still active", (await status("projects", P.proj)) === "active");
}

console.log("\n9. Concurrency");
{
  const P = await newProject("Concurrent requests");
  const [c, d] = await Promise.all([
    api(customer, "POST", `/api/projects/${P.proj}/withdrawals`, { reason: "customer at the same time" }),
    api(designerA, "POST", `/api/projects/${P.proj}/withdrawals`, { reason: "designer at the same time" }),
  ]);
  const pend = must(await admin.from("project_withdrawals").select("id").eq("project_id", P.proj).eq("status", "pending"), "pend");
  check("simultaneous requests from both sides → exactly one pending, the other 409", pend.length === 1 && [c.status, d.status].sort().join(",") === "200,409", { c: c.status, d: d.status, pend: pend.length });
  const winner = c.status === 200 ? c : d;
  const responder = c.status === 200 ? designerA : customer;
  const [x, y] = await Promise.all([
    api(responder, "POST", `/api/projects/${P.proj}/withdrawals/${winner.body.withdrawal.id}`, { decision: "approve" }),
    api(responder, "POST", `/api/projects/${P.proj}/withdrawals/${winner.body.withdrawal.id}`, { decision: "reject" }),
  ]);
  const final = must(await admin.from("project_withdrawals").select("status").eq("id", winner.body.withdrawal.id).single(), "final").status;
  const projStatus = await status("projects", P.proj);
  check("simultaneous approve + reject → exactly one wins, consistent project state", [x.status, y.status].sort().join(",") === "200,409" && ((final === "approved" && projStatus === "withdrawn") || (final === "rejected" && projStatus === "active")), { x: x.status, y: y.status, final, projStatus });
}

console.log("\n10. Completed projects are ineligible");
{
  const P = await newProject("Completed");
  await api(designerA, "POST", `/api/designer/projects/${P.proj}/complete`);
  const pend = await api(designerA, "POST", `/api/projects/${P.proj}/withdrawals`, { reason: "while awaiting confirmation" });
  check("(awaiting confirmation is still eligible) → pending", pend.status === 200);
  const confirm = await api(customer, "POST", `/api/projects/${P.proj}/confirm-completion`);
  check("customer confirms completion → completed", confirm.status === 200 && (await status("projects", P.proj)) === "completed");
  check("…the pending withdrawal is closed automatically (kept as history)", (await status("project_withdrawals", pend.body.withdrawal.id)) === "closed");
  check("…can't be answered any more (409)", (await api(customer, "POST", `/api/projects/${P.proj}/withdrawals/${pend.body.withdrawal.id}`, { decision: "approve" })).status === 409);
  check("…and a completed project can't get a new withdrawal request (409)", (await api(customer, "POST", `/api/projects/${P.proj}/withdrawals`, { reason: "too late" })).status === 409);
  check("completed status unchanged", (await status("projects", P.proj)) === "completed");
}

console.log("\nPages (desktop 1280px + phone 390px)");
{
  const { chromium, devices } = await import("playwright");
  const browser = await chromium.launch();
  const pageAs = async (cookie, width) => {
    const ctx = await browser.newContext(width < 768 ? { ...devices["Pixel 7"], viewport: { width, height: 844 } } : { viewport: { width, height: 900 } });
    await ctx.addCookies(cookie.split("; ").filter(Boolean).map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    return { ctx, page: await ctx.newPage() };
  };
  for (const width of [1280, 390]) {
    const req = await newRequest("UI delete");
    const { ctx, page } = await pageAs(customer, width);
    await page.goto(`${APP_URL}/requests/${req}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.click('[data-testid="delete-request"]');
    const dialog = await page.locator('[data-testid="delete-request-dialog"]').innerText().catch(() => "");
    await page.click('[data-testid="confirm-delete-request"]');
    await page.waitForURL((u) => u.pathname === "/requests", { timeout: 30000 }).catch(() => undefined);
    check(`@${width}px customer: Delete Request → confirm dialog → deleted, back on My Requests`, /can't be undone/i.test(dialog) && new URL(page.url()).pathname === "/requests" && (await status("fashion_requests", req)) === "cancelled", { url: page.url() });
    await ctx.close();

    const P = await newProject("UI withdrawal");
    const c = await pageAs(customer, width);
    await c.page.goto(`${APP_URL}/projects/${P.proj}`, { waitUntil: "networkidle", timeout: 120000 });
    await c.page.click('[data-testid="request-withdrawal"]');
    await c.page.click('[data-testid="submit-withdrawal"]');
    const emptyErr = await c.page.locator("text=Please give a reason").count();
    await c.page.fill("#withdrawalReason", "Changed my plans.");
    await c.page.click('[data-testid="submit-withdrawal"]');
    await c.page.waitForSelector('[data-testid="withdrawal-pending-mine"]', { timeout: 30000 }).catch(() => undefined);
    check(`@${width}px customer: Request Withdrawal needs a reason, then shows 'waiting for the designer'`, emptyErr > 0 && (await c.page.locator('[data-testid="withdrawal-pending-mine"]').count()) === 1 && (await c.page.locator('[data-testid="approve-withdrawal"]').count()) === 0);
    await c.ctx.close();
    const d = await pageAs(designerA, width);
    await d.page.goto(`${APP_URL}/designer/projects/${P.proj}`, { waitUntil: "networkidle", timeout: 120000 });
    const theirs = await d.page.locator('[data-testid="withdrawal-pending-theirs"]').innerText().catch(() => "");
    await d.page.click('[data-testid="approve-withdrawal"]');
    await d.page.click('[data-testid="confirm-approve-withdrawal"]');
    await d.page.waitForSelector('[data-testid="project-withdrawn"]', { timeout: 30000 }).catch(() => undefined);
    check(`@${width}px designer: sees the reason with Approve/Reject → approves → 'withdrawn' shown`, theirs.includes("Changed my plans.") && (await d.page.locator('[data-testid="project-withdrawn"]').count()) === 1 && (await status("projects", P.proj)) === "withdrawn");
    await d.ctx.close();
  }
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
