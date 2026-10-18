// HRUNA — show/hide password toggle (components/ui/PasswordInput.tsx), in a real browser.
// Checks on /login, /create-account (password + confirm) and /setup-password: hidden by default,
// the toggle is a labelled type="button", clicking/keyboard toggles text<->password and the
// eye/eye-off icon, the value and caret survive, focus stays in the field, and toggling never
// submits the form. Then a real sign-in with the password made visible.
// Prereqs: the app on HRUNA_TEST_APP_URL (default http://localhost:3100) against a LOCAL stack,
// plus HRUNA_TEST_SEED_PASSWORD (see scripts/lib/test-auth.mjs). Run with: node scripts/test-password-toggle.mjs

const APP_URL = process.env.HRUNA_TEST_APP_URL ?? "http://localhost:3100";
const SEED_PASSWORD = process.env.HRUNA_TEST_SEED_PASSWORD;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP_URL)) {
  console.error("✗ Refusing to run against a non-local app:", APP_URL);
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      ${String(detail).slice(0, 300)}` : ""}`);
  }
}

const { chromium } = await import("playwright");
const browser = await chromium.launch();

async function checkField(page, label, id) {
  const input = page.locator(`#${id}`);
  const button = page.locator(`button[aria-controls="${id}"]`);
  check(`${label}: hidden by default (type=password)`, (await input.getAttribute("type")) === "password");
  check(`${label}: toggle is type="button" labelled "Show password"`, (await button.getAttribute("type")) === "button" && (await button.getAttribute("aria-label")) === "Show password");
  const box = await input.boundingBox();
  const bbox = await button.boundingBox();
  const padRight = await input.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
  check(`${label}: icon sits inside the field on the right, text padded clear of it`, box && bbox && bbox.x > box.x + box.width / 2 && bbox.x + bbox.width <= box.x + box.width + 1 && bbox.y >= box.y - 1 && bbox.y + bbox.height <= box.y + box.height + 1 && padRight >= bbox.width, { box, bbox, padRight });
  const iconBefore = await button.locator("svg").getAttribute("class");

  await input.fill("Secret!234");
  await input.evaluate((el) => el.setSelectionRange(3, 3));
  await button.click();
  await page.waitForTimeout(100); // past the next frame, where Chromium would have reset the caret
  check(`${label}: click shows the password (type=text)`, (await input.getAttribute("type")) === "text");
  check(`${label}: value unchanged`, (await input.inputValue()) === "Secret!234");
  const caret = await input.evaluate((el) => [el.selectionStart, el.selectionEnd, document.activeElement === el]);
  check(`${label}: caret position kept and focus stays in the field`, caret[0] === 3 && caret[1] === 3 && caret[2] === true, JSON.stringify(caret));
  check(`${label}: label → "Hide password", icon switches`, (await button.getAttribute("aria-label")) === "Hide password" && (await button.getAttribute("aria-pressed")) === "true" && (await button.locator("svg").getAttribute("class")) !== iconBefore);
  await page.keyboard.type("X");
  check(`${label}: typing continues at the kept caret`, (await input.inputValue()) === "SecXret!234");

  await button.click();
  check(`${label}: click again hides it`, (await input.getAttribute("type")) === "password" && (await button.getAttribute("aria-label")) === "Show password");

  await button.focus();
  await page.keyboard.press("Enter");
  check(`${label}: keyboard Enter on the toggle shows it`, (await input.getAttribute("type")) === "text");
  await page.keyboard.press("Space");
  check(`${label}: keyboard Space on the toggle hides it`, (await input.getAttribute("type")) === "password");
  check(`${label}: value still intact after keyboard toggles`, (await input.inputValue()) === "SecXret!234");
}

async function formPage(path, fields) {
  const page = await browser.newPage();
  const posts = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
  });
  await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" });
  const url = page.url();
  for (const [label, id] of fields) await checkField(page, label, id);
  await page.waitForTimeout(300);
  check(`${path}: toggling never submitted the form or navigated`, page.url() === url && posts.length === 0, posts.join(", ") || page.url());
  await page.close();
}

console.log("\nLogin");
await formPage("/login", [["login password", "password"]]);
console.log("\nCreate account");
await formPage("/create-account", [["signup password", "password"], ["signup confirm password", "confirmPassword"]]);
console.log("\nSet up / reset password form");
{
  const page = await browser.newPage();
  await page.goto(`${APP_URL}/setup-password`, { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname === "/setup-password" && (await page.locator("#password").count()) === 1) {
    await page.close();
    await formPage("/setup-password", [["new password", "password"], ["confirm password", "confirmPassword"]]);
  } else {
    console.log("  - /setup-password needs a session; covered by the reset flow in test-auth-flows.mjs");
    await page.close();
  }
}

console.log("\nSign in with the password visible");
if (!SEED_PASSWORD) {
  check("HRUNA_TEST_SEED_PASSWORD set", false);
} else {
  const page = await browser.newPage();
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "priya@lilirve.dev");
  await page.fill("#password", SEED_PASSWORD);
  await page.click('button[aria-controls="password"]');
  check("password visible before submit", (await page.getAttribute("#password", "type")) === "text" && (await page.inputValue("#password")) === SEED_PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => undefined), page.click('button[type="submit"]')]);
  check("submitting with the password visible signs in normally", !new URL(page.url()).pathname.startsWith("/login"), page.url());
  await page.close();

  const bad = await browser.newPage();
  await bad.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await bad.fill("#email", "priya@lilirve.dev");
  await bad.fill("#password", "definitely-wrong-1");
  await bad.click('button[aria-controls="password"]');
  await bad.click('button[type="submit"]');
  await bad.waitForTimeout(2500);
  check("a wrong password (visible) is still rejected, and the field keeps its value", new URL(bad.url()).pathname.startsWith("/login") && (await bad.inputValue("#password")) === "definitely-wrong-1");
  await bad.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
