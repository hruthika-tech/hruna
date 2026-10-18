// HRUNA — the customer's "Message" button on a proposal (/requests/[id]) end to end.
//
// Uses the seed's request 71000000-…-0001 (customer aanya) with a PENDING proposal from approved
// designer meera (designer_profiles d1000000-…-0001) — the same shape as a real customer opening a
// proposal and pressing Message for the first time.
//
// The suite checks which database it is talking to:
//   • public.can_start_conversation() MISSING (a database without 20261012000002_conversation_start_rules
//     — the hosted project at the time of writing): Message must fail CLEARLY (toast + 503
//     messaging_not_ready), re-enable, and create nothing.
//   • present: Message opens/creates the conversation for exactly this customer + designer, reuses it
//     (no duplicates), both sides can send/receive, and nobody else can read or post in it.
//
// LOCAL STACK ONLY (see scripts/lib/test-auth.mjs). Optional HRUNA_TEST_DB_CONTAINER (read-only checks).
// Run with: node scripts/test-messaging-start.mjs

import { spawnSync } from "node:child_process";
import { APP_URL, assertLocalTestEnvironment, registerAndConfirm, signInWithPassword } from "./lib/test-auth.mjs";

const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
const REQUEST_ID = "71000000-0000-0000-0000-000000000001";
const CUSTOMER_PROFILE = "c1000000-0000-0000-0000-000000000001"; // aanya
const DESIGNER_PROFILE = "d1000000-0000-0000-0000-000000000001"; // meera
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
function db(sql) {
  const r = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA"], {
    input: `BEGIN READ ONLY; ${sql}; ROLLBACK;`,
    encoding: "utf8",
  });
  return (r.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
}
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const conversationCount = () => Number(db(`SELECT count(*) FROM public.conversations WHERE customer_id='${CUSTOMER_PROFILE}' AND designer_id='${DESIGNER_PROFILE}'`));

