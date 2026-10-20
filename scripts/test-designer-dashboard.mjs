// HRUNA — designer dashboard (/designer/home) with the mannequin-and-lilies background, in a real
// browser at 320–1440px, signed in as the seeded designer (meera). Checks the background (loaded,
// fixed behind the content, not stretched, centred, can't take clicks, no horizontal overflow), that
// all existing content is still there with Manage Studio removed, that the three counts equal what
// the dashboard's own APIs return, that every button/link is the element actually under the pointer
// and goes where it should, and that the mobile navigation still opens.
// Prereqs: the app on HRUNA_TEST_APP_URL against the LOCAL seeded stack + HRUNA_TEST_SEED_PASSWORD.
// Run with: node scripts/test-designer-dashboard.mjs

const APP_URL = process.env.HRUNA_TEST_APP_URL ?? "http://localhost:3100";
const PASSWORD = process.env.HRUNA_TEST_SEED_PASSWORD;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP_URL)) throw new Error(`Refusing non-local app ${APP_URL}`);
if (!PASSWORD) throw new Error("HRUNA_TEST_SEED_PASSWORD is required");

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

const { chromium, devices } = await import("playwright");
const browser = await chromium.launch();

async function designerContext(width) {
  const mobile = width < 768;
  const ctx = await browser.newContext(mobile ? { ...devices["Pixel 7"], viewport: { width, height: 800 } } : { viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${APP_URL}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await p.fill("#email", "meera@lilirve.dev");
  await p.fill("#password", PASSWORD);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click('button[type="submit"]')]);
  await p.close();
  return ctx;
}

const inspect = async () => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const bd = document.querySelector('[data-testid="dashboard-backdrop"]');
  const bs = bd && getComputedStyle(bd);
  const before = bd && getComputedStyle(bd, "::before");
  const after = bd && getComputedStyle(bd, "::after");
  const content = bd?.nextElementSibling;
  const main = document.querySelector("main");
  const text = main.innerText;
  const links = [...main.querySelectorAll("a")].map((a) => ({ text: a.innerText.trim().replace(/\s+/g, " "), href: a.getAttribute("href") }));
  const img = await fetch("/images/designer/dashboard-mannequin-bg.webp");
  const stats = [...main.querySelectorAll('a[href="/designer/requests"], a[href="/designer/projects"]')]
    .map((a) => a.innerText.trim().split("\n").map((s) => s.trim()).filter(Boolean))
    .filter((t) => t.length === 2 && /^\d+$/.test(t[0]));
  // the dashboard's own data, computed the same way the page does
  const [rq, pj] = await Promise.all([fetch("/api/designer/requests").then((r) => r.json()), fetch("/api/designer/projects").then((r) => r.json())]);
  const direct = rq.requests.filter((r) => !!r.preferredDesignerId);
  const expected = {
    "Requests Received": direct.filter((r) => r.status === "submitted").length,
    "Active Projects": pj.projects.filter((p) => p.status === "active" || p.status === "awaiting_confirmation").length,
    "Completed Projects": pj.projects.filter((p) => p.status === "completed").length,
  };
  // every clickable thing in the dashboard is the topmost element at its own centre
  const blocked = [...main.querySelectorAll("a, button")].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > vh) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && !el.contains(hit);
  }).map((el) => el.innerText.trim());
  return {
    vw,
    vh,
    pageScrollWidth: document.documentElement.scrollWidth,
    backdrop: bd && {
      position: bs.position,
      pointerEvents: bs.pointerEvents,
      zIndex: bs.zIndex,
      width: bd.getBoundingClientRect().width,
      height: bd.getBoundingClientRect().height,
      canvasHeight: bd.parentElement.getBoundingClientRect().height,
      contentHeight: content.getBoundingClientRect().height,
      mqH: bs.getPropertyValue("--mq-h").trim(),
      attachment: [bs.backgroundAttachment, before.backgroundAttachment],
      motion: [bs.animationName, before.animationName, after.animationName, bs.transitionDuration, before.transitionDuration],
      animations: bd.getAnimations({ subtree: true }).length,
      bgImage: before.backgroundImage,
      beforeW: parseFloat(before.width),
      beforeH: parseFloat(before.height),
      beforeLeft: before.left,
      beforeTop: before.top,
      mask: before.maskImage || before.webkitMaskImage,
      checker: bs.backgroundImage,
      checkerSize: bs.backgroundSize,
      veil: `${after.backgroundImage} | ${after.backgroundColor}`,
    },
    panels: [...main.querySelectorAll("section")].slice(0, 2).map((s) => getComputedStyle(s).backgroundColor),
    statBgs: [...main.querySelectorAll('a[href="/designer/requests"] > div, a[href="/designer/projects"] > div')].slice(0, 3).map((d) => getComputedStyle(d).backgroundColor),
    contentZ: content && getComputedStyle(content).zIndex,
    imgStatus: img.status,
    imgType: img.headers.get("content-type"),
    text,
    links,
    stats,
    expected,
    blocked,
  };
};

