// HRUNA — proposal/acceptance race and the project completion workflow, enforced by the database
// (migration 20261022000001). Local seeded stack only.
//   Race (deterministic): two real DB sessions with held locks — accept-then-propose refuses the
//   proposal after waiting; propose-then-accept auto-declines it. Race (API): accept + propose fired
//   together, repeated; always one accepted proposal, one project, no stray pending proposals.
//   Workflow: designer can only mark active → awaiting_confirmation; only the customer confirms
//   (→ completed) or requests changes (→ active); no other status / completed_at / ownership edits
//   by participants, even via direct PostgREST. Proposals: a designer can't accept/decline their own,
//   or edit a decided one. The app's own routes keep working.
// Prereqs: app on HRUNA_TEST_APP_URL; HRUNA_TEST_SEED_PASSWORD, HRUNA_TEST_SUPABASE_ANON_KEY,
// HRUNA_TEST_SERVICE_KEY; HRUNA_TEST_DB_CONTAINER (default supabase_db_lilirve-app).
// Run with: node scripts/test-project-workflow.mjs

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_URL, signInWithPassword, rawClientFromCookie, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

const SERVICE_KEY = process.env.HRUNA_TEST_SERVICE_KEY;
const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
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
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
};
const must = ({ error, data }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const blocked = (r, prefix) => !!r.error && r.error.code === "42501" && (r.error.message ?? "").startsWith(prefix);

const CUSTOMER = "c1000000-0000-0000-0000-000000000001";
const CUSTOMER_USER = "c0000000-0000-0000-0000-000000000001";
const A = "d1000000-0000-0000-0000-000000000001"; // meera
const B = "d1000000-0000-0000-0000-000000000002"; // ramesh
const C = "d1000000-0000-0000-0000-000000000003"; // priya
const C_USER = "d0000000-0000-0000-0000-000000000003";
must(await admin.from("designer_verifications").update({ identity_status: "verified", portfolio_status: "approved", overall_status: "approved" }).in("designer_id", [B, C]), "approve B and C (local)");

const customerCookie = await signInWithPassword("aanya@lilirve.dev");
const aCookie = await signInWithPassword("meera@lilirve.dev");
const cCookie = await signInWithPassword("priya@lilirve.dev");
const customerDb = await rawClientFromCookie(customerCookie);
const aDb = await rawClientFromCookie(aCookie);
const api = async (cookie, method, path, body) => {
  const res = await fetch(`${APP_URL}${path}`, { method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function openRequest(title) {
  const id = randomUUID();
  must(await admin.from("fashion_requests").insert({ id, customer_id: CUSTOMER, title, category: "Occasion Wear", description: "workflow test", status: "submitted" }), "request");
  return id;
}
async function proposal(requestId, designerId, price = 30000) {
  const id = randomUUID();
  must(await admin.from("proposals").insert({ id, request_id: requestId, designer_id: designerId, price, estimated_days: 20, description: "workflow test" }), "proposal");
  return id;
}
async function activeProject(title) {
  const req = await openRequest(title);
  const prop = await proposal(req, A);
  const res = await api(customerCookie, "POST", `/api/proposals/${prop}/accept`);
  if (res.status !== 200) throw new Error(`accept for fixture: ${JSON.stringify(res.body)}`);
  return { req, prop, proj: res.body.project.id };
}
const status = async (table, id) => must(await admin.from(table).select("status").eq("id", id).single(), table).status;

// psql session in the local DB container acting as a signed-in user (JWT claims), running `sql`.
function asUser(userId, sql) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1"]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim(), ms: Date.now() - started }));
    p.stdin.end(`begin;
select set_config('request.jwt.claims', json_build_object('sub', '${userId}', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '${userId}', true);
set local role authenticated;
${sql}
commit;
`);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("\nRace — deterministic, two database sessions");
{
  const req = await openRequest("Race: accept first");
  const pA = await proposal(req, A);
  const accepting = asUser(CUSTOMER_USER, `select (public.accept_proposal('${pA}')).id is not null; select pg_sleep(2.5);`);
  await sleep(700); // the acceptance now holds the request row lock
  const proposing = asUser(C_USER, `insert into public.proposals (request_id, designer_id, price, description) values ('${req}', '${C}', 25000, 'racing');`);
  const [acc, pro] = await Promise.all([accepting, proposing]);
  check("accept first: the concurrent proposal WAITED for the acceptance's lock, then was refused (request_closed)", acc.code === 0 && pro.code !== 0 && /request_closed/.test(pro.err) && pro.ms > 1200, { acc, pro });
  const rows = must(await admin.from("proposals").select("designer_id, status").eq("request_id", req), "rows");
  check("…request accepted, no stray proposal from C, one project", (await status("fashion_requests", req)) === "accepted" && !rows.some((r) => r.designer_id === C) && must(await admin.from("projects").select("id").eq("request_id", req), "projects").length === 1, rows);
}
{
  const req = await openRequest("Race: propose first");
  const pA = await proposal(req, A);
  const proposing = asUser(C_USER, `insert into public.proposals (request_id, designer_id, price, description) values ('${req}', '${C}', 25000, 'racing'); select pg_sleep(2.5);`);
  await sleep(700); // the proposal insert now holds its FOR SHARE lock on the request
  const accepting = asUser(CUSTOMER_USER, `select (public.accept_proposal('${pA}')).id is not null;`);
  const [pro, acc] = await Promise.all([proposing, accepting]);
  const cRow = must(await admin.from("proposals").select("status").eq("request_id", req).eq("designer_id", C).maybeSingle(), "c row");
  check("propose first: the acceptance waited, then auto-declined the just-committed proposal", pro.code === 0 && acc.code === 0 && acc.ms > 1200 && cRow?.status === "declined", { pro, acc, cRow });
  const pending = must(await admin.from("proposals").select("id").eq("request_id", req).eq("status", "pending"), "pending");
  check("…no pending proposal is left on the accepted request", pending.length === 0, pending);
}

console.log("\nRace — through the app, accept and propose fired together (5 rounds)");
{
  const results = [];
  for (let i = 0; i < 5; i++) {
    const req = await openRequest(`API race ${i}`);
    const pA = await proposal(req, A);
    const [acc, late] = await Promise.all([
      api(customerCookie, "POST", `/api/proposals/${pA}/accept`),
      api(cCookie, "POST", "/api/designer/proposals", { requestId: req, price: 20000, estimatedDays: 10, description: "concurrent" }),
    ]);
    const props = must(await admin.from("proposals").select("designer_id, status").eq("request_id", req), "props");
    const projects = must(await admin.from("projects").select("id").eq("request_id", req), "projects");
    results.push({
      ok: acc.status === 200 && projects.length === 1 && props.filter((p) => p.status === "accepted").length === 1 && !props.some((p) => p.status === "pending") && (late.status === 409 || (late.status === 200 && props.find((p) => p.designer_id === C)?.status === "declined")),
      accept: acc.status,
      late: late.status,
      props,
    });
  }
  check("every round: one accepted proposal, one project, no stray pending proposal (late one refused 409 or auto-declined)", results.every((r) => r.ok), results.map(({ ok, accept, late }) => ({ ok, accept, late })));
}

console.log("\nCompletion workflow — direct database requests (bypassing the app)");
{
  const p1 = await activeProject("Workflow: designer shortcut");
  check("designer can't set active → completed", blocked(await aDb.from("projects").update({ status: "completed" }).eq("id", p1.proj), "project_workflow"));
  check("designer can't set a completion date", blocked(await aDb.from("projects").update({ completed_at: new Date().toISOString() }).eq("id", p1.proj), "project_workflow"));
  check("designer can't cancel or put on hold", blocked(await aDb.from("projects").update({ status: "cancelled" }).eq("id", p1.proj), "project_workflow") && blocked(await aDb.from("projects").update({ status: "on_hold" }).eq("id", p1.proj), "project_workflow"));
  check("designer can't reassign the project's customer", blocked(await aDb.from("projects").update({ customer_id: "c1000000-0000-0000-0000-000000000002" }).eq("id", p1.proj), "project_workflow"));
  check("customer can't skip the designer's step (active → completed or → awaiting)", blocked(await customerDb.from("projects").update({ status: "completed" }).eq("id", p1.proj), "project_workflow") && blocked(await customerDb.from("projects").update({ status: "awaiting_confirmation" }).eq("id", p1.proj), "project_workflow"));
  check("customer can't move the designer's progress", blocked(await customerDb.from("projects").update({ progress_percent: 90 }).eq("id", p1.proj), "project_workflow"));
  check("…project is still active", (await status("projects", p1.proj)) === "active");

  const up = await api(aCookie, "POST", `/api/projects/${p1.proj}/updates`, { stage: "Cutting", note: "Cutting started." });
  const after = must(await admin.from("projects").select("stage, progress_percent").eq("id", p1.proj).single(), "stage");
  check("app: designer's progress update still moves the stage/progress", up.status === 200 && after.stage === "Cutting" && after.progress_percent > 0, { up: up.status, after });

  const mark = await api(aCookie, "POST", `/api/designer/projects/${p1.proj}/complete`);
  check("app: designer marks it completed → awaiting_confirmation", mark.status === 200 && (await status("projects", p1.proj)) === "awaiting_confirmation", mark.body);
  check("designer still can't finish it themselves (awaiting → completed)", blocked(await aDb.from("projects").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", p1.proj), "project_workflow"));
  check("designer can't undo the customer's decision path (awaiting → active)", blocked(await aDb.from("projects").update({ status: "active" }).eq("id", p1.proj), "project_workflow"));
  check("…still awaiting the customer's confirmation", (await status("projects", p1.proj)) === "awaiting_confirmation");
  const confirm = await api(customerCookie, "POST", `/api/projects/${p1.proj}/confirm-completion`);
  check("app: only the customer's confirmation completes it", confirm.status === 200 && (await status("projects", p1.proj)) === "completed", confirm.body);

  const p2 = await activeProject("Workflow: request changes");
  await api(aCookie, "POST", `/api/designer/projects/${p2.proj}/complete`);
  const changes = await api(customerCookie, "POST", `/api/projects/${p2.proj}/request-changes`);
  check("app: customer can request changes (awaiting → active)", changes.status === 200 && (await status("projects", p2.proj)) === "active", changes.body);
}

console.log("\nProposals — a designer can't decide their own");
{
  const req = await openRequest("Proposal guard");
  const own = await proposal(req, A);
  check("designer can't accept their own proposal directly", blocked(await aDb.from("proposals").update({ status: "accepted" }).eq("id", own), "proposal_locked"));
  check("designer can't move it to another request", blocked(await aDb.from("proposals").update({ request_id: await openRequest("other") }).eq("id", own), "proposal_locked"));
  check("designer can still edit a pending proposal's price", !(await aDb.from("proposals").update({ price: 31000 }).eq("id", own)).error);
  const other = await proposal(req, B);
  await api(customerCookie, "POST", `/api/proposals/${other}/accept`); // declines A's
  check("…after the customer accepts another designer, A's proposal is declined and frozen", (await status("proposals", own)) === "declined" && blocked(await aDb.from("proposals").update({ price: 1 }).eq("id", own), "proposal_locked") && blocked(await aDb.from("proposals").update({ status: "pending" }).eq("id", own), "proposal_locked"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