let browser = null;
async function main() {
  await assertLocalTestEnvironment();
  try {
    browser = await (await import("playwright")).chromium.launch();
  } catch {
    console.log("  \x1b[33m!\x1b[0m playwright/Chromium unavailable — browser checks are SKIPPED");
  }
  const customer = await signInWithPassword("aanya@lilirve.dev");
  const designer = await signInWithPassword("meera@lilirve.dev");
  const customerUserId = (await api("/api/auth/session", { cookie: customer })).data.userId;
  const designerUserId = (await api("/api/auth/session", { cookie: designer })).data.userId;
  const ruleInstalled = db(`SELECT exists(SELECT 1 FROM pg_proc WHERE proname='can_start_conversation' AND pronamespace='public'::regnamespace)`) === "t";
  console.log(`\n(database under test: can_start_conversation() ${ruleInstalled ? "PRESENT" : "MISSING — hosted-like state"})`);

  const setup = await api(`/api/requests/${REQUEST_ID}/proposals`, { cookie: customer });
  const proposal = (setup.data.proposals ?? []).find((p) => p.designerId === DESIGNER_PROFILE);
  check("0. (setup) the customer sees the designer's PENDING proposal on the request", setup.status === 200 && proposal?.status === "pending", setup.data);

  const clickMessage = async () => {
    const context = await browser.newContext();
    await context.addCookies(customer.split("; ").map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    const page = await context.newPage();
    await page.goto(`${APP_URL}/requests/${REQUEST_ID}`, { waitUntil: "networkidle" });
    const button = page.getByRole("button", { name: "Message", exact: true });
    const visible = (await button.count()) === 1;
    const response = page.waitForResponse((r) => r.url().endsWith("/api/conversations") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null);
    if (visible) await button.click();
    const res = await response;
    return { context, page, visible, res };
  };

  if (!ruleInstalled) {
    console.log("\n=== Database WITHOUT the start-conversation rule (hosted today) ===");
    const before = conversationCount();
    const r = await api("/api/conversations", { method: "POST", cookie: customer, body: { designerId: DESIGNER_PROFILE } });
    check("M1. POST /api/conversations → 503 messaging_not_ready with a clear message (not a generic 500)", r.status === 503 && r.data.code === "messaging_not_ready" && /isn't fully set up/.test(r.data.message ?? ""), r);
    check("M2. …and no conversation was created", conversationCount() === before);
    if (browser) {
      const { context, page, visible, res } = await clickMessage();
      await page.waitForTimeout(1500);
      const text = await page.locator("body").innerText();
      const enabled = await page.getByRole("button", { name: "Message", exact: true }).isEnabled().catch(() => false);
      check("M3. Browser: clicking Message shows the clear error and the button works again (not silent)", visible && res?.status() === 503 && text.includes("isn't fully set up") && enabled && page.url().includes(`/requests/${REQUEST_ID}`), { visible, status: res?.status(), url: page.url() });
      await context.close();
    }
  } else {
    console.log("\n=== Message → open or create the conversation ===");
    const before = conversationCount();
    let convId = null;
    if (browser) {
      const { context, page, visible, res } = await clickMessage();
      const body = res ? await res.json().catch(() => ({})) : {};
      await page.waitForURL(/\/messages\?conversationId=/, { timeout: 20000 }).catch(() => undefined);
      convId = new URL(page.url()).searchParams.get("conversationId");
      await page.getByPlaceholder("Type a message...").waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
      const header = await page.locator("body").innerText();
      check("1a. Browser: Message on the proposal → /messages?conversationId=<the new conversation>", visible && res?.status() === 200 && convId && convId === body.conversationId, { status: res?.status(), url: page.url() });
      check("1b. …the thread with that designer's studio is open and ready to type in", header.includes("Atelier Meera") && (await page.getByPlaceholder("Type a message...").count()) === 1, header.slice(0, 300));
      // The customer sends from the UI.
      await page.getByPlaceholder("Type a message...").fill("Hello from the proposal page");
      await page.getByLabel("Send message").click();
      await page.locator("div.overflow-y-auto.p-5").getByText("Hello from the proposal page", { exact: true }).waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
      check("1c. Browser: the customer's message is sent and shown in the thread", (await page.locator("div.overflow-y-auto.p-5").getByText("Hello from the proposal page", { exact: true }).count()) > 0);
      await context.close();
    } else {
      const r = await api("/api/conversations", { method: "POST", cookie: customer, body: { designerId: DESIGNER_PROFILE } });
      convId = r.data.conversationId;
      await api(`/api/conversations/${convId}/messages`, { method: "POST", cookie: customer, body: { text: "Hello from the proposal page" } });
    }
    const row = db(`SELECT customer_id||'|'||designer_id FROM public.conversations WHERE id='${convId}'`);
    check("2. The conversation belongs to exactly this customer and this designer", row === `${CUSTOMER_PROFILE}|${DESIGNER_PROFILE}` && conversationCount() === before + 1, { row, count: conversationCount() });

    const again = await api("/api/conversations", { method: "POST", cookie: customer, body: { designerId: DESIGNER_PROFILE } });
    if (browser) {
      const { context, page } = await clickMessage();
      await page.waitForURL(/\/messages\?conversationId=/, { timeout: 20000 }).catch(() => undefined);
      check("3a. Browser: pressing Message again reopens the SAME conversation", new URL(page.url()).searchParams.get("conversationId") === convId, page.url());
      await context.close();
    }
    check("3b. API: get-or-create returns the same id; still exactly one conversation (no duplicates)", again.status === 200 && again.data.conversationId === convId && conversationCount() === before + 1, again.data);

    console.log("\n=== Both sides can send and receive ===");
    const inbox = await api("/api/designer/conversations", { cookie: designer });
    check("4a. The designer sees the conversation in their inbox", (inbox.data.conversations ?? []).some((c) => c.id === convId), inbox.data);
    const reply = await api(`/api/conversations/${convId}/messages`, { method: "POST", cookie: designer, body: { text: "Thanks — happy to help!" } });
    check("4b. The designer can reply", reply.status === 200, reply.data);
    const thread = (await api(`/api/conversations/${convId}/messages`, { cookie: customer })).data.messages ?? [];
    const fromCustomer = thread.find((m) => m.text === "Hello from the proposal page");
    const fromDesigner = thread.find((m) => m.text === "Thanks — happy to help!");
    check("4c. The customer receives the reply; each message carries its real sender", fromCustomer?.senderId === customerUserId && fromDesigner?.senderId === designerUserId, thread.map((m) => [m.text, m.senderId]));
    const list = (await api("/api/conversations", { cookie: customer })).data.conversations ?? [];
    check("4d. The customer's inbox lists it with the latest message", list.some((c) => c.id === convId && c.lastMessage === "Thanks — happy to help!"), list.map((c) => [c.id, c.lastMessage]));

    console.log("\n=== Nobody else can read or post ===");
    const stranger = await registerAndConfirm(`msg-stranger-${Date.now()}@example.test`);
    await api("/api/profile/customer", { method: "POST", cookie: stranger.cookie, body: { name: "Stranger", city: "Pune" } });
    const peek = await api(`/api/conversations/${convId}/messages`, { cookie: stranger.cookie });
    const post = await api(`/api/conversations/${convId}/messages`, { method: "POST", cookie: stranger.cookie, body: { text: "let me in" } });
    const strangerList = (await api("/api/conversations", { cookie: stranger.cookie })).data.conversations ?? [];
    // RLS hides the thread from non-participants (an empty list, never the participants' messages).
    const leaked = (r) => r.status === 200 && (r.data.messages ?? []).length > 0;
    check("5a. Another customer gets none of its messages, can't post in it, and doesn't see it", !leaked(peek) && post.status >= 400 && /permission/i.test(post.data.message ?? "") && !strangerList.some((c) => c.id === convId), { peek: [peek.status, (peek.data.messages ?? []).length], post: [post.status, post.data.message] });
    const otherDesigner = await signInWithPassword("ramesh@lilirve.dev");
    const peek2 = await api(`/api/conversations/${convId}/messages`, { cookie: otherDesigner });
    const post2 = await api(`/api/conversations/${convId}/messages`, { method: "POST", cookie: otherDesigner, body: { text: "let me in" } });
    check("5b. Another designer gets none of its messages and can't post either", !leaked(peek2) && post2.status >= 400, { peek: [peek2.status, (peek2.data.messages ?? []).length], post: post2.status });
    check("5c. …and no stray message was stored", Number(db(`SELECT count(*) FROM public.messages WHERE conversation_id='${convId}' AND text='let me in'`)) === 0);

    console.log("\n=== Clear errors ===");
    const bad = await api("/api/conversations", { method: "POST", cookie: customer, body: { designerId: "not-a-uuid" } });
    check("6a. Malformed designer id → 400", bad.status === 400, bad.data);
    const unknown = await api("/api/conversations", { method: "POST", cookie: customer, body: { designerId: "00000000-0000-0000-0000-00000000dead" } });
    check("6b. Unknown designer → refused with a clear message, nothing created", unknown.status === 403 && /isn't available/.test(unknown.data.message ?? "") && Number(db(`SELECT count(*) FROM public.conversations WHERE designer_id='00000000-0000-0000-0000-00000000dead'`)) === 0, unknown.data);
    const anon = await api("/api/conversations", { method: "POST", body: { designerId: DESIGNER_PROFILE } });
    check("6c. Signed-out → 401", anon.status === 401);
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
