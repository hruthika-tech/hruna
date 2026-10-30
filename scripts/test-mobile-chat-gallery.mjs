// HRUNA — mobile chat + image viewer, in a real (touch-enabled) browser.
// Chat: inbox-first on phones, a dedicated conversation view with Back, the thread scrolls inside
// itself and opens at the latest message, bubbles stay on screen and on the correct side, the
// composer stays visible (also with the keyboard-shrunk viewport), sending works, a reader who has
// scrolled up isn't yanked down when new messages arrive, the inbox refreshes on focus, and desktop
// keeps its side-by-side layout. Viewer: opens from thumbnails, counter, next/prev, arrow keys,
// swipe, Escape/close/backdrop, no page scroll while open, focus restored, same image URL.
// Prereqs: the app on HRUNA_TEST_APP_URL against the LOCAL seeded stack with the mobile fixtures
// (conversation a7000000-…-0001 between aanya and meera; 6 reference images on project 91000000-…),
// plus HRUNA_TEST_SEED_PASSWORD, HRUNA_TEST_SUPABASE_URL and HRUNA_TEST_SERVICE_KEY (local only).
// Run with: node scripts/test-mobile-chat-gallery.mjs

import { createClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_URL, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

await assertLocalTestEnvironment(); // local app + local Supabase only — aborts otherwise

const PASSWORD = process.env.HRUNA_TEST_SEED_PASSWORD;
const SERVICE_KEY = process.env.HRUNA_TEST_SERVICE_KEY;
for (const u of [APP_URL, SUPABASE_URL]) if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) throw new Error(`Refusing non-local target ${u}`);
if (!PASSWORD || !SERVICE_KEY) throw new Error("HRUNA_TEST_SEED_PASSWORD and HRUNA_TEST_SERVICE_KEY are required");
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CONV = "a7000000-0000-0000-0000-000000000001";
const CUSTOMER_USER = "c0000000-0000-0000-0000-000000000001";
const DESIGNER_USER = "d0000000-0000-0000-0000-000000000001";
const PROJECT = "91000000-0000-0000-0000-000000000001";

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 400) : ""}`);
  }
};

const { chromium, devices } = await import("playwright");
const browser = await chromium.launch();
const phone = (width) => ({ ...devices["Pixel 7"], viewport: { width, height: 780 } });

async function signIn(ctx, email) {
  const p = await ctx.newPage();
  await p.goto(`${APP_URL}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await p.fill("#email", email);
  await p.fill("#password", PASSWORD);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click('button[type="submit"]')]);
  await p.close();
}

// Geometry of the open chat, measured from the rendered page.
const chatGeometry = () => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, visible: r.width > 0 && r.height > 0 };
  };
  const thread = document.querySelector('[data-testid="message-thread"]');
  const tr = thread?.getBoundingClientRect();
  const bubbles = [...(thread?.querySelectorAll(":scope > div > div") ?? [])].map((b) => {
    const r = b.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, mine: b.className.includes("bg-primary") };
  });
  const last = thread?.lastElementChild?.getBoundingClientRect();
  return {
    vw,
    vh,
    pageScrollWidth: document.documentElement.scrollWidth,
    panel: box('[data-testid="messages-panel"]'),
    list: box('[data-testid="conversation-list"]'),
    pane: box('[data-testid="chat-pane"]'),
    input: box('input[aria-label="Message"]'),
    send: box('button[aria-label="Send message"]'),
    back: box('button[aria-label="Back to conversations"]'),
    thread: tr && { top: tr.top, bottom: tr.bottom, scrollable: thread.scrollHeight > thread.clientHeight + 4, atBottom: thread.scrollHeight - thread.scrollTop - thread.clientHeight < 4, scrollTop: thread.scrollTop },
    lastVisible: !!(last && tr && last.bottom <= tr.bottom + 2 && last.top >= tr.top - 2),
    bubbles,
  };
};

