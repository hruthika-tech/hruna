// HRUNA — navbar unread badges (Notifications bell + Messages icon) end to end, customer and designer.
// Uses the seed: customer aanya (request 71…01 with a PENDING proposal from designer meera, d1…01).
// Every write goes through the app's own API as the signed-in test user (no direct DB writes).
//
// If public.notification_reads is NOT in the database (migration 20261018000001 not applied), the
// suite checks the graceful path instead: no notification count is shown (never a guessed one) while
// message counts still work.
//
// LOCAL STACK ONLY (scripts/lib/test-auth.mjs). Optional HRUNA_TEST_DB_CONTAINER (read-only checks).
// Run with: node scripts/test-badges.mjs

import { spawnSync } from "node:child_process";
import { APP_URL, assertLocalTestEnvironment, rawClientFromCookie, registerAndConfirm, signInWithPassword } from "./lib/test-auth.mjs";

const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
const DESIGNER_PROFILE = "d1000000-0000-0000-0000-000000000001";
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
const dbRead = (sql) =>
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
const badges = async (cookie, side) => (await api(`/api/badges?side=${side}`, { cookie })).data;
const send = (cookie, conv, text) => api(`/api/conversations/${conv}/messages`, { method: "POST", cookie, body: { text } });
const openThread = (cookie, conv) => api(`/api/conversations/${conv}/messages`, { cookie });

