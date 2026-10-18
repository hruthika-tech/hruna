// HRUNA — messaging UI suite. Renders the REAL /messages (customer) and /designer/messages (designer)
// pages in a headless browser and measures where each bubble actually sits on screen, so alignment is
// verified from the rendered page itself — not from the helper the pages call.
//
// Covers: both participants' messages on both screens, before and after a reload; the inbox card's
// latest-message preview (after sending in the UI, and after the OTHER participant writes while the
// page is open); and the explanatory note on a legacy self-conversation.
//
// Needs the `playwright` package and its Chromium (npx playwright install chromium). Runs via
// scripts/run-local-suites.mjs against the local stack + the app on :3100 like the other suites.

import { execSync } from "node:child_process";
import { APP_URL, signInWithPassword, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("✗ This suite needs the `playwright` package (npm i -D playwright && npx playwright install chromium).");
  process.exit(2);
}

const MEERA_DESIGNER_ID = "d1000000-0000-0000-0000-000000000001";
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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${JSON.stringify(detail).slice(0, 250)}` : ""}`);
  }
}

async function api(cookie, path, options = {}) {
  const res = await fetch(`${APP_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", cookie, ...(options.headers ?? {}) } });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** Local DB only (same container the runner resets) — used solely to set up a legacy self-conversation,
 *  which the app itself now refuses to create. */
// DB container of the stack under test (HRUNA_TEST_DB_CONTAINER, as in the other suites) — so a run
// against another local stack never reads from or writes to the default one.
const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
function sql(query) {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -t -A -c "${query.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
}

/** A browser context signed in with the same session cookie the API calls use. */
async function contextFor(browser, cookieHeader) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cookies = cookieHeader.split("; ").map((pair) => {
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: APP_URL };
  });
  await context.addCookies(cookies);
  return context;
}

/** Where a bubble is ACTUALLY rendered: compares the bubble's centre with its full-width row's centre. */
async function sideOf(page, text) {
  // Scoped to the open thread (the card preview in the inbox list can carry the same text).
  const bubble = page.locator("div.overflow-y-auto.p-5").getByText(text, { exact: true });
  await bubble.waitFor({ state: "visible", timeout: 20000 });
  const row = bubble.locator("xpath=..");
  const b = await bubble.boundingBox();
  const r = await row.boundingBox();
  if (!b || !r) return "not-rendered";
  return b.x + b.width / 2 > r.x + r.width / 2 ? "right" : "left";
}

/** The inbox card (a list button) for this conversation shows `text` as its latest-message preview. */
async function cardPreview(page, text) {
  try {
    await page.locator("button", { hasText: text }).first().waitFor({ state: "visible", timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await assertLocalTestEnvironment();
  const customerCookie = await signInWithPassword("aanya@lilirve.dev");
  const designerCookie = await signInWithPassword("meera@lilirve.dev");

  console.log("\n=== Setup: one conversation, messages from BOTH participants ===");
  const open = await api(customerCookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: MEERA_DESIGNER_ID }) });
  const convId = open.data.conversationId;
  check("   (setup) customer opens a conversation with the designer", open.status === 200 && !!convId, open.data);
  const sent = [];
  for (const [who, text] of [["customer", "ui-1 from customer"], ["designer", "ui-2 from designer"], ["customer", "ui-3 latest from customer"]]) {
    const r = await api(who === "customer" ? customerCookie : designerCookie, `/api/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ text }) });
    sent.push(r.status);
  }
  check("   (setup) 3 messages sent (customer, designer, customer)", sent.every((s) => s === 200), sent);

  const browser = await chromium.launch();
  try {
    const customerCtx = await contextFor(browser, customerCookie);
    const designerCtx = await contextFor(browser, designerCookie);
    const customerPage = await customerCtx.newPage();
    const designerPage = await designerCtx.newPage();

    for (const round of ["first load", "after reload"]) {
      console.log(`\n=== Rendered alignment — ${round} ===`);
      if (round === "first load") {
        await customerPage.goto(`${APP_URL}/messages?conversationId=${convId}`);
        await designerPage.goto(`${APP_URL}/designer/messages?conversationId=${convId}`);
      } else {
        await customerPage.reload();
        await designerPage.reload();
      }
      check(`Customer screen: customer's 1st message on the RIGHT`, (await sideOf(customerPage, "ui-1 from customer")) === "right");
      check(`Customer screen: designer's reply on the LEFT`, (await sideOf(customerPage, "ui-2 from designer")) === "left");
      check(`Customer screen: customer's 3rd message on the RIGHT`, (await sideOf(customerPage, "ui-3 latest from customer")) === "right");
      check(`Designer screen: customer's 1st message on the LEFT`, (await sideOf(designerPage, "ui-1 from customer")) === "left");
      check(`Designer screen: designer's reply on the RIGHT`, (await sideOf(designerPage, "ui-2 from designer")) === "right");
      check(`Designer screen: customer's 3rd message on the LEFT`, (await sideOf(designerPage, "ui-3 latest from customer")) === "left");
      check(`Both inbox cards preview the latest message`, (await cardPreview(customerPage, "ui-3 latest from customer")) && (await cardPreview(designerPage, "ui-3 latest from customer")));
    }

    console.log("\n=== Sending from the UI ===");
    await designerPage.getByPlaceholder("Type a message...").fill("ui-4 designer via UI");
    await designerPage.getByPlaceholder("Type a message...").press("Enter");
    check("Designer's message sent from the UI renders on the designer's RIGHT", (await sideOf(designerPage, "ui-4 designer via UI")) === "right");
    check("…and the designer's card preview updates to it immediately", await cardPreview(designerPage, "ui-4 designer via UI"));

    console.log("\n=== The other participant writes while the page is open ===");
    // The customer page is still showing ui-3 as latest. Returning to the tab must catch up.
    check("   (before) customer card still previews the older message", await cardPreview(customerPage, "ui-3 latest from customer"));
    await customerPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    check("On focus, the customer's card preview updates to the designer's new message", await cardPreview(customerPage, "ui-4 designer via UI"));
    check("…and the new designer message appears on the customer's LEFT", (await sideOf(customerPage, "ui-4 designer via UI")) === "left");
    await customerPage.reload();
    check("After reload, the customer card still shows the latest message", await cardPreview(customerPage, "ui-4 designer via UI"));
    check("After reload, the designer's message is still on the customer's LEFT", (await sideOf(customerPage, "ui-4 designer via UI")) === "left");

    console.log("\n=== Legacy self-conversation (one account on both sides) is explained, not misrendered ===");
    // Can't be created through the app any more — set up directly in the LOCAL database only.
    await api(designerCookie, "/api/profile/customer", { method: "POST", body: JSON.stringify({ name: "Meera (customer side)" }) });
    const meeraUser = sql("select id from auth.users where email = 'meera@lilirve.dev';");
    const meeraCustomer = sql(`select id from public.customer_profiles where user_id = '${meeraUser}';`);
    const selfConv = sql(`insert into public.conversations (customer_id, designer_id) values ('${meeraCustomer}', '${MEERA_DESIGNER_ID}') returning id;`).split("\n")[0];
    sql(`insert into public.messages (conversation_id, sender_id, text) values ('${selfConv}', '${meeraUser}', 'self-note test');`);
    await designerPage.goto(`${APP_URL}/designer/messages?conversationId=${selfConv}`);
    await designerPage.locator("div.overflow-y-auto.p-5").getByText("self-note test", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
    check("The self-conversation shows the 'between your own customer profile and your own studio' note", await designerPage.getByText("between your own customer profile and your own studio").isVisible());
    await designerPage.goto(`${APP_URL}/designer/messages?conversationId=${convId}`);
    await designerPage.locator("div.overflow-y-auto.p-5").getByText("ui-2 from designer", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
    check("…and a normal conversation does NOT show that note", !(await designerPage.getByText("between your own customer profile and your own studio").isVisible()));
  } finally {
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("Failed:", failures.join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