console.log("\nDesigner dashboard at each width");
for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
  const ctx = await designerContext(width);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/designer/home`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Your studio at a glance", { timeout: 30000 });
  await page.waitForTimeout(500);
  const m = await page.evaluate(inspect);
  const t = `@${width}px`;
  const b = m.backdrop;
  check(`${t} background image served (webp) and applied`, m.imgStatus === 200 && /webp/.test(m.imgType ?? "") && /dashboard-mannequin-bg\.webp/.test(b?.bgImage ?? ""), { status: m.imgStatus, type: m.imgType, bg: b?.bgImage });
  check(`${t} background is part of the page (absolute, not fixed), covers the whole dashboard, non-interactive, behind the content`, b && b.position === "absolute" && b.pointerEvents === "none" && b.zIndex === "0" && m.contentZ === "1" && Math.abs(b.width - m.vw) <= 1 && Math.abs(b.height - b.canvasHeight) <= 1 && b.canvasHeight >= b.contentHeight - 1, { b, contentZ: m.contentZ });
  check(`${t} no fixed attachment, animation, transition or scroll-linked motion on the background`, !b.attachment.includes("fixed") && b.motion.slice(0, 3).every((a) => a === "none") && b.motion.slice(3).every((d) => d === "0s") && b.animations === 0, { attachment: b.attachment, motion: b.motion, animations: b.animations });
  check(`${t} sized from the large viewport (lvh) — constant while a phone's address bar moves`, /lvh/.test(b.mqH), b.mqH);
  const ratio = b.beforeW / b.beforeH;
  check(`${t} mannequin keeps its proportions (852:1846, not stretched), anchored at the top of the page, centred`, Math.abs(ratio - 852 / 1846) < 0.005 && b.beforeH >= m.vh - 1 && b.beforeLeft === `${m.vw / 2}px` && b.beforeTop === "0px", { ratio, w: b.beforeW, h: b.beforeH, left: b.beforeLeft, top: b.beforeTop, vw: m.vw });

  if (width < 768) {
    // The background must move exactly with the content (no drift), and must not move when the
    // viewport height changes the way it does when a phone's address bar collapses/expands.
    const pos = () =>
      page.evaluate(() => {
        const bd = document.querySelector('[data-testid="dashboard-backdrop"]');
        const h1 = document.querySelector("main h1");
        return { bd: bd.getBoundingClientRect().top + window.scrollY, h1: h1.getBoundingClientRect().top + window.scrollY, bdScreen: bd.getBoundingClientRect().top, h1Screen: h1.getBoundingClientRect().top, beforeTop: getComputedStyle(bd, "::before").top, beforeH: getComputedStyle(bd, "::before").height };
      });
    const p0 = await pos();
    const offsets = [];
    for (const y of [150, 420, 800, 1300]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
      const p = await pos();
      offsets.push(Math.round((p.bdScreen - p.h1Screen) * 100) / 100);
    }
    check(`${t} while scrolling, the background moves exactly with the content (constant offset to the heading)`, offsets.every((o) => Math.abs(o - (p0.bdScreen - p0.h1Screen)) < 0.5), { start: p0.bdScreen - p0.h1Screen, offsets });
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await pos();
    await page.setViewportSize({ width, height: 800 + 56 }); // address bar collapses: ~56px taller viewport
    await page.waitForTimeout(250);
    const after = await pos();
    check(`${t} viewport height change (address bar collapse) doesn't move the mannequin within the page`, Math.abs(after.bd - before.bd) < 0.5 && Math.abs(after.h1 - before.h1) < 0.5 && after.beforeTop === "0px", { before, after });
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  const tile = ((b.beforeH * 72) / 1846) * 2;
  const [cw, ch] = (b.checkerSize ?? "").split(" ").map(parseFloat);
  check(`${t} checkerboard texture spans the full page, at the image's own check size`, (b.checker.match(/linear-gradient/g) ?? []).length === 2 && Math.abs(cw - tile) < 0.6 && Math.abs(ch - tile) < 0.6, { checker: b.checker.slice(0, 120), size: b.checkerSize, expected: tile });
  check(`${t} mannequin edges dissolve into the texture (soft radial mask, no hard boundary)`, /radial-gradient/.test(b.mask ?? ""), b.mask);
  check(`${t} ivory veil, soft diagonal light and a gentle tonal vignette over the image`, /radial-gradient/.test(b.veil) && /linear-gradient\(118deg/.test(b.veil) && /rgba\(248, 246, 238, 0\.16\)/.test(b.veil), b.veil);
  check(`${t} stat cards and section panels sit on ivory surfaces (not directly on the pattern)`, m.statBgs.length === 3 && m.statBgs.every((c) => /rgba\(251, 250, 245, 0\.85\)/.test(c)) && m.panels.length === 2 && m.panels.every((c) => /rgba\(251, 250, 245, 0\.7\)/.test(c)), { statBgs: m.statBgs, panels: m.panels });
  check(`${t} no horizontal page scroll`, m.pageScrollWidth <= m.vw + 1, { sw: m.pageScrollWidth, vw: m.vw });
  check(`${t} all existing content present`, ["WELCOME BACK", "Your studio at a glance", "Requests Received", "Active Projects", "Completed Projects", "Requests received", "Active projects", "Looking for your next commission?"].every((s) => m.text.includes(s)), m.text.slice(0, 300));
  check(`${t} Manage Studio button removed from the dashboard; Discover Requests ×2 and View all ×2 kept`, !m.links.some((l) => /Manage Studio/.test(l.text) || l.href === "/designer/studio/manage") && m.links.filter((l) => l.href === "/designer/discover-requests").length === 2 && m.links.filter((l) => /^View all/.test(l.text)).length === 2, m.links);
  const shown = Object.fromEntries(m.stats.map(([v, label]) => [label, Number(v)]));
  check(`${t} the three counts are the live data`, Object.entries(m.expected).every(([k, v]) => shown[k] === v), { shown, expected: m.expected });
  check(`${t} nothing covers any button or link (background never intercepts)`, m.blocked.length === 0, m.blocked);
  await ctx.close();
}

console.log("\nButtons and links still work (390px phone and 1280px desktop)");
for (const width of [390, 1280]) {
  const ctx = await designerContext(width);
  const page = await ctx.newPage();
  const targets = [
    ["header Discover Requests", 'main a[href="/designer/discover-requests"] >> nth=0', "/designer/discover-requests"],
    ["commission section Discover Requests", 'main a[href="/designer/discover-requests"] >> nth=1', "/designer/discover-requests"],
    ["Requests Received card", 'main a[href="/designer/requests"] >> nth=0', "/designer/requests"],
    ["Active Projects card", 'main a[href="/designer/projects"] >> nth=0', "/designer/projects"],
    ["Completed Projects card", 'main a[href="/designer/projects"] >> nth=1', "/designer/projects"],
    ["Requests received → View all", 'main a:has-text("View all") >> nth=0', "/designer/requests"],
    ["Active projects → View all", 'main a:has-text("View all") >> nth=1', "/designer/projects"],
  ];
  for (const [name, sel, path] of targets) {
    await page.goto(`${APP_URL}/designer/home`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("text=Your studio at a glance", { timeout: 60000 });
    await Promise.all([page.waitForURL((u) => u.pathname === path, { timeout: 30000 }).catch(() => undefined), page.locator(sel).click()]);
    check(`@${width}px ${name} → ${path}`, new URL(page.url()).pathname === path, page.url());
  }
  if (width === 390) {
    await page.goto(`${APP_URL}/designer/home`, { waitUntil: "networkidle" });
    await page.locator("header button[aria-label^='Open menu']").click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
    const hrefs = await dialog.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    check("@390px mobile navigation opens, with My Studio (→ Manage Studio) still in it", (await dialog.isVisible()) && hrefs.includes("/designer/studio"), hrefs);
    await page.goto(`${APP_URL}/designer/studio`, { waitUntil: "networkidle" });
    check("Manage Studio is still reachable from My Studio", (await page.locator('a[href="/designer/studio/manage"]').count()) > 0);
  }
  await ctx.close();
}

console.log("\nBackground is only on the dashboard");
{
  const ctx = await designerContext(1280);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/designer/requests`, { waitUntil: "networkidle" });
  check("other designer pages unchanged (no dashboard background)", (await page.locator('[data-testid="dashboard-backdrop"]').count()) === 0);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