let browser = null;
async function main() {
  await assertLocalTestEnvironment();
  try {
    browser = await (await import("playwright")).chromium.launch();
  } catch {
    console.log("  \x1b[33m!\x1b[0m playwright/Chromium unavailable — browser checks are SKIPPED");
  }
  const tracking = dbRead("SELECT to_regclass('public.notification_reads') IS NOT NULL") === "t";
  console.log(`\n(database under test: notification_reads ${tracking ? "PRESENT" : "MISSING — hosted-like state"})`);

  const customer = await signInWithPassword("aanya@lilirve.dev");
  const designer = await signInWithPassword("meera@lilirve.dev");
  const customerFeed = (await api("/api/notifications", { cookie: customer })).data;

  console.log("\n=== Access ===");
  check("A1. Signed-out → 401 (no counts for anyone)", (await api("/api/badges?side=customer")).status === 401);
  check("A2. Unknown side → 400", (await api("/api/badges?side=admin", { cookie: customer })).status === 400);
  const wrongSide = await badges(customer, "designer");
  check("A3. A customer-only account asking for designer counts gets none (null), not someone else's", wrongSide.messages === null && wrongSide.notifications === null, wrongSide);

  if (!tracking) {
    console.log("\n=== Without read tracking (hosted today) ===");
    const b = await badges(customer, "customer");
    check("N1. Notification count is null (badge hidden), never a guess", b.status === "ok" && b.notifications === null, b);
    check("N2. Message count still works (a number)", typeof b.messages === "number", b);
    check("N3. The page reports readTracking:false and keeps working", customerFeed.readTracking === false && Array.isArray(customerFeed.notifications) && customerFeed.notifications.length > 0, customerFeed);
    const mark = await api("/api/notifications/read", { method: "POST", cookie: customer, body: { keys: [customerFeed.notifications[0].id] } });
    check("N4. Marking read answers ok/saved:false (nothing to save into) instead of an error", mark.status === 200 && mark.data.saved === false, mark.data);
    if (browser) {
      const ctx = await browser.newContext();
      await ctx.addCookies(customer.split("; ").map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
      const page = await ctx.newPage();
      await page.goto(`${APP_URL}/home`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      check("N5. Browser: no notification badge is rendered; bell label has no count", (await page.locator('[data-testid="badge-notifications"]').count()) === 0 && (await page.locator('a[href="/notifications"][aria-label="Notifications"]').count()) >= 1);
      await ctx.close();
    }
  } else {
    console.log("\n=== Notifications: zero, one, multiple ===");
    const keys = customerFeed.notifications.map((n) => n.id);
    const start = await badges(customer, "customer");
    check("1a. Initial count = unread items of the customer's own feed (all unread at first)", customerFeed.readTracking === true && keys.length > 0 && start.notifications === keys.length && customerFeed.notifications.every((n) => n.read === false), { count: start.notifications, feed: keys.length });
    await api("/api/notifications/read", { method: "POST", cookie: customer, body: { keys: [keys[0]] } });
    await api("/api/notifications/read", { method: "POST", cookie: customer, body: { keys: [keys[0]] } });
    const one = await badges(customer, "customer");
    check("1b. Reading ONE item lowers the count by exactly one (repeat is idempotent)", one.notifications === keys.length - 1, one);
    const relist = (await api("/api/notifications", { cookie: customer })).data.notifications;
    check("1c. …and the page shows that item as read after a reload", relist.find((n) => n.id === keys[0])?.read === true && relist.filter((n) => n.read).length === 1);
    const bad = await api("/api/notifications/read", { method: "POST", cookie: customer, body: { keys: ["admin-1"] } });
    check("1d. Keys that aren't notification keys are refused (400)", bad.status === 400);
    const rest = keys.slice(1);
    if (rest.length) await api("/api/notifications/read", { method: "POST", cookie: customer, body: { keys: rest } });
    const zero = await badges(customer, "customer");
    check("1e. All read → 0 (badge hidden)", zero.notifications === 0, zero);

    console.log("\n=== Isolation ===");
    const stranger = await registerAndConfirm(`badge-stranger-${Date.now()}@example.test`);
    await api("/api/profile/customer", { method: "POST", cookie: stranger.cookie, body: { name: "Stranger", city: "Pune" } });
    const sb = await badges(stranger.cookie, "customer");
    check("2a. Another customer sees only THEIR counts (0 / 0), not aanya's", sb.messages === 0 && sb.notifications === 0, sb);
    const intrude = await api("/api/notifications/read", { method: "POST", cookie: stranger.cookie, body: { keys } });
    const aanyaAfter = await badges(customer, "customer");
    check("2b. Another user 'reading' aanya's keys only writes rows for THEMSELF", intrude.status === 200 && Number(dbRead(`SELECT count(*) FROM public.notification_reads WHERE user_id <> (SELECT id FROM auth.users WHERE email='aanya@lilirve.dev') AND notification_key = '${keys[0]}'`)) === 1 && aanyaAfter.notifications === 0);
    const raw = await rawClientFromCookie(stranger.cookie);
    const { data: visible } = await raw.from("notification_reads").select("user_id");
    const aanyaId = dbRead("SELECT id FROM auth.users WHERE email='aanya@lilirve.dev'");
    const { error: forged } = await raw.from("notification_reads").insert({ user_id: aanyaId, notification_key: "proposal-forged" });
    check("2c. RLS: a user sees only their own read rows and can't write rows for someone else", (visible ?? []).every((r) => r.user_id !== aanyaId) && !!forged, { rows: visible?.length, forged: forged?.code });

    console.log("\n=== Designer notifications ===");
    const dFeed = (await api("/api/designer/notifications", { cookie: designer })).data;
    const dStart = await badges(designer, "designer");
    check("3a. Designer count = unread items of the designer's own feed", dFeed.readTracking === true && dStart.notifications === dFeed.notifications.filter((n) => !n.read).length, { count: dStart.notifications, feed: dFeed.notifications.length });
    if (dFeed.notifications.length) {
      await api("/api/notifications/read", { method: "POST", cookie: designer, body: { keys: [dFeed.notifications[0].id] } });
      const d1 = await badges(designer, "designer");
      check("3b. Designer reading one item lowers their count by one", d1.notifications === dStart.notifications - 1, d1);
    }
  }

  console.log("\n=== Categorization: chat messages are not notifications ===");
  {
    const feed = customerFeed.notifications ?? [];
    check("C1. The customer's feed has genuine proposal items (both seeded proposals)", feed.some((n) => n.id === "proposal-81000000-0000-0000-0000-000000000001" && n.type === "proposal") && feed.some((n) => n.id === "proposal-82000000-0000-0000-0000-000000000001"), feed.map((n) => n.id));
    check("C2. …and genuine project-progress items", feed.some((n) => n.type === "progress" && n.id.startsWith("update-") && n.href === "/projects/91000000-0000-0000-0000-000000000001"), feed.map((n) => [n.type, n.href]));
    check("C3. …and NO chat-message items", !feed.some((n) => n.type === "message" || n.id.startsWith("message-") || /new message/i.test(n.text)), feed.map((n) => n.text));
    const markMsg = await api("/api/notifications/read", { method: "POST", cookie: customer, body: { keys: ["message-00000000-0000-0000-0000-000000000000"] } });
    check("C4. 'message-…' keys are refused by the read API (messages aren't notifications)", markMsg.status === 400, markMsg.data);
  }

  console.log("\n=== Messages: incoming vs outgoing, reading ===");
  const conv = (await api("/api/conversations", { method: "POST", cookie: customer, body: { designerId: DESIGNER_PROFILE } })).data.conversationId;
  await openThread(customer, conv);
  await openThread(designer, conv);
  const c0 = await badges(customer, "customer");
  const d0 = await badges(designer, "designer");
  check("4a. (setup) both sides start at 0 unread in this conversation", c0.messages === 0 && d0.messages === 0, { c0, d0 });
  await send(designer, conv, "badge test 1");
  await send(designer, conv, "badge test 2");
  await send(designer, conv, "badge test 3");
  const c1 = await badges(customer, "customer");
  check("4b. Three incoming messages → customer messages = 3", c1.messages === 3, c1);
  await send(customer, conv, "reply 1");
  await send(customer, conv, "reply 2");
  const c2 = await badges(customer, "customer");
  const d2 = await badges(designer, "designer");
  check("4c. The customer's OWN messages never count for the customer (still 3)", c2.messages === 3, c2);
  check("4d. …but they do for the designer (2 unread)", d2.messages === 2, d2);
  const feedAfterMessages = (await api("/api/notifications", { cookie: customer })).data.notifications ?? [];
  check("4e. Incoming messages add NOTHING to the Notifications feed", !feedAfterMessages.some((n) => n.type === "message" || n.id.startsWith("message-")) && feedAfterMessages.length === (customerFeed.notifications ?? []).length, feedAfterMessages.map((n) => n.id));
  if (tracking) check("4e2. …and nothing to the bell count (only the Messages count rose)", c2.notifications === c0.notifications && c2.messages === 3, { before: c0, after: c2 });
  await openThread(customer, conv);
  check("4f. Opening the conversation → customer messages = 0", (await badges(customer, "customer")).messages === 0);
  check("4g. …the designer's count is unaffected (still 2)", (await badges(designer, "designer")).messages === 2);
  await openThread(designer, conv);
  check("4h. Designer opens it → designer messages = 0", (await badges(designer, "designer")).messages === 0);

  console.log("\n=== 99+ cap and the browser ===");
  for (let i = 0; i < 101; i++) await send(designer, conv, `bulk ${i}`);
  const big = await badges(customer, "customer");
  check("5a. 101 incoming → the API reports the real number (101)", big.messages === 101, big);
  if (browser) {
    const ctx = await browser.newContext();
    await ctx.addCookies(customer.split("; ").map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${APP_URL}/home`, { waitUntil: "networkidle" });
    const msgBadge = page.locator('[data-testid="badge-messages"]');
    await msgBadge.waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
    const text = await msgBadge.innerText().catch(() => "");
    const label = await page.locator('a[href="/messages"]').first().getAttribute("aria-label");
    check("5b. Browser: Messages badge shows 99+ with an accessible label", text === "99+" && label === "Messages, more than 99 unread", { text, label });
    const headerWith = await page.locator("header").boundingBox();
    const iconWith = await page.locator('a[href="/messages"]').first().boundingBox();
    await page.goto(`${APP_URL}/messages?conversationId=${conv}`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Type a message...").waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector('[data-testid="badge-messages"]'), null, { timeout: 15000 }).catch(() => undefined);
    const goneAfterRead = (await page.locator('[data-testid="badge-messages"]').count()) === 0;
    const labelAfter = await page.locator('a[href="/messages"]').first().getAttribute("aria-label");
    check("5c. Browser: reading the conversation clears the Messages badge without a reload", goneAfterRead && labelAfter === "Messages", { goneAfterRead, labelAfter });
    const headerWithout = await page.locator("header").boundingBox();
    const iconWithout = await page.locator('a[href="/messages"]').first().boundingBox();
    check("5d. The badge doesn't shift the header layout (same header height and icon box)", headerWith && headerWithout && Math.abs(headerWith.height - headerWithout.height) < 0.5 && Math.abs(iconWith.width - iconWithout.width) < 0.5 && Math.abs(iconWith.x - iconWithout.x) < 0.5, { headerWith, headerWithout, iconWith, iconWithout });
    if (tracking) {
      const nLabel = await page.locator('a[href="/notifications"]').first().getAttribute("aria-label");
      const nCount = (await badges(customer, "customer")).notifications;
      check("5e. Browser: the bell's label matches the real notification count", nCount > 0 ? nLabel === `Notifications, ${nCount > 99 ? "more than 99" : nCount} unread` : nLabel === "Notifications", { nLabel, nCount });
    }
    await ctx.close();

    // Designer navbar, and switching accounts in the same browser.
    await send(customer, conv, "for the designer badge");
    const dctx = await browser.newContext();
    await dctx.addCookies(designer.split("; ").map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    const dpage = await dctx.newPage();
    await dpage.goto(`${APP_URL}/designer/home`, { waitUntil: "networkidle" });
    await dpage.locator('[data-testid="badge-messages"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
    const dText = await dpage.locator('[data-testid="badge-messages"]').innerText().catch(() => "");
    const dLabel = await dpage.locator('a[href="/designer/messages"]').first().getAttribute("aria-label");
    check("6a. Browser: designer navbar shows the designer's own unread count (1)", dText === "1" && dLabel === "Messages, 1 unread", { dText, dLabel });
    await dpage.evaluate(() => fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "local" }) }));
    const fresh = await registerAndConfirm(`badge-switch-${Date.now()}@example.test`);
    await api("/api/profile/customer", { method: "POST", cookie: fresh.cookie, body: { name: "Switch", city: "Goa" } });
    await dctx.addCookies(fresh.cookie.split("; ").map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    await dpage.goto(`${APP_URL}/home`, { waitUntil: "networkidle" });
    await dpage.waitForTimeout(1000);
    check("6b. Browser: after switching to another account, none of the previous account's counts show", (await dpage.locator('[data-testid="badge-messages"]').count()) === 0 && (await dpage.locator('[data-testid="badge-notifications"]').count()) === 0);
    await dctx.close();
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
