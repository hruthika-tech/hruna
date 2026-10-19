// HRUNA — responsive layout audit. Loads every page (public, customer, designer, admin) in a real
// browser at phone, tablet and desktop widths and fails if the PAGE scrolls horizontally. For each
// failure it names the elements that stick out past the viewport (outermost offenders only;
// anything inside a deliberate horizontal scroller is ignored), so the cause is visible directly.
// Prereqs: the app on HRUNA_TEST_APP_URL (default http://localhost:3100) against the LOCAL seeded
// stack, plus HRUNA_TEST_SEED_PASSWORD. Optional: HRUNA_TEST_WIDTHS="320,360" HRUNA_TEST_ONLY="/messages".
// Run with: node scripts/test-mobile-layout.mjs

const APP_URL = process.env.HRUNA_TEST_APP_URL ?? "http://localhost:3100";
const PASSWORD = process.env.HRUNA_TEST_SEED_PASSWORD;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP_URL)) throw new Error(`Refusing to run against a non-local app: ${APP_URL}`);
if (!PASSWORD) throw new Error("HRUNA_TEST_SEED_PASSWORD is required");
const WIDTHS = (process.env.HRUNA_TEST_WIDTHS ?? "320,360,390,430,768,1024,1440").split(",").map(Number);
const ONLY = process.env.HRUNA_TEST_ONLY;

const PUBLIC = ["/", "/about", "/acceptable-use", "/account-policy", "/become-a-designer", "/collaboration-policy", "/community-guidelines", "/content-policy", "/create-account", "/forgot-password", "/help", "/login", "/privacy", "/reporting-and-disputes", "/reviews-policy", "/support", "/terms", "/auth/link-error", "/verify-email"];
const CUSTOMER = ["/home", "/discover", "/studio/d1000000-0000-0000-0000-000000000001", "/collections/e1000000-0000-0000-0000-000000000001", "/dresses/e2000000-0000-0000-0000-000000000001", "/requests", "/requests/new", "/requests/71000000-0000-0000-0000-000000000001", "/projects", "/projects/91000000-0000-0000-0000-000000000001", "/messages", "/messages?c=a7000000-0000-0000-0000-000000000001", "/notifications", "/saved", "/diary", "/profile", "/profile?tab=blocked", "/subscription", "/account/email"];
const DESIGNER = ["/designer/home", "/designer/discover-requests", "/designer/requests", "/designer/requests/71000000-0000-0000-0000-000000000001", "/designer/projects", "/designer/projects/91000000-0000-0000-0000-000000000001", "/designer/messages", "/designer/messages?c=a7000000-0000-0000-0000-000000000001", "/designer/notifications", "/designer/profile", "/designer/reviews", "/designer/studio", "/designer/studio/manage", "/designer-subscription"];
const ADMIN = ["/admin", "/admin/verification", "/admin/users", "/admin/subscriptions", "/admin/disputes", "/admin/reports", "/admin/notifications", "/admin/settings", "/admin/customers/c1000000-0000-0000-0000-000000000001", "/admin/designers/d1000000-0000-0000-0000-000000000001"];

const { chromium } = await import("playwright");
const browser = await chromium.launch();
let failures = 0;
let checks = 0;

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (email) {
    const p = await ctx.newPage();
    await p.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
    await p.fill("#email", email);
    await p.fill("#password", PASSWORD);
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click('button[type="submit"]')]);
    await p.close();
  }
  return ctx;
}

// Outermost elements whose box extends past the viewport, ignoring content inside an element that
// clips or scrolls horizontally (a deliberate carousel) and fixed off-canvas UI that is hidden.
const offenders = () => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const clipsX = (el) => {
    const s = getComputedStyle(el);
    return ["hidden", "auto", "scroll", "clip"].includes(s.overflowX);
  };
  const walk = (el) => {
    for (const child of el.children) {
      const s = getComputedStyle(child);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const r = child.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && !(s.position === "fixed" && (r.left >= vw || r.right <= 0))) {
        const cls = typeof child.className === "string" ? child.className : child.getAttribute("class") ?? "";
        out.push(`<${child.tagName.toLowerCase()} class="${cls.slice(0, 110)}"> L${Math.round(r.left)} R${Math.round(r.right)} W${Math.round(r.width)} "${(child.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50)}"`);
        if (out.length > 6) return;
        continue; // report the outermost only
      }
      if (!clipsX(child)) walk(child);
    }
  };
  walk(document.body);
  return { vw, scrollWidth: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, out };
};

async function audit(ctx, routes, who) {
  console.log(`\n${who}`);
  const page = await ctx.newPage();
  for (const route of routes) {
    if (ONLY && !route.startsWith(ONLY)) continue;
    const bad = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 768 ? 780 : 900 });
      try {
        await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle", timeout: 90000 });
      } catch {
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(400);
      const r = await page.evaluate(offenders);
      checks++;
      if (r.scrollWidth > r.vw + 1 || r.out.length) bad.push(`    @${w}px page scrollWidth=${r.scrollWidth} (viewport ${r.vw})\n${r.out.map((o) => `      ${o}`).join("\n")}`);
    }
    const landed = new URL(page.url()).pathname;
    const note = landed !== route.split("?")[0] ? ` (→ ${landed})` : "";
    if (bad.length) {
      failures++;
      console.log(`  \x1b[31m✗\x1b[0m ${route}${note}\n${bad.join("\n")}`);
    } else console.log(`  \x1b[32m✓\x1b[0m ${route}${note}`);
  }
  await page.close();
}

await audit(await session(null), PUBLIC, "Public pages");
await audit(await session("aanya@lilirve.dev"), CUSTOMER, "Customer (aanya)");
await audit(await session("meera@lilirve.dev"), DESIGNER, "Designer (meera)");
await audit(await session("admin@lilirve.dev"), ADMIN, "Admin");
await browser.close();
console.log(`\n${checks} page×width checks; ${failures} page(s) with horizontal overflow at ${WIDTHS.join("/")}px`);
process.exit(failures ? 1 : 0);