async function chatSuite(email, base, label) {
  console.log(`\nChat on a phone — ${label}`);
  for (const width of [320, 360, 390, 430]) {
    const ctx = await browser.newContext(phone(width));
    await signIn(ctx, email);
    const page = await ctx.newPage();
    const threadLoads = [];
    page.on("request", (r) => r.url().includes(`/api/conversations/`) && r.url().includes("/messages") && r.method() === "GET" && threadLoads.push(r.url()));
    await page.goto(`${APP_URL}${base}`, { waitUntil: "networkidle" });
    let g = await page.evaluate(chatGeometry);
    const tag = `@${width}px`;
    check(`${tag} inbox first: list shown, chat hidden, nothing auto-opened (no hidden read-marking)`, g.list?.visible && !g.pane?.visible && threadLoads.length === 0, { list: g.list, pane: g.pane, threadLoads });

    await page.locator('[data-testid="conversation-list"] button').first().click();
    await page.waitForURL((u) => u.searchParams.get("conversationId") === CONV, { timeout: 15000 }).catch(() => undefined);
    await page.waitForSelector('[data-testid="message-thread"] .bg-primary', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    g = await page.evaluate(chatGeometry);
    check(`${tag} tapping opens a dedicated chat view (list hidden, URL names the conversation)`, !g.list?.visible && g.pane?.visible && new URL(page.url()).searchParams.get("conversationId") === CONV);
    check(`${tag} chat fills the screen below the navbar`, g.panel && Math.abs(g.panel.top - 81) <= 2 && Math.abs(g.panel.bottom - g.vh) <= 2 && g.panel.left >= -1 && g.panel.right <= g.vw + 1, g.panel);
    check(`${tag} no horizontal page overflow`, g.pageScrollWidth <= g.vw + 1, { scrollWidth: g.pageScrollWidth, vw: g.vw });
    check(`${tag} history scrolls inside the thread and opens at the latest message`, g.thread?.scrollable && g.thread?.atBottom && g.lastVisible, g.thread);
    check(`${tag} composer + Send visible and on screen`, g.input?.visible && g.send?.visible && g.send.right <= g.vw + 1 && g.input.bottom <= g.vh + 1 && g.input.top >= (g.thread?.bottom ?? 0) - 1, { input: g.input, send: g.send });
    const offscreen = g.bubbles.filter((b) => b.left < -1 || b.right > g.vw + 1);
    const mine = g.bubbles.filter((b) => b.mine);
    const theirs = g.bubbles.filter((b) => !b.mine);
    const paneMid = g.vw / 2;
    check(`${tag} bubbles on screen, readable width (≤85%), own right / other left`, offscreen.length === 0 && g.bubbles.every((b) => b.width <= g.vw * 0.86) && mine.length > 0 && theirs.length > 0 && mine.every((b) => b.right > paneMid) && theirs.every((b) => b.left < paneMid), { offscreen, sample: g.bubbles.slice(0, 3) });

    if (width === 390) {
      // keyboard: the viewport shrinks (interactive-widget=resizes-content) — composer must stay visible
      await page.setViewportSize({ width, height: 430 });
      await page.waitForTimeout(400);
      g = await page.evaluate(chatGeometry);
      check(`${tag} with the keyboard open (viewport 430px tall) composer stays visible and the thread stays at the latest message`, g.input?.visible && g.input.bottom <= 431 && g.thread?.atBottom, { input: g.input, thread: g.thread });
      await page.setViewportSize({ width, height: 780 });
      await page.waitForTimeout(300);

      // send
      const text = `mobile test ${Date.now()}`;
      await page.fill('input[aria-label="Message"]', text);
      await page.click('button[aria-label="Send message"]');
      await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="message-thread"] div')].some((d) => d.textContent === t), text, { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      g = await page.evaluate(chatGeometry);
      const sentBubble = g.bubbles[g.bubbles.length - 1];
      check(`${tag} sending: new message appears at the bottom, on the right, in view; input cleared`, sentBubble?.mine && g.thread?.atBottom && g.lastVisible && (await page.inputValue('input[aria-label="Message"]')) === "", { sentBubble, thread: g.thread });

      // reader scrolled up + a new message arrives → not yanked down; inbox refresh path works
      await page.evaluate(() => {
        const t = document.querySelector('[data-testid="message-thread"]');
        t.scrollTop = 0;
        t.dispatchEvent(new Event("scroll"));
      });
      const other = email.startsWith("aanya") ? DESIGNER_USER : CUSTOMER_USER;
      const incoming = `incoming ${Date.now()}`;
      await db.from("messages").insert({ conversation_id: CONV, sender_id: other, text: incoming });
      const inboxFetch = page.waitForResponse((r) => /\/api\/(designer\/)?conversations$/.test(new URL(r.url()).pathname) && r.request().method() === "GET", { timeout: 15000 }).catch(() => null);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      const inboxRes = await inboxFetch;
      await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="message-thread"] div')].some((d) => d.textContent === t), incoming, { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      g = await page.evaluate(chatGeometry);
      check(`${tag} focus refresh re-reads the inbox (fixed request path) and the thread`, inboxRes?.ok() === true && g.bubbles.length > 0, inboxRes ? `${inboxRes.status()} ${inboxRes.url()}` : "no inbox request");
      check(`${tag} a reader scrolled up into history isn't yanked to the bottom by a new message`, g.thread && g.thread.scrollTop < 40, g.thread);

      // back to the inbox: in-app Back, then the phone's Back gesture
      await page.click('button[aria-label="Back to conversations"]');
      await page.waitForURL((u) => !u.searchParams.get("conversationId"), { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      g = await page.evaluate(chatGeometry);
      check(`${tag} Back button returns to the conversation list`, g.list?.visible && !g.pane?.visible && !new URL(page.url()).searchParams.get("conversationId"));
      const preview = await page.locator('[data-testid="conversation-list"] button').first().innerText();
      check(`${tag} inbox card shows the newest message`, preview.includes(incoming.slice(0, 20)), preview);
      await page.locator('[data-testid="conversation-list"] button').first().click();
      await page.waitForURL((u) => u.searchParams.get("conversationId") === CONV, { timeout: 15000 }).catch(() => undefined);
      await page.goBack();
      await page.waitForTimeout(500);
      g = await page.evaluate(chatGeometry);
      check(`${tag} phone Back gesture (history back) returns to the list`, g.list?.visible && !g.pane?.visible, { url: page.url() });

      // deep link (e.g. "Open Chat" on a project) opens the chat directly
      await page.goto(`${APP_URL}${base}?conversationId=${CONV}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      g = await page.evaluate(chatGeometry);
      check(`${tag} deep link ?conversationId= opens the chat view directly, at the latest message`, g.pane?.visible && !g.list?.visible && g.thread?.atBottom, { pane: g.pane, list: g.list, thread: g.thread });
    }
    await ctx.close();
  }

  // desktop keeps side-by-side
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signIn(ctx, email);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}${base}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="message-thread"] .bg-primary', { timeout: 20000 }).catch(() => undefined);
  const g = await page.evaluate(chatGeometry);
  check(`@1280px desktop: list and chat side by side, first conversation open, panel 640px tall, no Back button`, g.list?.visible && g.pane?.visible && g.list.right <= g.pane.left + 1 && Math.abs(g.panel.bottom - g.panel.top - 640) <= 2 && !g.back?.visible && g.thread?.atBottom, { list: g.list, pane: g.pane, panel: g.panel });
  await ctx.close();
}

await chatSuite("aanya@lilirve.dev", "/messages", "customer");
await chatSuite("meera@lilirve.dev", "/designer/messages", "designer");

// ---------------- image viewer ----------------
const lightboxState = () => {
  const box = document.querySelector('[data-testid="image-lightbox"]');
  const img = document.querySelector('[data-testid="lightbox-image"]');
  const r = img?.getBoundingClientRect();
  return {
    open: !!box,
    counter: document.querySelector('[data-testid="lightbox-counter"]')?.textContent ?? null,
    imgSrc: img?.getAttribute("src") ?? null,
    imgFit: img ? getComputedStyle(img).objectFit : null,
    natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
    imgBox: r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    vw: document.documentElement.clientWidth,
    vh: window.innerHeight,
    pageScrollWidth: document.documentElement.scrollWidth,
    bodyOverflow: document.body.style.overflow,
    focus: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
  };
};
const srcParam = (s) => {
  try {
    return new URL(s, APP_URL).searchParams.get("url") ?? s;
  } catch {
    return s;
  }
};

async function swipe(page, dx) {
  await page.evaluate((dx) => {
    const el = document.querySelector('[data-testid="image-lightbox"]');
    const mk = (type, x) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 });
      el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
    mk("touchstart", 200);
    mk("touchend", 200 + dx);
  }, dx);
  await page.waitForTimeout(250);
}

console.log("\nImage viewer — customer project workspace (6 design images) @360px");
{
  const ctx = await browser.newContext(phone(360));
  await signIn(ctx, "aanya@lilirve.dev");
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/projects/${PROJECT}`, { waitUntil: "networkidle" });
  const thumbs = page.locator('button[aria-label^="View design image"]');
  check("design images are tappable buttons with labels", (await thumbs.count()) === 6, await thumbs.count());
  const thumbSrc = await thumbs.nth(2).locator("img").getAttribute("src");
  await thumbs.nth(2).click();
  await page.waitForSelector('[data-testid="image-lightbox"]', { timeout: 10000 }).catch(() => undefined);
  await page.waitForFunction(() => document.querySelector('[data-testid="lightbox-image"]')?.complete, null, { timeout: 15000 }).catch(() => undefined);
  let s = await page.evaluate(lightboxState);
  check("tapping image 3 opens the viewer at 3 / 6", s.open && s.counter === "3 / 6", s.counter);
  check("same stored image URL as the thumbnail (no URL rewriting)", srcParam(s.imgSrc) === srcParam(thumbSrc), { viewer: srcParam(s.imgSrc), thumb: srcParam(thumbSrc) });
  check("shown whole, not distorted (object-contain) and within the screen", s.imgFit === "contain" && s.imgBox.left >= -1 && s.imgBox.right <= s.vw + 1 && s.natural?.w > 0, { fit: s.imgFit, box: s.imgBox });
  check("page can't scroll underneath, and no horizontal overflow", s.bodyOverflow === "hidden" && s.pageScrollWidth <= s.vw + 1, s);
  check("focus moves into the viewer (close button)", s.focus === "Close image viewer", s.focus);
  await page.click('button[aria-label="Next image"]');
  check("Next → 4 / 6", (await page.evaluate(lightboxState)).counter === "4 / 6");
  await page.keyboard.press("ArrowRight");
  check("ArrowRight → 5 / 6", (await page.evaluate(lightboxState)).counter === "5 / 6");
  await page.keyboard.press("ArrowLeft");
  await page.click('button[aria-label="Previous image"]');
  check("ArrowLeft + Previous → 3 / 6", (await page.evaluate(lightboxState)).counter === "3 / 6");
  await swipe(page, -120);
  check("swipe left → next (4 / 6)", (await page.evaluate(lightboxState)).counter === "4 / 6");
  await swipe(page, 120);
  await swipe(page, 120);
  await swipe(page, 120);
  await swipe(page, 120);
  check("swipe right ×4 wraps around → 6 / 6", (await page.evaluate(lightboxState)).counter === "6 / 6");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  s = await page.evaluate(lightboxState);
  check("Escape closes; page scrolling restored; focus back on the thumbnail", !s.open && s.bodyOverflow === "" && /View design image 3/.test(s.focus ?? ""), s);
  await thumbs.nth(0).click();
  await page.click('button[aria-label="Close image viewer"]');
  check("close button closes", !(await page.evaluate(lightboxState)).open);
  // where the picture is actually drawn inside the object-contain box, and a point in a dark bar
  const drawn = () => {
    const img = document.querySelector('[data-testid="lightbox-image"]');
    const r = img.getBoundingClientRect();
    const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
    const bar = top - r.top > 12 ? { x: r.left + r.width / 2, y: r.top + (top - r.top) / 2 } : left - r.left > 12 ? { x: r.left + (left - r.left) / 2, y: r.top + r.height / 2 } : { x: 40, y: 30 };
    return { centre: { x: left + w / 2, y: top + h / 2 }, bar };
  };
  await thumbs.nth(1).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="lightbox-image"]')?.naturalWidth > 0, null, { timeout: 15000 }).catch(() => undefined);
  let pts = await page.evaluate(drawn);
  await page.mouse.click(pts.centre.x, pts.centre.y);
  await page.waitForTimeout(200);
  check("tapping the picture itself doesn't close it", (await page.evaluate(lightboxState)).open, pts);
  await page.mouse.click(pts.bar.x, pts.bar.y);
  await page.waitForTimeout(200);
  check("tapping the dark area beside the picture closes", !(await page.evaluate(lightboxState)).open, pts);
  if ((await page.evaluate(lightboxState)).open) await page.keyboard.press("Escape");
  await ctx.close();
}

console.log("\nImage viewer — other galleries @390px");
for (const [who, path, selector, expectCounter] of [
  ["aanya@lilirve.dev", "/requests/71000000-0000-0000-0000-000000000001", 'button[aria-label^="View reference image"]', null],
  ["meera@lilirve.dev", `/designer/projects/${PROJECT}`, 'button[aria-label^="View design image"]', "1 / 6"],
  ["aanya@lilirve.dev", "/dresses/e2000000-0000-0000-0000-000000000001", 'button[aria-label^="Enlarge image"]', null],
  ["aanya@lilirve.dev", "/studio/d1000000-0000-0000-0000-000000000001", 'button[aria-label^="View studio highlight"]', null],
]) {
  const ctx = await browser.newContext(phone(390));
  await signIn(ctx, who);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" });
  const n = await page.locator(selector).count();
  if (!n) {
    check(`${path}: has a tappable image`, false, "no trigger found");
    await ctx.close();
    continue;
  }
  await page.locator(selector).first().click();
  await page.waitForSelector('[data-testid="image-lightbox"]', { timeout: 10000 }).catch(() => undefined);
  const s = await page.evaluate(lightboxState);
  check(`${path}: opens the viewer${expectCounter ? ` (${expectCounter})` : ""}, contained, no overflow`, s.open && (!expectCounter || s.counter === expectCounter) && s.imgFit === "contain" && s.pageScrollWidth <= s.vw + 1, s);
  await page.keyboard.press("Escape");
  check(`${path}: Escape closes`, !(await page.evaluate(lightboxState)).open);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
