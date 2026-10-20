// HRUNA — a public request stays discoverable while the customer weighs proposals, and closes
// cleanly once one is accepted. Real lifecycle through the app's own APIs, one customer (aanya) and
// three approved designers: A (meera), B (ramesh), C (priya — only used after acceptance).
//   create → visible to A and B → A proposes → A sees own proposal; B still discovers it (feed +
//   "new request" notification); A's own feed no longer offers it → B proposes → customer sees both →
//   customer accepts A → request accepted, B declined, one project; a second acceptance and a late
//   proposal (C) are refused; the request leaves every feed.
// Prereqs: app on HRUNA_TEST_APP_URL against the LOCAL seeded stack; HRUNA_TEST_SEED_PASSWORD,
// HRUNA_TEST_SUPABASE_ANON_KEY, HRUNA_TEST_SERVICE_KEY (local only — approves ramesh/priya there).
// Run with: node scripts/test-request-discovery.mjs

import { createClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_URL, signInWithPassword, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

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
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
};
const must = ({ error, data }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// Local fixture: designers B and C must be approved (the seed has ramesh pending, priya rejected).
const B_DESIGNER = "d1000000-0000-0000-0000-000000000002";
const C_DESIGNER = "d1000000-0000-0000-0000-000000000003";
must(await admin.from("designer_verifications").update({ identity_status: "verified", portfolio_status: "approved", overall_status: "approved" }).in("designer_id", [B_DESIGNER, C_DESIGNER]), "approve B and C (local)");

const customer = await signInWithPassword("aanya@lilirve.dev");
const A = await signInWithPassword("meera@lilirve.dev");
const B = await signInWithPassword("ramesh@lilirve.dev");
const C = await signInWithPassword("priya@lilirve.dev");
const api = async (cookie, method, path, body) => {
  const res = await fetch(`${APP_URL}${path}`, { method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const inFeed = async (cookie, id) => ((await api(cookie, "GET", "/api/designer/feed")).body?.requests ?? []).some((r) => r.id === id);
const inNotifications = async (cookie, id) => {
  const r = await api(cookie, "GET", "/api/designer/notifications");
  return JSON.stringify(r.body ?? {}).includes(`/designer/requests/${id}`);
};
const requestStatus = async (id) => must(await admin.from("fashion_requests").select("status").eq("id", id).single(), "status").status;

console.log("\nCustomer creates a public request");
const created = await api(customer, "POST", "/api/requests", { title: `Discovery Test Gown ${Date.now()}`, category: "Occasion Wear", occasion: "Reception", description: "Two-designer discovery regression test." });
const REQ = created.body?.request?.id;
check("request created (public, submitted)", created.status === 200 && !!REQ && (await requestStatus(REQ)) === "submitted", created.body);
check("Designer A and Designer B both discover it", (await inFeed(A, REQ)) && (await inFeed(B, REQ)));

console.log("\nDesigner A submits a proposal");
const pA = await api(A, "POST", "/api/designer/proposals", { requestId: REQ, price: 45000, estimatedDays: 25, description: "Designer A's proposal." });
check("A's proposal accepted by the API", pA.status === 200 && !!pA.body?.proposal?.id, pA.body);
const mine = await api(A, "GET", "/api/designer/proposals");
check("A can see their own proposal (pending)", (mine.body?.proposals ?? []).some((p) => p.requestId === REQ && p.status === "pending"), mine.body?.proposals?.map((p) => ({ r: p.requestId, s: p.status })));
check("request is now 'proposal_received' (customer's Proposal Received tab)", (await requestStatus(REQ)) === "proposal_received");
check("Designer B can STILL discover the request (the reported bug)", await inFeed(B, REQ));
check("Designer B still gets the 'new fashion request' notification", await inNotifications(B, REQ));
check("Designer A's own feed no longer offers a request A already proposed on", !(await inFeed(A, REQ)));

console.log("\nDesigner B proposes too; the customer reviews both");
const pB = await api(B, "POST", "/api/designer/proposals", { requestId: REQ, price: 39000, estimatedDays: 30, description: "Designer B's proposal." });
check("B's proposal accepted by the API", pB.status === 200 && !!pB.body?.proposal?.id, pB.body);
const dup = await api(B, "POST", "/api/designer/proposals", { requestId: REQ, price: 1, estimatedDays: 1, description: "duplicate" });
check("B can't submit a second proposal on the same request", dup.status >= 400, dup);
const both = await api(customer, "GET", `/api/requests/${REQ}/proposals`);
const ids = (both.body?.proposals ?? []).map((p) => p.id);
check("customer sees both designers' proposals", ids.includes(pA.body?.proposal?.id) && ids.includes(pB.body?.proposal?.id) && ids.length === 2, both.body);
check("…and B can see only B's own proposal, not A's", ((await api(B, "GET", "/api/designer/proposals")).body?.proposals ?? []).filter((p) => p.requestId === REQ).length === 1);

console.log("\nCustomer accepts Designer A's proposal");
const acc = await api(customer, "POST", `/api/proposals/${pA.body.proposal.id}/accept`);
check("acceptance creates the project", acc.status === 200 && !!acc.body?.project?.id, acc.body);
const props = must(await admin.from("proposals").select("id, status").eq("request_id", REQ), "proposals");
check("request is 'accepted'; A accepted, B auto-declined", (await requestStatus(REQ)) === "accepted" && props.find((p) => p.id === pA.body.proposal.id)?.status === "accepted" && props.find((p) => p.id === pB.body.proposal.id)?.status === "declined", props);
const second = await api(customer, "POST", `/api/proposals/${pB.body.proposal.id}/accept`);
check("a second (conflicting) acceptance is refused", second.status >= 400 && second.status < 500, second);
const again = await api(customer, "POST", `/api/proposals/${pA.body.proposal.id}/accept`);
check("re-accepting the same proposal is refused", again.status >= 400 && again.status < 500, again);
const projects = must(await admin.from("projects").select("id").eq("request_id", REQ), "projects");
check("exactly one project exists for the request", projects.length === 1, projects);
check("the request has left every designer's feed (B, C)", !(await inFeed(B, REQ)) && !(await inFeed(C, REQ)));
const late = await api(C, "POST", "/api/designer/proposals", { requestId: REQ, price: 30000, estimatedDays: 20, description: "Late proposal." });
check("a late proposal on the accepted request is refused with a clear message", late.status === 409 && /no longer accepting proposals/i.test(late.body?.message ?? ""), late);
const lateRows = must(await admin.from("proposals").select("id").eq("request_id", REQ).eq("designer_id", C_DESIGNER), "late rows");
check("…and no late proposal row was created", lateRows.length === 0, lateRows);

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies(C.split("; ").filter(Boolean).map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
const page = await ctx.newPage();
await page.goto(`${APP_URL}/designer/requests/${REQ}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForSelector('[data-testid="request-closed"], button:has-text("Send Proposal")', { timeout: 60000 }).catch(() => undefined);
check("Designer C's request page says it's no longer accepting proposals (no Send Proposal button)", (await page.locator('[data-testid="request-closed"]').count()) === 1 && (await page.locator('button:has-text("Send Proposal")').count()) === 0);
await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
