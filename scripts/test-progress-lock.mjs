// HRUNA — progress-history lock after the customer approves completion.
// Drives the real workflow on fresh local projects for the seeded designer (meera) and customer
// (aanya): progress can be added/edited/deleted while active and while awaiting confirmation; once
// the customer confirms completion, every add/edit/delete/stage change is refused — through the
// app's API (clear 409, code "project_locked") AND through direct PostgREST/Storage requests with the
// designer's own session (incl. re-opening the project or deleting the photo file). The existing
// history (rows, timestamps, photos) is unchanged and still visible to both sides; the workspace
// pages hide the controls; an unapproved project stays editable; cascade deletes still work.
// Prereqs: app on HRUNA_TEST_APP_URL against the LOCAL seeded stack, the 20261021000001 migration,
// and HRUNA_TEST_SEED_PASSWORD, HRUNA_TEST_SUPABASE_ANON_KEY, HRUNA_TEST_SERVICE_KEY (local only).
// Run with: node scripts/test-progress-lock.mjs

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_URL, signInWithPassword, rawClientFromCookie, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

const SERVICE_KEY = process.env.HRUNA_TEST_SERVICE_KEY;
if (!SERVICE_KEY) throw new Error("HRUNA_TEST_SERVICE_KEY (local stack only) is required");
await assertLocalTestEnvironment();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CUSTOMER = "c1000000-0000-0000-0000-000000000001";
const DESIGNER = "d1000000-0000-0000-0000-000000000001";
const DESIGNER_USER = "d0000000-0000-0000-0000-000000000001";
const CUSTOMER_USER = "c0000000-0000-0000-0000-000000000001";

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
const must = ({ error, data }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const lockedDb = (r) => r.error?.code === "42501" && /^project_progress_locked/.test(r.error?.message ?? "");

async function makeProject(title) {
  const req = randomUUID();
  const prop = randomUUID();
  const proj = randomUUID();
  must(await admin.from("fashion_requests").insert({ id: req, customer_id: CUSTOMER, title, category: "Occasion Wear", description: `${title} (lock test)`, status: "accepted" }), "request");
  must(await admin.from("proposals").insert({ id: prop, request_id: req, designer_id: DESIGNER, price: 30000, estimated_days: 20, description: "lock test", status: "accepted" }), "proposal");
  must(await admin.from("projects").insert({ id: proj, request_id: req, proposal_id: prop, customer_id: CUSTOMER, designer_id: DESIGNER, status: "active" }), "project");
  return { req, proj };
}

const designerCookie = await signInWithPassword("meera@lilirve.dev");
const customerCookie = await signInWithPassword("aanya@lilirve.dev");
const designerDb = await rawClientFromCookie(designerCookie);
const customerDb = await rawClientFromCookie(customerCookie);
const api = async (cookie, method, path, body) => {
  const res = await fetch(`${APP_URL}${path}`, { method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const P = await makeProject("Lock Test Gown");
const OPEN = await makeProject("Lock Test Open Project");

// a progress photo uploaded by the designer (their own folder in the project-updates bucket)
const photoPath = `${DESIGNER_USER}/lock-test-${randomUUID()}.png`;
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
must(await admin.storage.from("project-updates").upload(photoPath, png, { contentType: "image/png" }), "photo upload");
const fileId = randomUUID();
must(await admin.from("files").insert({ id: fileId, owner_id: DESIGNER_USER, entity_type: "project_update_image", bucket_id: "project-updates", storage_path: photoPath, mime_type: "image/png", is_private: true }), "file row");

console.log("\nBefore approval: progress is editable (active)");
let r = await api(designerCookie, "POST", `/api/projects/${P.proj}/updates`, { stage: "Design Confirmed", note: "Sketch approved.", imageFileIds: [fileId] });
check("designer adds an update with a photo", r.status === 200 && r.body?.update?.images?.length === 1, r);
const keepId = r.body?.update?.id;
r = await api(designerCookie, "PATCH", `/api/projects/${P.proj}/updates/${keepId}`, { note: "Sketch approved by the customer." });
check("designer edits it", r.status === 200 && r.body?.update?.note === "Sketch approved by the customer.", r);
r = await api(designerCookie, "POST", `/api/projects/${P.proj}/updates`, { stage: "Fabric Selected", note: "Temporary note." });
const tempId = r.body?.update?.id;
r = await api(designerCookie, "DELETE", `/api/projects/${P.proj}/updates/${tempId}`);
check("designer deletes an update", r.status === 200, r);
r = await api(designerCookie, "POST", `/api/projects/${P.proj}/updates`, { stage: "Fabric Selected", note: "Silk organza sourced." });
check("designer adds a second update (stage change)", r.status === 200, r);

console.log("\nAwaiting the customer's confirmation: still editable (existing workflow)");
r = await api(designerCookie, "POST", `/api/designer/projects/${P.proj}/complete`);
check("designer marks the project completed → awaiting_confirmation", r.status === 200 && r.body?.project?.status === "awaiting_confirmation", r);
r = await api(designerCookie, "PATCH", `/api/projects/${P.proj}/updates/${keepId}`, { note: "Sketch approved by the customer (final)." });
check("designer can still edit while awaiting confirmation", r.status === 200, r);

console.log("\nCustomer approves completion → progress history locked");
r = await api(customerCookie, "POST", `/api/projects/${P.proj}/confirm-completion`);
check("customer confirms completion → completed", r.status === 200 && r.body?.project?.status === "completed", r);

const snapshot = async () => {
  const ups = must(await admin.from("project_updates").select("id, stage, note, author_id, created_at").eq("project_id", P.proj).order("created_at"), "snapshot updates");
  const imgs = must(await admin.from("project_update_images").select("id, update_id, file_id, position, created_at").in("update_id", ups.map((u) => u.id)).order("id"), "snapshot images");
  const proj = must(await admin.from("projects").select("status, stage, stages, progress_percent, completed_at, changes_requested_at").eq("id", P.proj).single(), "snapshot project");
  const { data: obj } = await admin.storage.from("project-updates").download(photoPath);
  return JSON.stringify({ ups, imgs, proj, photoBytes: obj ? (await obj.arrayBuffer()).byteLength : null });
};
const before = await snapshot();

console.log("\nApp API after approval (designer) — clear 409 project_locked");
for (const [what, method, path, body] of [
  ["add an update", "POST", `/api/projects/${P.proj}/updates`, { stage: "Fitting", note: "Sneaky add." }],
  ["change the stage (timeline)", "POST", `/api/projects/${P.proj}/updates`, { stage: "Request Accepted", note: "Stage updated to Request Accepted." }],
  ["edit an update's note", "PATCH", `/api/projects/${P.proj}/updates/${keepId}`, { note: "Rewritten history." }],
  ["swap an update's photos", "PATCH", `/api/projects/${P.proj}/updates/${keepId}`, { imageFileIds: [] }],
  ["delete an update", "DELETE", `/api/projects/${P.proj}/updates/${keepId}`],
]) {
  r = await api(designerCookie, method, path, body);
  check(`refused: ${what}`, r.status === 409 && r.body?.code === "project_locked" && /final/.test(r.body?.message ?? ""), r);
}
r = await api(designerCookie, "POST", `/api/designer/projects/${P.proj}/complete`);
check("refused: marking it completed again", r.status === 400, r);

console.log("\nDirect database requests with the designer's own session (bypassing the app)");
check("insert a progress update", lockedDb(await designerDb.from("project_updates").insert({ project_id: P.proj, stage: "Fitting", note: "direct", author_id: DESIGNER })));
check("edit a progress update", lockedDb(await designerDb.from("project_updates").update({ note: "direct edit" }).eq("id", keepId)));
check("delete a progress update", lockedDb(await designerDb.from("project_updates").delete().eq("id", keepId)));
check("remove a progress photo link", lockedDb(await designerDb.from("project_update_images").delete().eq("update_id", keepId)));
check("attach a new photo", lockedDb(await designerDb.from("project_update_images").insert({ update_id: keepId, file_id: fileId, position: 5 })));
check("re-open the project (status → active)", lockedDb(await designerDb.from("projects").update({ status: "active" }).eq("id", P.proj)));
check("rewind its stage / progress", lockedDb(await designerDb.from("projects").update({ stage: "Design Confirmed", progress_percent: 20 }).eq("id", P.proj)));
check("the customer can't re-open it either", lockedDb(await customerDb.from("projects").update({ status: "active" }).eq("id", P.proj)));
await designerDb.storage.from("project-updates").remove([photoPath]);
const { data: stillThere } = await admin.storage.from("project-updates").download(photoPath);
check("deleting the photo file from storage has no effect", !!stillThere);

console.log("\nHistory preserved and visible");
const after = await snapshot();
check("every update, timestamp, photo link, the photo file and the project's completion are unchanged", after === before, { before: JSON.parse(before), after: JSON.parse(after) });
const hist = JSON.parse(after);
check("history has both updates (incl. the photo)", hist.ups.length === 2 && hist.imgs.length === 1 && hist.photoBytes > 0, hist);
for (const [who, cookie] of [["designer", designerCookie], ["customer", customerCookie]]) {
  r = await api(cookie, "GET", `/api/projects/${P.proj}/updates`);
  check(`${who} still sees the full progress history with its photo`, r.status === 200 && r.body?.updates?.length === 2 && r.body.updates.some((u) => u.images?.length === 1), r.body?.updates?.map((u) => ({ note: u.note, images: u.images?.length })));
}

console.log("\nAn unapproved project stays editable");
r = await api(designerCookie, "POST", `/api/projects/${OPEN.proj}/updates`, { stage: "Design Confirmed", note: "Open project note." });
const openUpdate = r.body?.update?.id;
check("add on an active project", r.status === 200, r);
r = await api(designerCookie, "PATCH", `/api/projects/${OPEN.proj}/updates/${openUpdate}`, { note: "Edited." });
check("edit on an active project", r.status === 200, r);
check("direct edit on an active project still works", !(await designerDb.from("project_updates").update({ note: "Edited directly." }).eq("id", openUpdate)).error);

console.log("\nWorkspace pages (phone 390px and desktop 1280px)");
const { chromium, devices } = await import("playwright");
const browser = await chromium.launch();
const pageFor = async (email, width) => {
  const ctx = await browser.newContext(width < 768 ? { ...devices["Pixel 7"], viewport: { width, height: 844 } } : { viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${APP_URL}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await p.fill("#email", email);
  await p.fill("#password", process.env.HRUNA_TEST_SEED_PASSWORD);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click('button[type="submit"]')]);
  return { ctx, p };
};
const controls = (p) =>
  p.evaluate(() => {
    const main = document.querySelector("main");
    const visible = (el) => !!el && el.getBoundingClientRect().width > 0;
    const btn = (re) => [...main.querySelectorAll("button")].filter((b) => re.test(b.innerText.trim()) || re.test(b.getAttribute("aria-label") ?? "")).filter(visible).length;
    return { add: btn(/^Add Update$/), edit: btn(/^Edit update$/), del: btn(/^Delete update$/), stage: btn(/^Update stage$/), note: visible(main.querySelector('[data-testid="progress-locked-note"]')), text: main.innerText };
  });
for (const width of [390, 1280]) {
  const d = await pageFor("meera@lilirve.dev", width);
  await d.p.goto(`${APP_URL}/designer/projects/${P.proj}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await d.p.waitForSelector("text=PROGRESS UPDATES", { timeout: 90000 });
  await d.p.waitForTimeout(400);
  let c = await controls(d.p);
  check(`@${width}px designer, approved project: no Add / Edit / Delete / Update stage; locked note shown; history listed`, c.add === 0 && c.edit === 0 && c.del === 0 && c.stage === 0 && c.note && c.text.includes("Sketch approved by the customer (final).") && c.text.includes("Silk organza sourced."), { ...c, text: undefined });
  await d.p.goto(`${APP_URL}/designer/projects/${OPEN.proj}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await d.p.waitForSelector("text=PROGRESS UPDATES", { timeout: 90000 });
  await d.p.waitForTimeout(400);
  c = await controls(d.p);
  check(`@${width}px designer, unapproved project: Add / Edit / Delete / Update stage available, no locked note`, c.add === 1 && c.edit >= 1 && c.del >= 1 && c.stage === 1 && !c.note, { ...c, text: undefined });
  await d.ctx.close();

  const cu = await pageFor("aanya@lilirve.dev", width);
  await cu.p.goto(`${APP_URL}/projects/${P.proj}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await cu.p.waitForSelector("text=PROGRESS", { timeout: 90000 });
  await cu.p.waitForTimeout(400);
  c = await controls(cu.p);
  check(`@${width}px customer, approved project: locked note shown, full history visible, no edit controls`, c.note && c.add === 0 && c.edit === 0 && c.del === 0 && c.text.includes("Sketch approved by the customer (final).") && c.text.includes("Silk organza sourced."), { ...c, text: undefined });
  await cu.p.goto(`${APP_URL}/projects/${OPEN.proj}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await cu.p.waitForSelector("text=PROGRESS", { timeout: 90000 });
  await cu.p.waitForTimeout(400);
  c = await controls(cu.p);
  check(`@${width}px customer, unapproved project: no locked note`, !c.note, { ...c, text: undefined });
  await cu.ctx.close();
}
await browser.close();

console.log("\nRemoving a whole project still cascades (database maintenance only — no app path deletes projects)");
// projects' own foreign keys don't cascade and account deletion refuses accounts with projects, so
// the only cascade into project_updates is deleting the project row itself; the lock must not block it.
must(await admin.from("projects").delete().eq("id", P.proj), "delete locked project");
const gone = must(await admin.from("project_updates").select("id").eq("project_id", P.proj), "post-cascade");
check("deleting a completed project cascades through its locked updates and photo links", gone.length === 0);

// cleanup of this run's local test rows
must(await admin.from("projects").delete().eq("id", OPEN.proj), "cleanup open project");
for (const { req } of [P, OPEN]) {
  must(await admin.from("proposals").delete().eq("request_id", req), "cleanup proposal");
  must(await admin.from("fashion_requests").delete().eq("id", req), "cleanup request");
}
await admin.from("files").delete().eq("id", fileId);
await admin.storage.from("project-updates").remove([photoPath]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
