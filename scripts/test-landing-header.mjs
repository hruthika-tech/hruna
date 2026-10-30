// HRUNA — landing header entry points, in a real browser. At 320–1440px: Log In and Sign Up are
// visible in the header bar (not only in the menu), on screen, not overlapping each other, the logo
// or the menu button, link to the existing /login and /create-account, and the page doesn't scroll
// sideways. Below md the hamburger opens the secondary menu (Escape / × close it). The hero's second
// CTA is "Explore Designers" → /discover and "I'm a Designer" is gone from header and hero. Both
// buttons reach the existing pages.
// Prereqs: the app on HRUNA_TEST_APP_URL (default http://localhost:3100). Run: node scripts/test-landing-header.mjs

import { APP_URL, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

await assertLocalTestEnvironment(); // local app + local Supabase only — aborts otherwise

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP_URL)) throw new Error(`Refusing non-local app ${APP_URL}`);

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

const { chromium, devices } = await import("playwright");
const browser = await chromium.launch();

const measure = () => {
  const header = document.querySelector("header");
  const vw = document.documentElement.clientWidth;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" };
  };
  const visibleLink = (text) => [...header.querySelectorAll("a")].find((a) => a.textContent.trim() === text && a.getBoundingClientRect().width > 0);
  const login = visibleLink("Log In");
  const signup = [...header.querySelectorAll("a")].find((a) => a.textContent.trim().startsWith("Sign Up") && a.getBoundingClientRect().width > 0);
  const logo = [...header.querySelectorAll("a")].find((a) => a.textContent.trim() === "HRUNA");
  const menu = header.querySelector('button[aria-label="Open menu"]');
  const clipped = (el) => el && (el.scrollWidth > el.clientWidth + 1);
  return {
    vw,
    pageScrollWidth: document.documentElement.scrollWidth,
    login: rect(login),
    loginHref: login?.getAttribute("href"),
    loginClipped: clipped(login),
    signup: rect(signup),
    signupHref: signup?.getAttribute("href"),
    signupClipped: clipped(signup),
    logo: rect(logo),
    menu: rect(menu),
    headerText: header.innerText,
  };
};
const overlap = (a, b) => a && b && a.shown && b.shown && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

console.log("\nHeader at each width");
for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
  const mobile = width < 768;
  const ctx = await browser.newContext(mobile ? { ...devices["Pixel 7"], viewport: { width, height: 780 } } : { viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/`, { waitUntil: "networkidle" });
  const m = await page.evaluate(measure);
  const t = `@${width}px`;
  const inView = (r) => r && r.shown && r.left >= -0.5 && r.right <= m.vw + 0.5;
  check(`${t} Log In + Sign Up visible in the header bar, fully on screen, not clipped`, inView(m.login) && inView(m.signup) && !m.loginClipped && !m.signupClipped, { login: m.login, signup: m.signup });
  check(`${t} they link to the existing /login and /create-account`, m.loginHref === "/login" && m.signupHref === "/create-account", { login: m.loginHref, signup: m.signupHref });
  check(`${t} no overlap between logo, Log In, Sign Up${mobile ? ", menu" : ""}`, !overlap(m.logo, m.login) && !overlap(m.login, m.signup) && !overlap(m.signup, m.menu) && !overlap(m.logo, m.signup) && inView(m.logo), m);
  check(`${t} touch-friendly height (≥40px)`, m.login.h >= 39.5 && m.signup.h >= 39.5, { login: m.login.h, signup: m.signup.h });
  check(`${t} ${mobile ? "hamburger menu visible and on screen" : "no hamburger on desktop"}`, mobile ? inView(m.menu) : !m.menu?.shown, m.menu);
  check(`${t} no "I'm a Designer"/"Sign In"/"Discover" in the header bar; no horizontal page scroll`, !/I'm a Designer|Sign In|Discover/.test(m.headerText) && m.pageScrollWidth <= m.vw + 1, { text: m.headerText, sw: m.pageScrollWidth });
  // container-editorial: max-w-6xl (1152px) centred, 80px side padding from md, 16–24px on phones
  const gutter = mobile ? 25 : Math.max((m.vw - 1152) / 2, 0) + 81;
  check(`${t} logo at the left edge, buttons at the right edge (no awkward gap)`, m.logo.left <= gutter && (mobile ? m.menu : m.signup).right >= m.vw - gutter - 1, { logo: m.logo, signup: m.signup, menu: m.menu, vw: m.vw });

  if (width === 360) {
    await page.click('button[aria-label="Open menu"]');
    const menu = page.locator('[role="dialog"][aria-label="Menu"]');
    await menu.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
    const links = await menu.locator("nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    check(`${t} hamburger opens the secondary menu (Discover, About, Help, Support)`, (await menu.isVisible()) && ["/discover", "/about", "/help", "/support"].every((h) => links.includes(h)), links);
    check(`${t} page behind the menu can't scroll`, (await page.evaluate(() => document.body.style.overflow)) === "hidden");
    await page.keyboard.press("Escape");
    check(`${t} Escape closes the menu`, !(await menu.isVisible().catch(() => false)));
    await page.click('button[aria-label="Open menu"]');
    await page.click('button[aria-label="Close menu"]');
    check(`${t} × closes the menu and restores scrolling`, !(await menu.isVisible().catch(() => false)) && (await page.evaluate(() => document.body.style.overflow)) === "");
  }
  if (width === 390 || width === 1440) {
    const hero = await page.evaluate(() => {
      const section = document.querySelector("main section, section");
      return [...section.querySelectorAll("a")].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href") }));
    });
    check(`${t} hero: "Explore Designers" → /discover, no "I'm a Designer"`, hero.some((a) => a.text === "Explore Designers" && a.href === "/discover") && !hero.some((a) => /I'm a Designer/.test(a.text)), hero);
  }
  await ctx.close();
}

console.log("\nButtons reach the existing pages (phone, 360px)");
{
  const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/`, { waitUntil: "networkidle" });
  await Promise.all([page.waitForURL((u) => u.pathname === "/login", { timeout: 60000 }), page.locator("header a", { hasText: "Log In" }).first().click()]);
  await page.waitForLoadState("networkidle");
  check("Log In → existing /login page with the sign-in form", (await page.locator("#email").count()) === 1 && (await page.locator("#password").count()) === 1);
  await page.goto(`${APP_URL}/`, { waitUntil: "networkidle" });
  await Promise.all([page.waitForURL((u) => u.pathname === "/create-account", { timeout: 60000 }), page.locator("header a", { hasText: "Sign Up" }).first().click()]);
  await page.waitForLoadState("networkidle");
  check("Sign Up → existing /create-account registration form", (await page.locator("#confirmPassword").count()) === 1);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
