// HRUNA — Block user / Report user / admin User Reports, end to end.
// Seed: customer aanya (c1…01), approved designer meera (d1…01), admin. Fresh customers are registered
// per run. Writes go through the app's API as the signed-in user; "direct" checks use the same user's
// own Supabase session against PostgREST to prove the DATABASE enforces the rules, not just the app.
//
// Without migration 20261020000001 (hosted until applied): block/report answer 503 "not available yet"
// and messaging is unaffected.
//
// LOCAL STACK ONLY (scripts/lib/test-auth.mjs). Optional HRUNA_TEST_DB_CONTAINER (read-only checks).
// Run with: node scripts/test-moderation.mjs

import { spawnSync } from "node:child_process";
import { APP_URL, assertLocalTestEnvironment, rawClientFromCookie, registerAndConfirm, signInWithPassword } from "./lib/test-auth.mjs";

const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
const AANYA_CUSTOMER = "c1000000-0000-0000-0000-000000000001";
const MEERA_DESIGNER = "d1000000-0000-0000-0000-000000000001";
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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}
const db = (sql) =>
  (spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA"], { input: `BEGIN READ ONLY; ${sql}; ROLLBACK;`, encoding: "utf8" }).stdout ?? "")
    .trim().split("\n").filter(Boolean).pop() ?? "";
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const send = (cookie, conv, text) => api(`/api/conversations/${conv}/messages`, { method: "POST", cookie, body: { text } });
const thread = (cookie, conv) => api(`/api/conversations/${conv}/messages`, { cookie });
const me = async (cookie) => (await api("/api/auth/session", { cookie })).data;
async function freshCustomer(tag) {
  const { cookie } = await registerAndConfirm(`mod-${tag}-${Date.now()}@example.test`);
  await api("/api/profile/customer", { method: "POST", cookie, body: { name: `Customer ${tag}`, city: "Pune" } });
  const s = await me(cookie);
  return { cookie, userId: s.userId, customerId: db(`SELECT id FROM public.customer_profiles WHERE user_id='${s.userId}'`) };
}
const startWithMeera = async (cookie) => (await api("/api/conversations", { method: "POST", cookie, body: { designerId: MEERA_DESIGNER } })).data.conversationId;
const canStart = async (cookie, customerId, designerId) => {
  const raw = await rawClientFromCookie(cookie);
  const { data, error } = await raw.rpc("can_start_conversation", { p_customer_id: customerId, p_designer_id: designerId });
  return error ? `error:${error.code}` : data;
};
const msgCount = (conv) => Number(db(`SELECT count(*) FROM public.messages WHERE conversation_id='${conv}'`));

let browser = null;
async function main() {
  await assertLocalTestEnvironment();
  try {
    browser = await (await import("playwright")).chromium.launch();
  } catch {
    console.log("  \x1b[33m!\x1b[0m playwright/Chromium unavailable — browser checks are SKIPPED");
  }
  const page = async (cookie, path) => {
    const ctx = await browser.newContext();
    if (cookie) await ctx.addCookies(cookie.split("; ").map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    const p = await ctx.newPage();
    await p.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" });
    return { ctx, p };
  };
  const ready = db("SELECT to_regclass('public.user_blocks') IS NOT NULL") === "t";
  console.log(`\n(database under test: block/report tables ${ready ? "PRESENT" : "MISSING — hosted-like state"})`);

  const aanya = await signInWithPassword("aanya@lilirve.dev");
  const meera = await signInWithPassword("meera@lilirve.dev");
  const admin = await signInWithPassword("admin@lilirve.dev");
  const aanyaId = (await me(aanya)).userId;
  const meeraId = (await me(meera)).userId;
  const conv = await startWithMeera(aanya);
  check("0. (setup) customer aanya and designer meera have a conversation and can both message", !!conv && (await send(aanya, conv, "hello meera")).status === 200 && (await send(meera, conv, "hello aanya")).status === 200);

  if (!ready) {
    console.log("\n=== Without the migration (hosted until applied) ===");
    const b = await api("/api/blocks", { method: "POST", cookie: aanya, body: { conversationId: conv } });
    const r = await api("/api/reports", { method: "POST", cookie: aanya, body: { conversationId: conv, reason: "spam" } });
    check("N1. Block and Report answer 503 'not available yet' (nothing half-done)", b.status === 503 && r.status === 503 && b.data.code === "moderation_not_ready", { b: b.status, r: r.status });
    const t = await thread(aanya, conv);
    check("N2. Messaging is unaffected: threads load with blockState none and sending works", t.data.blockState === "none" && (await send(aanya, conv, "still works")).status === 200);
    check("N3. Settings → Blocked users reports 'not available' instead of failing", (await api("/api/blocks", { cookie: aanya })).data.available === false);
  } else {
    console.log("\n=== Customer blocks designer ===");
    const before = await canStart(aanya, AANYA_CUSTOMER, MEERA_DESIGNER);
    const b1 = await api("/api/blocks", { method: "POST", cookie: aanya, body: { conversationId: conv } });
    check("1a. Blocking is saved for the OTHER participant of the conversation (server-derived)", b1.status === 200 && db(`SELECT count(*) FROM public.user_blocks WHERE blocker_id='${aanyaId}' AND blocked_id='${meeraId}'`) === "1", b1.data);
    check("1b. Chat state: the blocker sees 'blocked_by_me', the blocked side only 'unavailable'", (await thread(aanya, conv)).data.blockState === "blocked_by_me" && (await thread(meera, conv)).data.blockState === "unavailable");
    const n = msgCount(conv);
    const s1 = await send(aanya, conv, "after block (customer)");
    const s2 = await send(meera, conv, "after block (designer)");
    check("1c. Neither side can send through the app (403 messaging_blocked); nothing stored", s1.status === 403 && s2.status === 403 && s2.data.code === "messaging_blocked" && msgCount(conv) === n, { s1: s1.status, s2: s2.status });
    const rawMeera = await rawClientFromCookie(meera);
    const { error: direct } = await rawMeera.from("messages").insert({ conversation_id: conv, sender_id: meeraId, text: "direct bypass" });
    check("1d. …nor directly against the database (RLS refuses the insert)", !!direct && msgCount(conv) === n, direct?.code);
    check("1e. Neither side can start a conversation with the other (can_start_conversation false)", before === true && (await canStart(aanya, AANYA_CUSTOMER, MEERA_DESIGNER)) === false && (await canStart(meera, AANYA_CUSTOMER, MEERA_DESIGNER)) === false);
    check("1f. Existing messages are kept and still readable by both", (await thread(aanya, conv)).data.messages?.length === n && (await thread(meera, conv)).data.messages?.length === n);
    check("1g. Requests, proposals and projects are untouched", db(`SELECT count(*) FROM public.proposals WHERE designer_id='${MEERA_DESIGNER}'`) !== "0" && db(`SELECT status FROM public.proposals WHERE id='81000000-0000-0000-0000-000000000001'`) === "pending");

    console.log("\n=== Designer blocks customer; unrelated conversations ===");
    const c2 = await freshCustomer("c2");
    const conv2 = await startWithMeera(c2.cookie);
    await send(c2.cookie, conv2, "hi from c2");
    const b2 = await api("/api/blocks", { method: "POST", cookie: meera, body: { conversationId: conv2 } });
    check("2a. Designer blocks a customer", b2.status === 200 && (await thread(meera, conv2)).data.blockState === "blocked_by_me" && (await thread(c2.cookie, conv2)).data.blockState === "unavailable");
    check("2b. Messages can't be sent in either direction", (await send(meera, conv2, "x")).status === 403 && (await send(c2.cookie, conv2, "y")).status === 403);
    const c3 = await freshCustomer("c3");
    const conv3 = await startWithMeera(c3.cookie);
    check("2c. Unrelated users are unaffected: another customer still messages the same designer both ways", !!conv3 && (await send(c3.cookie, conv3, "unrelated")).status === 200 && (await send(meera, conv3, "reply")).status === 200 && (await thread(c3.cookie, conv3)).data.blockState === "none");
    check("2d. No roles changed by blocking", (await me(meera)).hasDesignerProfile === true && (await me(c2.cookie)).hasCustomerProfile === true && (await me(meera)).isAdmin === false);

    console.log("\n=== Block privacy, Settings list, unblock ===");
    const rawAanya = await rawClientFromCookie(aanya);
    const { data: meeraSees } = await rawMeera.from("user_blocks").select("*");
    check("3a. A blocked user can't see who blocked them (RLS: own rows only)", (meeraSees ?? []).every((r) => r.blocker_id === meeraId) && !(meeraSees ?? []).some((r) => r.blocker_id === aanyaId));
    const list = (await api("/api/blocks", { cookie: aanya })).data;
    check("3b. Settings → Blocked users lists the blocked studio by name", list.available === true && list.blocked.length === 1 && list.blocked[0].userId === meeraId && list.blocked[0].name === "Atelier Meera", list);
    const steal = await api(`/api/blocks/${aanyaId}`, { method: "DELETE", cookie: meera });
    const { data: forged } = await rawMeera.from("user_blocks").delete().eq("blocker_id", aanyaId).select();
    check("3c. Nobody can remove someone else's block (app 404, database 0 rows)", steal.status === 404 && (forged ?? []).length === 0 && db(`SELECT count(*) FROM public.user_blocks WHERE blocker_id='${aanyaId}'`) === "1");
    const { error: forgeInsert } = await rawMeera.from("user_blocks").insert({ blocker_id: aanyaId, blocked_id: meeraId });
    check("3d. Nobody can create a block in someone else's name", !!forgeInsert);
    const un = await api(`/api/blocks/${meeraId}`, { method: "DELETE", cookie: aanya });
    check("3e. Unblocking restores messaging in the existing conversation, both ways", un.status === 200 && (await thread(aanya, conv)).data.blockState === "none" && (await send(aanya, conv, "after unblock")).status === 200 && (await send(meera, conv, "back again")).status === 200);
    check("3f. …and starting conversations follows the normal rules again (allowed here: they work together)", (await canStart(aanya, AANYA_CUSTOMER, MEERA_DESIGNER)) === true);
    // c4 has no request/proposal/project with meera: the designer could never start a conversation with them.
    const c4 = await freshCustomer("c4");
    const conv4 = await startWithMeera(c4.cookie);
    const designerBefore = await canStart(meera, c4.customerId, MEERA_DESIGNER);
    await api("/api/blocks", { method: "POST", cookie: c4.cookie, body: { conversationId: conv4 } });
    const blockedCustomerSide = await canStart(c4.cookie, c4.customerId, MEERA_DESIGNER);
    await api(`/api/blocks/${meeraId}`, { method: "DELETE", cookie: c4.cookie });
    check("3g. Unblocking never grants more than the normal rules: designer still can't start one with an unrelated customer", designerBefore === false && blockedCustomerSide === false && (await canStart(meera, c4.customerId, MEERA_DESIGNER)) === false && (await canStart(c4.cookie, c4.customerId, MEERA_DESIGNER)) === true);
    await api(`/api/blocks/${c2.userId}`, { method: "DELETE", cookie: meera });

    console.log("\n=== Reports ===");
    const meeraMsg = db(`SELECT id FROM public.messages WHERE conversation_id='${conv}' AND sender_id='${meeraId}' ORDER BY created_at LIMIT 1`);
    const otherConvMsg = db(`SELECT id FROM public.messages WHERE conversation_id='${conv3}' LIMIT 1`);
    const r1 = await api("/api/reports", { method: "POST", cookie: aanya, body: { conversationId: conv, reason: "harassment", description: "  Rude messages  ", messageIds: [meeraMsg] } });
    const row = db(`SELECT reporter_id||'|'||reported_id||'|'||reason||'|'||status||'|'||coalesce(description,'')||'|'||coalesce(conversation_id::text,'')||'|'||array_to_string(message_ids,',') FROM public.user_reports WHERE id='${r1.data.reportId}'`);
    check("4a. A valid report is saved with reporter, reported user, reason, description, chosen evidence, pending", r1.status === 200 && row === `${aanyaId}|${meeraId}|harassment|pending|Rude messages|${conv}|${meeraMsg}`, { r: r1.data, row });
    const r2 = await api("/api/reports", { method: "POST", cookie: aanya, body: { conversationId: conv, reason: "spam" } });
    check("4b. Without chosen evidence no conversation or messages are stored", r2.status === 200 && db(`SELECT coalesce(conversation_id::text,'none')||'|'||cardinality(message_ids) FROM public.user_reports WHERE id='${r2.data.reportId}'`) === "none|0");
    const bad = [
      [{ conversationId: conv, reason: "rude" }, "unknown reason"],
      [{ conversationId: conv }, "missing reason"],
      [{ conversationId: conv, reason: "spam", description: "x".repeat(2001) }, "description too long"],
      [{ conversationId: conv, reason: "spam", messageIds: ["nope"] }, "bad message id"],
      [{ conversationId: conv, reason: "spam", messageIds: [otherConvMsg] }, "message from another conversation"],
      [{ reason: "spam" }, "no conversation"],
    ];
    const results = [];
    for (const [body] of bad) results.push((await api("/api/reports", { method: "POST", cookie: aanya, body })).status);
    check("4c. Invalid reports are rejected (400 each): " + bad.map((b) => b[1]).join(", "), results.every((s) => s === 400), results);
    const foreign = await api("/api/reports", { method: "POST", cookie: c3.cookie, body: { conversationId: conv, reason: "spam" } });
    check("4d. A conversation you're not in can't be used to report anyone (404)", foreign.status === 404, foreign.data);
    const reportsBefore = db("SELECT count(*) FROM public.user_reports");
    const attempts = await Promise.all([
      rawAanya.from("user_reports").insert({ reporter_id: aanyaId, reported_id: aanyaId, reason: "spam" }),
      rawAanya.from("user_reports").insert({ reporter_id: meeraId, reported_id: c3.userId, reason: "spam" }),
      rawAanya.from("user_reports").insert({ reporter_id: aanyaId, reported_id: meeraId, reason: "spam", status: "resolved" }),
      rawAanya.from("user_reports").insert({ reporter_id: aanyaId, reported_id: meeraId, reason: "spam", conversation_id: conv3, message_ids: [otherConvMsg] }),
    ]);
    check("4e. Database refuses self-reports, forged reporters, pre-resolved reports and evidence from others' chats", attempts.every((a) => !!a.error) && db("SELECT count(*) FROM public.user_reports") === reportsBefore, attempts.map((a) => a.error?.code));
    const { data: reportedSees } = await rawMeera.from("user_reports").select("*");
    const { data: strangerSees } = await (await rawClientFromCookie(c3.cookie)).from("user_reports").select("*");
    const { data: ownSees } = await rawAanya.from("user_reports").select("id, reporter_id");
    check("4f. The reported user sees none of the reports (reporter never exposed); strangers see none; reporters see only their own", (reportedSees ?? []).length === 0 && (strangerSees ?? []).length === 0 && (ownSees ?? []).length === 2 && ownSees.every((r) => r.reporter_id === aanyaId));
    const { data: tamper } = await rawAanya.from("user_reports").update({ status: "dismissed" }).eq("id", r1.data.reportId).select();
    const { data: del } = await rawAanya.from("user_reports").delete().eq("id", r1.data.reportId).select();
    check("4g. Reporters can't change status or delete their report (0 rows)", (tamper ?? []).length === 0 && (del ?? []).length === 0 && db(`SELECT status FROM public.user_reports WHERE id='${r1.data.reportId}'`) === "pending");

    console.log("\n=== Admin review ===");
    check("5a. Only admins can list reports (customer 403, designer 403, signed out 401)", (await api("/api/admin/reports", { cookie: aanya })).status === 403 && (await api("/api/admin/reports", { cookie: meera })).status === 403 && (await api("/api/admin/reports")).status === 401);
    const list5 = await api("/api/admin/reports?status=pending", { cookie: admin });
    check("5b. Admin sees pending reports, filtered", list5.status === 200 && list5.data.reports.some((r) => r.id === r1.data.reportId) && list5.data.reports.every((r) => r.status === "pending"), list5.data);
    const d5 = await api(`/api/admin/reports/${r1.data.reportId}`, { cookie: admin });
    check("5c. Admin detail: both accounts, timestamps, and ONLY the chosen evidence", d5.status === 200 && d5.data.report.reported.userId === meeraId && d5.data.report.reported.designer?.id === MEERA_DESIGNER && d5.data.report.reporter.userId === aanyaId && d5.data.report.evidence.length === 1 && d5.data.report.evidence[0].id === meeraMsg && d5.data.report.evidence[0].from === "reported" && !!d5.data.report.createdAt, d5.data);
    check("5d. Non-admins can't open a report or record a decision", (await api(`/api/admin/reports/${r1.data.reportId}`, { cookie: meera })).status === 403 && (await api(`/api/admin/reports/${r1.data.reportId}`, { method: "PATCH", cookie: aanya, body: { status: "dismissed", decision: "x" } })).status === 403);
    const noDecision = await api(`/api/admin/reports/${r1.data.reportId}`, { method: "PATCH", cookie: admin, body: { status: "resolved" } });
    check("5e. Resolving needs a recorded decision (400)", noDecision.status === 400);
    const auditBefore = Number(db("SELECT count(*) FROM public.admin_audit_log"));
    const rev = await api(`/api/admin/reports/${r1.data.reportId}`, { method: "PATCH", cookie: admin, body: { status: "under_review" } });
    const fin = await api(`/api/admin/reports/${r1.data.reportId}`, { method: "PATCH", cookie: admin, body: { status: "resolved", decision: "Warned the designer about tone." } });
    const adminId = (await me(admin)).userId;
    check("5f. Admin moves it to under review, then resolves with a decision (reviewed_by = that admin), both audited", rev.status === 200 && fin.status === 200 && db(`SELECT status||'|'||admin_decision||'|'||reviewed_by FROM public.user_reports WHERE id='${r1.data.reportId}'`) === `resolved|Warned the designer about tone.|${adminId}` && Number(db("SELECT count(*) FROM public.admin_audit_log")) === auditBefore + 2);
    const { error: rewrite } = await (await rawClientFromCookie(admin)).from("user_reports").update({ reason: "spam" }).eq("id", r1.data.reportId);
    check("5g. Even an admin can't rewrite what was reported", !!rewrite && db(`SELECT reason FROM public.user_reports WHERE id='${r1.data.reportId}'`) === "harassment", rewrite?.code);
    check("5h. Reports never suspend anyone automatically (designer still approved, customer still active)", db(`SELECT overall_status FROM public.designer_verifications WHERE designer_id='${MEERA_DESIGNER}'`) === "approved" && db(`SELECT status FROM public.customer_profiles WHERE id='${AANYA_CUSTOMER}'`) === "active");

    if (browser) {
      console.log("\n=== In the browser ===");
      const { ctx, p } = await page(aanya, `/messages?conversationId=${conv}`);
      await p.getByPlaceholder("Type a message...").waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
      await p.locator('[data-testid="conversation-menu"]').click();
      await p.getByRole("menuitem", { name: "Block user" }).click();
      await p.locator('[data-testid="confirm-block"]').click();
      await p.locator('[data-testid="blocked-notice"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      check("6a. Browser: ⋮ → Block user → confirm → the composer is replaced by the blocked notice", (await p.locator('[data-testid="blocked-notice"]').count()) === 1 && (await p.getByPlaceholder("Type a message...").count()) === 0);
      const other = await page(meera, `/designer/messages?conversationId=${conv}`);
      await other.p.locator('[data-testid="blocked-notice"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      check("6b. Browser: the designer sees 'You can't send messages in this conversation' (not who blocked)", (await other.p.locator('[data-testid="blocked-notice"]').innerText().catch(() => "")).trim() === "You can't send messages in this conversation.");
      await other.ctx.close();
      await p.goto(`${APP_URL}/profile?tab=blocked`, { waitUntil: "networkidle" });
      await p.locator('[data-testid="blocked-users"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      const listed = await p.locator('[data-testid="blocked-users"]').innerText().catch(() => "");
      await p.getByRole("button", { name: "Unblock" }).click();
      await p.getByText("You haven't blocked anyone.").waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      check("6c. Browser: Settings → Blocked users lists the studio; Unblock removes it", listed.includes("Atelier Meera") && (await p.getByText("You haven't blocked anyone.").count()) === 1 && db(`SELECT count(*) FROM public.user_blocks WHERE blocker_id='${aanyaId}'`) === "0");
      await p.goto(`${APP_URL}/messages?conversationId=${conv}`, { waitUntil: "networkidle" });
      await p.getByPlaceholder("Type a message...").waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
      const reportsBeforeUi = Number(db("SELECT count(*) FROM public.user_reports"));
      await p.locator('[data-testid="conversation-menu"]').click();
      await p.getByRole("menuitem", { name: "Report user" }).click();
      await p.locator("#reportReason").selectOption("scam");
      await p.locator("#reportDescription").fill("Asked me to pay outside HRUNA.");
      await p.locator('[data-testid="report-evidence"] input[type="checkbox"]').first().check();
      await p.locator('[data-testid="submit-report"]').click();
      await p.getByText(/Report submitted/).waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      check("6d. Browser: ⋮ → Report user → reason, description, one ticked message → saved, then the success message", (await p.getByText(/Report submitted/).count()) > 0 && Number(db("SELECT count(*) FROM public.user_reports")) === reportsBeforeUi + 1 && db(`SELECT reason||'|'||cardinality(message_ids) FROM public.user_reports ORDER BY created_at DESC LIMIT 1`) === "scam|1");
      await ctx.close();
      const a = await page(admin, "/admin/reports");
      await a.p.locator('[data-testid="reports-list"]').waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
      await a.p.locator('[data-testid="reports-list"] button').first().click();
      await a.p.locator('[data-testid="report-detail"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      const detailText = await a.p.locator('[data-testid="report-detail"]').innerText().catch(() => "");
      await a.p.locator("#reportStatus").selectOption("dismissed");
      await a.p.locator("#reportDecision").fill("No violation found.");
      await a.p.locator('[data-testid="save-review"]').click();
      await a.p.getByText("Review saved.").waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      check("6e. Browser: admin opens a pending report (sees evidence) and dismisses it with a decision", detailText.includes("Scam or fraud") && detailText.includes("EVIDENCE CHOSEN BY THE REPORTER") && db(`SELECT status FROM public.user_reports ORDER BY created_at DESC LIMIT 1`) === "dismissed", detailText.slice(0, 300));
      await a.ctx.close();
    }
  }

  if (browser) await browser.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("Failed:", failures.join(" | "));
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("Test suite crashed:", err);
  if (browser) await browser.close().catch(() => undefined);
  process.exit(1);
});
