// HRUNA — end-to-end authentication flows: signup confirmation, signup retry, login by role, password
// recovery, email change, broken links, and session/role safety. Exercises the real app + real local
// Supabase Auth + Mailpit, for BOTH email-link shapes:
//   • the repo's token_hash templates (supabase/templates/*.html → /auth/confirm?token_hash=…&type=…)
//   • Supabase's DEFAULT templates ({{ .ConfirmationURL }} → <auth>/verify?token=…&redirect_to=… → ?code=),
//     rebuilt here from the emailed token hash exactly as the default template would build them.
//
// Only creates fresh accounts (it never renames or edits the seeded ones), so it can run before or
// after the other suites. Prereqs: the local stack + the app on HRUNA_TEST_APP_URL started against it,
// and the env vars in scripts/lib/test-auth.mjs. Optional: HRUNA_TEST_DB_CONTAINER (local DB container
// used for read-only account counts; default supabase_db_lilirve-app).
// Run with: node scripts/test-auth-flows.mjs

import { spawnSync } from "node:child_process";
import { APP_URL, SUPABASE_URL, MAILPIT_URL, FRESH_PASSWORD, assertLocalTestEnvironment, cookiesFrom, seedPassword } from "./lib/test-auth.mjs";

const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unique = (tag) => `authflow-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;

// ---------- small HTTP helpers (each "browser" is just a cookie string) ----------
const merge = (jar, res) => {
  const map = new Map((jar ? jar.split("; ") : []).filter(Boolean).map((p) => [p.slice(0, p.indexOf("=")), p]));
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0];
    const name = pair.slice(0, pair.indexOf("="));
    if (/max-age=0/i.test(raw) || pair.endsWith("=")) map.delete(name);
    else map.set(name, pair);
  }
  return [...map.values()].join("; ");
};
// Session cookies a response WRITES (a deletion — empty value / Max-Age=0, e.g. middleware clearing a
// revoked session — doesn't count as signing anyone in).
const sessionCookieNames = (res) =>
  (res.headers.getSetCookie?.() ?? [])
    .filter((c) => !/max-age=0/i.test(c) && !/^[^=]+=;/.test(c) && !/^[^=]+=$/.test(c.split(";")[0]))
    .map((c) => c.split("=")[0])
    .filter((n) => /^sb-.*-auth-token(\.\d+)?$/.test(n));
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { res, status: res.status, data: await res.json().catch(() => ({})) };
}
const session = async (cookie) => (await api("/api/auth/session", { cookie })).data;
async function visit(url, cookie) {
  const res = await fetch(url.startsWith("http") ? url : `${APP_URL}${url}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { res, status: res.status, location: res.headers.get("location") ?? "" };
}
const signup = (email, cookie, password = FRESH_PASSWORD) =>
  api("/api/auth/signup", { method: "POST", cookie, body: { name: "Flow Test", email, password, confirmPassword: password } });
const login = (email, password) => api("/api/auth/login", { method: "POST", body: { email, password } });
function dbCount(sql) {
  const r = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA"], {
    input: `BEGIN READ ONLY; ${sql}; ROLLBACK;`,
    encoding: "utf8",
  });
  return Number((r.stdout ?? "").trim().split("\n").filter(Boolean).pop());
}
/** A single text value from a read-only query (e.g. a row fingerprint). */
function dbValue(sql) {
  const r = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA"], {
    input: `BEGIN READ ONLY; ${sql}; ROLLBACK;`,
    encoding: "utf8",
  });
  return (r.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
}
const authUsersWithEmail = (email) => dbCount(`SELECT count(*) FROM auth.users WHERE lower(email) = lower('${email.replace(/'/g, "''")}')`);

// ---------- Mailpit ----------
/** The newest email to `to` whose subject contains `subject` and arrived after `since`: { tokenHash, href }. */
async function mailFor(to, subject, since) {
  for (let i = 0; i < 40; i++) {
    // /api/v1/search (the /messages listing ignores `query`), and the recipient is checked exactly.
    const list = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=20`)).json();
    const m = (list.messages ?? []).find(
      (x) => x.To?.some((t) => t.Address.toLowerCase() === to.toLowerCase()) && x.Subject.includes(subject) && Date.parse(x.Created) >= since - 2000
    );
    if (m) {
      const full = await (await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)).json();
      const href = [...(full.HTML ?? "").matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&")).find((h) => h.includes("token_hash="));
      if (href) {
        const u = new URL(href);
        // Templates link to Supabase's SiteURL; the app under test is on APP_URL.
        return { tokenHash: u.searchParams.get("token_hash"), href: `${APP_URL}${u.pathname}${u.search}` };
      }
    }
    await sleep(300);
  }
  throw new Error(`no "${subject}" email for ${to}`);
}
/** The link Supabase's DEFAULT template would send for the same token: <auth>/verify → redirect_to?code=… */
const defaultTemplateLink = (tokenHash, type, redirectTo) =>
  `${SUPABASE_URL}/auth/v1/verify?token=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`;
const SUBJECT = { signup: "Confirm your HRUNA account", recovery: "Reset your HRUNA password", emailChange: "email change" };

/** Registers + confirms a fresh account (token_hash link, its own browser); returns { email, cookie }. */
async function freshAccount(tag) {
  const email = unique(tag);
  const since = Date.now();
  const s = await signup(email);
  if (s.status !== 200) throw new Error(`signup ${email}: ${s.status} ${JSON.stringify(s.data)}`);
  const { href } = await mailFor(email, SUBJECT.signup, since);
  const c = await visit(href);
  if (!c.location.includes("/choose-role")) throw new Error(`confirm ${email}: ${c.status} ${c.location}`);
  return { email, cookie: merge("", c.res) };
}

let browser = null;
async function main() {
  await assertLocalTestEnvironment();
  try {
    browser = await (await import("playwright")).chromium.launch();
  } catch {
    console.log("  \x1b[33m!\x1b[0m playwright/Chromium unavailable — browser-rendered checks are SKIPPED");
  }
  const page = async (cookie) => {
    const context = await browser.newContext();
    if (cookie) await context.addCookies(cookie.split("; ").filter(Boolean).map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    return { context, page: await context.newPage() };
  };
  const appHost = new URL(APP_URL).host;

  console.log("\n=== 1. Signup → email confirmation → role selection ===");
  {
    const email = unique("signup");
    const since = Date.now();
    const s = await signup(email);
    check("1a. Signup accepted (200), confirmation required (no session cookie)", s.status === 200 && sessionCookieNames(s.res).length === 0, s.data);
    check("1b. Exactly one auth account, not yet confirmed", authUsersWithEmail(email) === 1 && dbCount(`SELECT count(*) FROM auth.users WHERE email='${email}' AND email_confirmed_at IS NULL`) === 1);
    const before = await login(email, FRESH_PASSWORD);
    check("1c. Sign-in before confirming is refused with 'verify your email'", before.status === 400 && /verify your email/i.test(before.data.message ?? ""), before.data);
    const { href, tokenHash } = await mailFor(email, SUBJECT.signup, since);
    check("1d. The emailed link is a SIGNUP link (type=signup), not an email-change link", href.includes("type=signup") && !href.includes("email_change"), href);
    const c = await visit(href);
    check("1e. Confirming → /choose-role?confirmed=signup (never /account/email or /setup-password)", c.status === 307 && c.location.endsWith("/choose-role?confirmed=signup") && !c.location.includes("/account/email"), c.location);
    check("1f. …on the same host the link was opened on (cookies survive the redirect)", new URL(c.location).host === appHost, c.location);
    const cookie = merge("", c.res);
    const me = await session(cookie);
    check("1g. Signed in as the new account: same email, no role yet, not admin", me.authenticated && me.email === email && !me.hasCustomerProfile && !me.hasDesignerProfile && !me.isAdmin, me);
    check("1h. Supabase reports the address confirmed", dbCount(`SELECT count(*) FROM auth.users WHERE email='${email}' AND email_confirmed_at IS NOT NULL`) === 1);
    const roleHtml = await (await fetch(`${APP_URL}/choose-role?confirmed=signup`, { headers: { cookie } })).text();
    check("1i. Role selection shows the verified-email success message and both separate choices", roleHtml.includes('data-testid="signup-confirmed"') && roleHtml.includes(email) && roleHtml.includes('data-testid="choose-customer"') && roleHtml.includes('data-testid="choose-designer"'));
    const anonBanner = await (await fetch(`${APP_URL}/choose-role?confirmed=signup`, { redirect: "manual" })).status;
    check("1j. ?confirmed=signup without a session proves nothing (redirected to sign-in)", anonBanner === 307);
    // Customer onboarding keeps the same user id and creates exactly one profile, even if repeated.
    const p1 = await api("/api/profile/customer", { method: "POST", cookie, body: { name: "Flow Customer", city: "Hyderabad" } });
    const p2 = await api("/api/profile/customer", { method: "POST", cookie, body: { name: "Flow Customer", city: "Hyderabad" } });
    const after = await session(cookie);
    check("1k. Choosing Customer creates ONE customer profile for the SAME user id (repeat is idempotent)", p1.status === 200 && p2.status === 200 && after.userId === me.userId && after.hasCustomerProfile && !after.hasDesignerProfile && dbCount(`SELECT count(*) FROM public.customer_profiles WHERE user_id='${me.userId}'`) === 1, { p1: p1.status, p2: p2.status, after });
    const again = await visit("/choose-role", cookie);
    check("1l. Once a role exists, /choose-role sends the account to its own home (no second, unintended role)", again.status === 307 && again.location.endsWith("/home"), again.location);
    const relogin = await login(email, FRESH_PASSWORD);
    check("1m. Login afterwards routes by the real role (customer → /home)", relogin.status === 200 && relogin.data.home === "/home", relogin.data);
    const reused = await visit(href);
    check("1n. Re-using the confirmation link → /verify-email?error=expired (signup-specific message)", reused.location.includes("/verify-email?error=expired"), reused.location);
    check("     …and still no second account", authUsersWithEmail(email) === 1);
    void tokenHash;
  }

  console.log("\n=== 1D. Signup confirmation via Supabase's DEFAULT template (the hosted incident) ===");
  {
    const email = unique("default");
    const since = Date.now();
    const s = await signup(email);
    const jar = merge("", s.res);
    check("1Da. Signup stores the one-time PKCE verifier in the signing-up browser only", s.status === 200 && /code-verifier/.test(jar) && sessionCookieNames(s.res).length === 0);
    const { tokenHash } = await mailFor(email, SUBJECT.signup, since);
    const v = await visit(defaultTemplateLink(tokenHash, "signup", `${APP_URL}/auth/confirm?flow=signup`));
    check("1Db. Supabase /verify returns to /auth/confirm with ?code= AND keeps the flow=signup marker", v.location.includes("/auth/confirm") && v.location.includes("code=") && v.location.includes("flow=signup"), v.location.replace(/code=[^&]+/, "code=…"));
    const c = await visit(v.location, jar);
    check("1Dc. Same browser → /choose-role?confirmed=signup — NOT /account/email (the reported bug)", c.location.endsWith("/choose-role?confirmed=signup") && !c.location.includes("/account/email"), c.location);
    const me = await session(merge(jar, c.res));
    check("1Dd. …signed in as the new account, no role yet", me.email === email && !me.hasCustomerProfile && !me.hasDesignerProfile, me);
    // Legacy: a link emailed before flow markers existed (bare /auth/confirm redirect) is still a signup.
    const email2 = unique("legacy");
    const since2 = Date.now();
    const s2 = await signup(email2);
    const jar2 = merge("", s2.res);
    const { tokenHash: th2 } = await mailFor(email2, SUBJECT.signup, since2);
    const v2 = await visit(defaultTemplateLink(th2, "signup", `${APP_URL}/auth/confirm`));
    const c2 = await visit(v2.location, jar2);
    check("1De. Untagged legacy default-template signup link → role selection, not /account/email", c2.location.endsWith("/choose-role?confirmed=signup"), c2.location);
    // Cross-browser with the default template: the PKCE code can't be exchanged elsewhere.
    const email3 = unique("xbrowser");
    const since3 = Date.now();
    await signup(email3);
    const { tokenHash: th3 } = await mailFor(email3, SUBJECT.signup, since3);
    const v3 = await visit(defaultTemplateLink(th3, "signup", `${APP_URL}/auth/confirm?flow=signup`));
    const c3 = await visit(v3.location); // a different browser: no verifier cookie
    check("1Df. Default-template link in ANOTHER browser → /login?verified=signup", c3.location.includes("/login?verified=signup"), c3.location);
    const after3 = await login(email3, FRESH_PASSWORD);
    check("1Dg. …and, as the message says, the address is already confirmed: signing in works", after3.status === 200 && after3.data.home === "/choose-role", after3.data);
  }

  console.log("\n=== 1E. Redirect not allow-listed → Supabase falls back to the Site URL root (the homepage incident) ===");
  {
    const email = unique("rootfallback");
    const since = Date.now();
    const s = await signup(email);
    const jar = merge("", s.res);
    const { tokenHash } = await mailFor(email, SUBJECT.signup, since);
    // A redirect_to Supabase won't accept (not the Site URL's host, not in the allow-list): exactly what
    // happens when the app's /auth/confirm URL isn't allow-listed in the project's URL Configuration.
    const v = await visit(defaultTemplateLink(tokenHash, "signup", "https://not-allow-listed.example/auth/confirm?flow=signup"));
    const landed = new URL(v.location);
    check("1Ea. Supabase drops the redirect and sends the user to the bare Site URL root with ?code=", landed.pathname === "/" && landed.searchParams.has("code") && !v.location.includes("not-allow-listed"), v.location.replace(/code=[^&]+/, "code=…"));
    const home = await visit(`${APP_URL}/?${landed.searchParams.toString()}`, jar);
    check("1Eb. The homepage forwards the stray code to /auth/confirm (instead of silently dropping it)", home.location.includes("/auth/confirm?code="), home.location.replace(/code=[^&]+/, "code=…"));
    const c = await visit(home.location, jar);
    check("1Ec. …which finishes the signup → /choose-role?confirmed=signup", c.location.endsWith("/choose-role?confirmed=signup"), c.location);
    const me = await session(merge(jar, c.res));
    check("1Ed. …signed in as the new account, no role yet", me.email === email && !me.hasCustomerProfile && !me.hasDesignerProfile, me);
    const plain = await fetch(`${APP_URL}/?utm_source=test`, { redirect: "manual" });
    check("1Ee. An ordinary homepage visit is unaffected (no redirect)", plain.status === 200, plain.status);
  }

  console.log("\n=== 1F. Cross-device verification (sign up on one device, open the email on another) ===");
  {
    // Recommended template (supabase/templates/confirmation.html): token_hash link, verified server-side.
    const email = unique("crossdevice");
    const since = Date.now();
    const s = await signup(email); // device A (laptop): holds only the PKCE verifier cookie
    const deviceA = merge("", s.res);
    const { href } = await mailFor(email, SUBJECT.signup, since);
    check("1Fa. The emailed link is a token_hash link to /auth/confirm (no browser-bound PKCE code)", href.includes("/auth/confirm?") && href.includes("token_hash=") && !href.includes("code="), href.replace(/token_hash=[^&]+/, "token_hash=…"));
    const phone = await visit(href); // device B (phone): no cookies at all
    check("1Fb. Opened on ANOTHER device → /choose-role?confirmed=signup", phone.location.endsWith("/choose-role?confirmed=signup"), phone.location);
    const phoneJar = merge("", phone.res);
    const me = await session(phoneJar);
    check("1Fc. …and that device is signed in as the new account, no role yet", me.email === email && !me.hasCustomerProfile && !me.hasDesignerProfile, me);
    const roleHtml = await (await fetch(`${APP_URL}/choose-role?confirmed=signup`, { headers: { cookie: phoneJar } })).text();
    check("1Fd. Role selection on that device shows the verified-email message", roleHtml.includes('data-testid="signup-confirmed"'));
    check("1Fe. Device A (where the account was created) was not needed and holds no session", sessionCookieNames(s.res).length === 0 && !(await session(deviceA)).authenticated);

    const reused = await visit(href);
    check("1Ff. Re-using the link → /verify-email?error=expired", reused.location.includes("/verify-email?error=expired"), reused.location);
    const resendHtml = await (await fetch(`${APP_URL}/verify-email?error=expired`)).text();
    check("1Fg. …which explains it and offers 'Send a new verification email' with an email field", /expired or was already used/.test(resendHtml) && resendHtml.includes("Send a new verification email") && resendHtml.includes('id="resendEmail"'));

    // An expired / already-used link for an account that is NOT yet confirmed → a fresh link that works on any device.
    const pendingEmail = unique("freshlink");
    const t0 = Date.now();
    await signup(pendingEmail);
    const first = await mailFor(pendingEmail, SUBJECT.signup, t0);
    await sleep(2500); // past the local resend throttle
    const t1 = Date.now();
    const resend = await api("/api/auth/resend", { method: "POST", body: { email: pendingEmail } });
    check("1Fh. Requesting a new verification email → 200", resend.status === 200, resend.data);
    const fresh = await mailFor(pendingEmail, SUBJECT.signup, t1);
    check("1Fi. The new email carries a different token_hash link", fresh.href !== first.href && fresh.href.includes("token_hash="));
    const freshVisit = await visit(fresh.href);
    check("1Fj. The fresh link works on another device → /choose-role?confirmed=signup", freshVisit.location.endsWith("/choose-role?confirmed=signup"), freshVisit.location);

    // Unverified account trying to sign in → a machine-readable code the login page turns into a resend link.
    const unverifiedEmail = unique("unverified");
    await signup(unverifiedEmail);
    const blocked = await login(unverifiedEmail, FRESH_PASSWORD);
    check("1Fk. Signing in before verifying → 400 code=email_not_confirmed (login page offers a new link)", blocked.status === 400 && blocked.data.code === "email_not_confirmed", blocked.data);

    // Default template (PKCE ?code=) opened on another device: verified by Supabase, finish by signing in.
    const pkceEmail = unique("pkcephone");
    const t2 = Date.now();
    await signup(pkceEmail);
    const { tokenHash } = await mailFor(pkceEmail, SUBJECT.signup, t2);
    const v = await visit(defaultTemplateLink(tokenHash, "signup", `${APP_URL}/auth/confirm?flow=signup`));
    const onPhone = await visit(v.location); // no verifier cookie on this device
    check("1Fl. PKCE link on another device → /login?verified=signup&next=/choose-role (not the signup form)", onPhone.location.includes("/login?verified=signup") && decodeURIComponent(onPhone.location).includes("next=/choose-role"), onPhone.location);
    const signedIn = await login(pkceEmail, FRESH_PASSWORD);
    check("1Fm. …the address is verified: signing in there works and continues to /choose-role", signedIn.status === 200 && signedIn.data.home === "/choose-role", signedIn.data);
    if (browser) {
      const { context, page: p } = await page();
      await p.goto(`${APP_URL}${new URL(onPhone.location, APP_URL).pathname}${new URL(onPhone.location, APP_URL).search}`, { waitUntil: "networkidle" });
      const notice = await p.locator('[data-testid="verified-notice"]').innerText().catch(() => "");
      check("1Fn. The sign-in page says the email is verified", /email address is verified/i.test(notice), notice);
      await p.fill("#email", pkceEmail);
      await p.fill("#password", FRESH_PASSWORD);
      await Promise.all([p.waitForURL((u) => u.pathname === "/choose-role", { timeout: 30000 }).catch(() => undefined), p.click('button[type="submit"]')]);
      check("1Fo. …and signing in lands on /choose-role", new URL(p.url()).pathname === "/choose-role", p.url());
      await p.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
      await context.clearCookies();
      await p.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
      await p.fill("#email", unverifiedEmail);
      await p.fill("#password", FRESH_PASSWORD);
      await p.click('button[type="submit"]');
      await p.waitForSelector('[data-testid="resend-verification"]', { timeout: 15000 }).catch(() => undefined);
      const resendHref = await p.locator('[data-testid="resend-verification"]').getAttribute("href").catch(() => null);
      check("1Fp. An unverified sign-in shows 'Send a new verification email' (→ /verify-email with the address)", !!resendHref && resendHref.startsWith("/verify-email?error=unverified&email="), resendHref);
      await context.close();
    }
  }

  console.log("\n=== 2. Signup retry with an existing or pending email ===");
  {
    const email = unique("retry");
    const since = Date.now();
    await signup(email);
    const pending = await signup(email);
    check("2a. Retry while PENDING → no new account; explains a confirmation link was already sent", authUsersWithEmail(email) === 1 && (pending.status === 200 || (pending.status === 429 && pending.data.code === "confirmation_pending" && /already sent a confirmation link/i.test(pending.data.message))), pending.data);
    await sleep(2500); // past the local resend throttle
    const pending2 = await signup(email);
    check("2b. Retry while pending after the throttle → 200 (link re-sent), still exactly one account", pending2.status === 200 && authUsersWithEmail(email) === 1, pending2.data);
    const { href } = await mailFor(email, SUBJECT.signup, since);
    await visit(href);
    const confirmed = await signup(email);
    check("2c. Retry after CONFIRMING → 409 email_exists, guiding to sign in or reset the password", confirmed.status === 409 && confirmed.data.code === "email_exists" && /sign in/i.test(confirmed.data.message) && /forgot password/i.test(confirmed.data.message), confirmed.data);
    check("     …and still exactly one account", authUsersWithEmail(email) === 1);
    const seeded = await signup("aanya@lilirve.dev");
    check("2d. An existing customer's email → 409 email_exists (sign in / reset guidance)", seeded.status === 409 && seeded.data.code === "email_exists", seeded.data);
    check("     …and no duplicate account was created", authUsersWithEmail("aanya@lilirve.dev") === 1);
    if (browser) {
      const { context, page: p } = await page(null);
      await p.goto(`${APP_URL}/create-account`, { waitUntil: "networkidle" });
      await p.fill("#name", "Flow Test");
      await p.fill("#email", email);
      await p.fill("#password", FRESH_PASSWORD);
      await p.fill("#confirmPassword", FRESH_PASSWORD);
      await p.check('input[type="checkbox"]');
      await p.click('button[type="submit"]');
      await p.waitForSelector('[data-testid="email-exists-actions"]', { timeout: 15000 }).catch(() => undefined);
      const shown = await p.locator('[data-testid="email-exists-actions"]').count();
      const links = shown ? await p.locator('[data-testid="email-exists-actions"] a').evaluateAll((as) => as.map((a) => a.getAttribute("href"))) : [];
      check("2e. The signup form offers Sign in and Reset password for an existing email", shown === 1 && links.includes("/login") && links.includes("/forgot-password"), links);
      await context.close();
    }
  }

  console.log("\n=== 3. Login for Customer, Designer and Admin ===");
  {
    const customer = await login("aanya@lilirve.dev", seedPassword());
    check("3a. Customer → home /home, no forced redirect", customer.status === 200 && customer.data.home === "/home" && customer.data.redirectTo === null, customer.data);
    const designer = await login("ramesh@lilirve.dev", seedPassword());
    check("3b. Designer → home /designer/home", designer.status === 200 && designer.data.home === "/designer/home", designer.data);
    const admin = await login("admin@lilirve.dev", seedPassword());
    check("3c. Admin → forced /admin", admin.status === 200 && admin.data.redirectTo === "/admin" && admin.data.home === "/admin", admin.data);
    const wrong = await login("aanya@lilirve.dev", "Definitely-wrong-1");
    check("3d. Wrong password → 400, no session", wrong.status === 400 && sessionCookieNames(wrong.res).length === 0, wrong.data);
    const adminCookie = merge("", admin.res);
    const adminRole = await visit("/choose-role", adminCookie);
    check("3e. Admin can't reach role selection (kept as its own role)", adminRole.status === 307 && adminRole.location.endsWith("/admin"), adminRole.location);
  }

  console.log("\n=== 4. Forgot password → recovery link → password reset ===");
  {
    const acct = await freshAccount("recover");
    await api("/api/profile/customer", { method: "POST", cookie: acct.cookie, body: { name: "Recover Me", city: "Pune" } });
    const before = await session(acct.cookie);
    const NEWPASS = `Reset2-${Date.now()}`;
    const since = Date.now();
    const req = await api("/api/auth/forgot-password", { method: "POST", body: { email: acct.email } });
    check("4a. Forgot password → generic success (no account enumeration)", req.status === 200 && /if an account exists/i.test(req.data.message ?? ""), req.data);
    const unknown = await api("/api/auth/forgot-password", { method: "POST", body: { email: unique("nobody") } });
    check("4b. Unknown email gets the SAME response", unknown.status === 200 && unknown.data.message === req.data.message, unknown.data);
    const { href, tokenHash } = await mailFor(acct.email, SUBJECT.recovery, since);
    check("4c. The emailed link is a RECOVERY link", href.includes("type=recovery"), href);
    const mismatch = await visit(`/auth/confirm?flow=signup&token_hash=${tokenHash}&type=recovery`);
    check("4d. Same token presented as a signup (flow/type mismatch) → /auth/link-error?reason=mismatch", mismatch.location.includes("/auth/link-error?reason=mismatch"), mismatch.location);
    const c = await visit(href);
    check("4e. Recovery link → /reset-password with the token forwarded UNCONSUMED (mismatch didn't burn it)", c.location.includes("/reset-password?token_hash=") && sessionCookieNames(c.res).length === 0, c.location);
    if (browser) {
      const { context, page: p } = await page(null); // opened in a different browser than the request
      await p.goto(c.location, { waitUntil: "networkidle" });
      // The page verifies the link itself after hydrating; wait for its outcome (form or error).
      await p.waitForSelector('#password, [role="alert"]', { timeout: 30000 }).catch(() => undefined);
      const ready = (await p.locator("#password").count()) === 1;
      check("4f. /reset-password verifies the link and shows the new-password form (cross-browser)", ready, await p.locator("body").innerText().catch(() => ""));
      if (ready) {
        await p.fill("#password", NEWPASS);
        await p.fill("#confirmPassword", NEWPASS);
        await p.click('button[type="submit"]');
        await p.waitForSelector("text=Password updated", { timeout: 15000 }).catch(() => undefined);
        check("4g. Password reset succeeds", (await p.locator("text=Password updated").count()) > 0, await p.locator("body").innerText());
      }
      await context.close();
      const oldPw = await login(acct.email, FRESH_PASSWORD);
      const newPw = await login(acct.email, NEWPASS);
      check("4h. Old password no longer works; new one does", oldPw.status === 400 && newPw.status === 200, { old: oldPw.status, new: newPw.status });
      const after = await session(merge("", newPw.res));
      check("4i. Same user id, same email, same role after the reset", after.userId === before.userId && after.email === acct.email && after.hasCustomerProfile && !after.hasDesignerProfile && !after.isAdmin, { before, after });
      const reuse = await visit(c.location);
      const { context: c2, page: p2 } = await page(null);
      await p2.goto(c.location, { waitUntil: "networkidle" });
      await p2.waitForSelector('#password, [role="alert"]', { timeout: 30000 }).catch(() => undefined);
      check("4j. Re-using the recovery link → 'expired or already used', with a way to request a new one", (await p2.locator("text=expired or has already been used").count()) > 0 && (await p2.locator('a[href="/forgot-password"]').count()) > 0);
      await c2.close();
      void reuse;

      // Default template: Supabase verifies, then /reset-password?code=… (PKCE, same browser only).
      const since2 = Date.now();
      const req2 = await api("/api/auth/forgot-password", { method: "POST", body: { email: acct.email } });
      const verifierJar = merge("", req2.res);
      const { tokenHash: th2 } = await mailFor(acct.email, SUBJECT.recovery, since2);
      const NEWPASS2 = `Reset3-${Date.now()}`;
      const { context: c3, page: p3 } = await page(verifierJar);
      await p3.goto(defaultTemplateLink(th2, "recovery", `${APP_URL}/reset-password`), { waitUntil: "networkidle" });
      await p3.waitForSelector('#password, [role="alert"]', { timeout: 30000 }).catch(() => undefined);
      const ready2 = (await p3.locator("#password").count()) === 1;
      check("4k. Default-template recovery link (same browser) → reset form", ready2, await p3.locator("body").innerText().catch(() => ""));
      if (ready2) {
        await p3.fill("#password", NEWPASS2);
        await p3.fill("#confirmPassword", NEWPASS2);
        await p3.click('button[type="submit"]');
        await p3.waitForSelector("text=Password updated", { timeout: 15000 }).catch(() => undefined);
      }
      await c3.close();
      check("4l. …and the reset takes effect", (await login(acct.email, NEWPASS2)).status === 200);
    }
    const urlErr = await visit("/auth/confirm?flow=recovery&error=access_denied&error_code=otp_expired");
    check("4m. A recovery error forwarded by Supabase → /reset-password (never a signup/email page)", urlErr.location.includes("/reset-password?error_code=otp_expired"), urlErr.location);
  }

  console.log("\n=== 5. Change email → both confirmations → updated verified email ===");
  {
    const acct = await freshAccount("change");
    await api("/api/profile/customer", { method: "POST", cookie: acct.cookie, body: { name: "Change Me", city: "Delhi" } });
    const before = await session(acct.cookie);
    const NEW = unique("changed");
    const anon = await api("/api/auth/email", { method: "POST", body: { email: NEW } });
    check("5a. Changing email requires being signed in (401 otherwise)", anon.status === 401);
    const since = Date.now();
    const req = await api("/api/auth/email", { method: "POST", cookie: acct.cookie, body: { email: NEW } });
    check("5b. Request accepted; shown as pending; current email unchanged", req.status === 200 && req.data.pendingEmail === NEW && req.data.currentEmail === acct.email, req.data);
    const oldMail = await mailFor(acct.email, SUBJECT.emailChange, since);
    const newMail = await mailFor(NEW, SUBJECT.emailChange, since);
    check("5c. Confirmation links went to BOTH addresses, as email-change links", oldMail.href.includes("type=email_change") && newMail.href.includes("type=email_change"));
    const first = await visit(oldMail.href, acct.cookie);
    check("5d. First link → /account/email?status=confirm-other (not done yet)", first.location.includes("/account/email?status=confirm-other"), first.location);
    check("     …sign-in still uses the old address", (await login(acct.email, FRESH_PASSWORD)).status === 200 && (await login(NEW, FRESH_PASSWORD)).status !== 200);
    const second = await visit(newMail.href, acct.cookie);
    check("5e. Second link → /account/email?status=changed", second.location.includes("/account/email?status=changed"), second.location);
    const cookie = merge(acct.cookie, second.res);
    const after = await session(cookie);
    check("5f. Same user id, email now the new address, no pending change, same role", after.userId === before.userId && after.email === NEW && !after.pendingEmail && after.hasCustomerProfile && !after.isAdmin, { before, after });
    check("5g. Password unchanged: the NEW address signs in with the SAME password; old address doesn't", (await login(NEW, FRESH_PASSWORD)).status === 200 && (await login(acct.email, FRESH_PASSWORD)).status !== 200);
    check("5h. Still exactly one customer profile for that user", dbCount(`SELECT count(*) FROM public.customer_profiles WHERE user_id='${before.userId}'`) === 1);
    if (browser) {
      const { context, page: p } = await page(cookie);
      await p.goto(`${APP_URL}/account/email?status=changed`, { waitUntil: "networkidle" });
      const text = await p.locator("body").innerText();
      check("5i. Account settings show the new, verified email", text.includes("Email address updated and verified successfully.") && text.includes(NEW), text.slice(0, 300));
      await context.close();
    }
    const reuse = await visit(newMail.href);
    check("5j. Re-using an email-change link → /account/email?status=expired|invalid (not a signup page)", /\/account\/email\?status=(expired|invalid)/.test(reuse.location), reuse.location);

    // Default template for email change, completed in the browser that requested it.
    const NEW2 = unique("changed2");
    const since2 = Date.now();
    const req2 = await api("/api/auth/email", { method: "POST", cookie, body: { email: NEW2 } });
    const jar2 = merge(cookie, req2.res);
    const m1 = await mailFor(NEW, SUBJECT.emailChange, since2);
    const m2 = await mailFor(NEW2, SUBJECT.emailChange, since2);
    const redirect = `${APP_URL}/auth/confirm?flow=email_change`;
    const d1 = await visit(defaultTemplateLink(m1.tokenHash, "email_change", redirect));
    const l1 = d1.location.includes("/auth/confirm") ? (await visit(d1.location, jar2)).location : d1.location;
    const d2 = await visit(defaultTemplateLink(m2.tokenHash, "email_change", redirect));
    const l2res = d2.location.includes("/auth/confirm") ? await visit(d2.location, jar2) : null;
    const l2 = l2res ? l2res.location : d2.location;
    check("5k. Default-template email change: first link → confirm-other, second → changed (never a signup page)", l1.includes("/account/email?status=confirm-other") && l2.includes("/account/email?status=changed") && !l1.includes("create-account") && !l2.includes("create-account"), { l1, l2 });
    const final = await login(NEW2, FRESH_PASSWORD);
    check("5l. …the account now signs in as the second new address, same user id", final.status === 200 && (await session(merge("", final.res))).userId === before.userId);
  }

  console.log("\n=== 6. Invalid, expired, reused, mismatched and cross-browser links ===");
  {
    const loc = async (q, cookie) => (await visit(`/auth/confirm${q}`, cookie)).location;
    check("6a. Bogus signup token → /verify-email with a signup error (and a way to get a new link)", /\/verify-email\?error=(expired|invalid-link)$/.test(await loc("?flow=signup&token_hash=nope&type=signup")));
    check("6b. No parameters → /verify-email?error=invalid-link", (await loc("")).includes("/verify-email?error=invalid-link"));
    check("6c. Supabase-reported expiry on a signup link → /verify-email?error=expired", (await loc("?flow=signup&error=access_denied&error_code=otp_expired")).includes("/verify-email?error=expired"));
    const bogusChange = await loc("?flow=email_change&token_hash=nope&type=email_change");
    check("6d. Bogus email-change token → /account/email?status=expired|invalid (not a signup page)", /\/account\/email\?status=(expired|invalid)$/.test(bogusChange), bogusChange);
    check("6e. Email-change ?code= in another browser → /account/email?status=different-browser", (await loc("?flow=email_change&code=00000000-0000-0000-0000-000000000000")).includes("/account/email?status=different-browser"));
    check("6f. Signup ?code= in another browser → /login?verified=signup", (await loc("?flow=signup&code=00000000-0000-0000-0000-000000000000")).includes("/login?verified=signup"));
    check("6g. Unknown flow → /auth/link-error?reason=unknown", (await loc("?flow=admin&token_hash=x&type=signup")).includes("/auth/link-error?reason=unknown"));
    check("6h. Unsupported token type → /auth/link-error?reason=unknown", (await loc("?token_hash=x&type=magiclink")).includes("/auth/link-error?reason=unknown"));
    check("6i. Email-change marker on a signup token → /auth/link-error?reason=mismatch", (await loc("?flow=email_change&token_hash=x&type=signup")).includes("/auth/link-error?reason=mismatch"));
    check("6j. Legacy ?type=email_change tag still lands on /account/email", (await loc("?type=email_change&error=access_denied&error_code=otp_expired")).includes("/account/email?status=expired"));
    const linkErr = await (await fetch(`${APP_URL}/auth/link-error?reason=mismatch`)).text();
    check("6k. /auth/link-error explains and offers sign in / create account / reset password", /details don.*t match/.test(linkErr) && linkErr.includes('href="/login"') && linkErr.includes('href="/create-account"') && linkErr.includes('href="/forgot-password"'));
    const anyErr = await (await fetch(`${APP_URL}/auth/link-error?reason=%3Cscript%3E`)).text();
    // (Next's own <script> tags are expected in the HTML; the point is the reason isn't rendered as content.)
    check("6l. Unknown reasons render the generic message only (no reflected input)", !anyErr.includes("&lt;script&gt;") && anyErr.includes('role="alert">This link isn&#x27;t a valid HRUNA email link'));
    if (browser) {
      const { context, page: p } = await page(null);
      await p.goto(`${APP_URL}/auth/confirm?flow=signup#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: "networkidle" });
      const text = await p.locator("body").innerText();
      check("6m. Default-template expired signup link (#fragment error) → /verify-email 'expired' message + new-link action", p.url().includes("/verify-email") && text.includes("expired or was already used") && text.includes("Send a new verification email"), `${p.url()} ${text.slice(0, 200)}`);
      await context.close();
    }
  }

  console.log("\n=== 7. Sessions: no account switching, no duplicate accounts ===");
  {
    const adminLogin = await login("admin@lilirve.dev", seedPassword());
    const adminCookie = merge("", adminLogin.res);
    const adminBefore = await session(adminCookie);
    const email = unique("byadmin");
    const since = Date.now();
    const created = await signup(email, adminCookie);
    check("7a. Admin signed in can register a new account; no session cookie is set", created.status === 200 && sessionCookieNames(created.res).length === 0, created.data);
    check("7b. Admin session intact after signup", (await session(adminCookie)).userId === adminBefore.userId);
    const { href } = await mailFor(email, SUBJECT.signup, since);
    const inAdminBrowser = await visit(href, adminCookie);
    check("7c. New user's link opened in the ADMIN's browser → the account-switch step (link held, not used)", inAdminBrowser.location.includes("/auth/switch-account?") && inAdminBrowser.location.includes("type=signup"), inAdminBrowser.location);
    check("7d. …and no session cookie was written (admin session not replaced)", sessionCookieNames(inAdminBrowser.res).length === 0, sessionCookieNames(inAdminBrowser.res));
    const adminAfter = await session(adminCookie);
    check("7e. Admin is still the admin (same id, isAdmin, can open /admin)", adminAfter.userId === adminBefore.userId && adminAfter.isAdmin === true && (await visit("/admin", adminCookie)).status === 200, adminAfter);
    const page7 = await (await fetch(new URL(inAdminBrowser.location, APP_URL), { headers: { cookie: adminCookie } })).text();
    check("7f. The switch step names the account signed in here and offers sign-out-and-continue or staying", page7.includes("admin@lilirve.dev") && page7.includes('data-testid="switch-continue"') && page7.includes('href="/admin"'));
    check("7g. Until someone chooses, the new account is still unconfirmed (the one-time link wasn't spent)", (await login(email, FRESH_PASSWORD)).status === 400);
    const ownBrowser = await visit(href); // the new user, in their own browser
    const newLogin = await login(email, FRESH_PASSWORD);
    check("7h. The same link then confirms in the new user's own browser → a separate account, no role", ownBrowser.location.endsWith("/choose-role?confirmed=signup") && newLogin.status === 200 && newLogin.data.home === "/choose-role" && (await session(merge("", newLogin.res))).userId !== adminBefore.userId, { own: ownBrowser.location, login: newLogin.data });
    check("     …exactly one auth account for the new email; admin still the admin", authUsersWithEmail(email) === 1 && (await session(adminCookie)).isAdmin === true);

    // A customer opening their OWN link while signed in as themselves keeps a session for themselves.
    const acct = await freshAccount("own");
    const me = await session(acct.cookie);
    const NEW = unique("own-new");
    const since2 = Date.now();
    await api("/api/auth/email", { method: "POST", cookie: acct.cookie, body: { email: NEW } });
    const a = await mailFor(acct.email, SUBJECT.emailChange, since2);
    const b = await mailFor(NEW, SUBJECT.emailChange, since2);
    await visit(a.href, acct.cookie);
    const own = await visit(b.href, acct.cookie);
    const ownAfter = await session(merge(acct.cookie, own.res));
    check("7i. Own email-change link in own signed-in browser → session stays the same user (now the new email)", own.location.includes("/account/email?status=changed") && ownAfter.userId === me.userId && ownAfter.email === NEW, { loc: own.location, ownAfter });

    // Someone ELSE's email-change link opened in a signed-in browser doesn't switch accounts either.
    const other = await freshAccount("other");
    const otherMe = await session(other.cookie);
    const NEW3 = unique("other-new");
    const since3 = Date.now();
    await api("/api/auth/email", { method: "POST", cookie: other.cookie, body: { email: NEW3 } });
    const o1 = await mailFor(other.email, SUBJECT.emailChange, since3);
    const o2 = await mailFor(NEW3, SUBJECT.emailChange, since3);
    await visit(o1.href);
    const cross = await visit(o2.href, adminCookie);
    check("7j. Another account's final email-change link in the admin's browser → other-session, admin kept", cross.location.includes("reason=other-session&flow=email_change") && sessionCookieNames(cross.res).length === 0 && (await session(adminCookie)).userId === adminBefore.userId, cross.location);
    check("7k. …and that change still completed for its own account", (await login(NEW3, FRESH_PASSWORD)).status === 200 && otherMe.userId !== adminBefore.userId);
  }

  console.log("\n=== 8. Designer signed in, then a SEPARATE customer account is created (the reported incident) ===");
  {
    const DESIGNER = "meera@lilirve.dev";
    const origin = new URL(APP_URL).origin;
    const designerLogin = await login(DESIGNER, seedPassword());
    const designerCookie = merge("", designerLogin.res);
    const designerBefore = await session(designerCookie);
    check("8. (setup) a designer is signed in", designerBefore.hasDesignerProfile && !designerBefore.hasCustomerProfile && designerBefore.email === DESIGNER, designerBefore);

    // Up front: /create-account explains the account switch instead of silently showing the form.
    const createHtml = await (await fetch(`${APP_URL}/create-account`, { headers: { cookie: designerCookie } })).text();
    check("8a. /create-account while signed in as the designer → the registration form, with a note naming the signed-in designer (no forced sign-out)", createHtml.includes('data-testid="signed-in-registering"') && createHtml.includes(DESIGNER) && createHtml.includes("(designer)") && createHtml.includes('id="name"'));
    const anonCreate = await (await fetch(`${APP_URL}/create-account`)).text();
    check("8b. /create-account signed out → the normal registration form", anonCreate.includes('id="name"') && !anonCreate.includes('data-testid="account-switch"'));

    // The incident: the customer is registered and the link opened in the designer's browser.
    const CUSTOMER = unique("incident-customer");
    const since = Date.now();
    const reg = await signup(CUSTOMER, designerCookie);
    let jar = merge(designerCookie, reg.res); // the same browser: designer session + the signup's PKCE verifier
    check("8c. Registering the customer doesn't touch the designer session (no session cookie set)", reg.status === 200 && sessionCookieNames(reg.res).length === 0 && (await session(jar)).userId === designerBefore.userId);
    const { href } = await mailFor(CUSTOMER, SUBJECT.signup, since);
    const opened = await visit(href, jar);
    check("8d. Opening the customer's link in the designer's browser → /auth/switch-account (not a dead-end error)", opened.status === 307 && opened.location.includes("/auth/switch-account?") && !opened.location.includes("link-error"), opened.location);
    check("8e. …no cookie written, and the link NOT spent (customer still unconfirmed)", sessionCookieNames(opened.res).length === 0 && dbCount(`SELECT count(*) FROM auth.users WHERE email='${CUSTOMER}' AND email_confirmed_at IS NULL`) === 1);
    const switchUrl = new URL(opened.location, APP_URL);
    const switchHtml = await (await fetch(switchUrl, { headers: { cookie: jar } })).text();
    check("8f. The switch step says a NEW account is being confirmed and who is signed in here", switchHtml.includes("new HRUNA account") && switchHtml.includes(DESIGNER) && switchHtml.includes("(designer)") && switchHtml.includes('href="/designer/home"'));
    const fields = new URLSearchParams([...switchUrl.searchParams].filter(([k]) => ["token_hash", "type", "code", "flow"].includes(k)));

    // The switch POST must be a deliberate, same-origin action.
    const post = (cookie, headers = {}) =>
      fetch(`${APP_URL}/auth/confirm`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", cookie, ...headers }, body: fields.toString() });
    const noOrigin = await post(jar);
    const foreign = await post(jar, { Origin: "https://evil.example" });
    check("8g. Switch POST without an Origin, or from another site → 403; nothing changes", noOrigin.status === 403 && foreign.status === 403 && (await session(jar)).userId === designerBefore.userId && dbCount(`SELECT count(*) FROM auth.users WHERE email='${CUSTOMER}' AND email_confirmed_at IS NULL`) === 1);

    const switched = await post(jar, { Origin: origin });
    const switchedLoc = switched.headers.get("location") ?? "";
    check("8h. 'Sign out and continue' → 303 to /choose-role?confirmed=signup with the NEW account's session", switched.status === 303 && switchedLoc.endsWith("/choose-role?confirmed=signup") && sessionCookieNames(switched).length > 0, switchedLoc);
    const oldDesignerCookie = jar;
    jar = merge(jar, switched);
    const now = await session(jar);
    check("8i. This browser is now the customer account: different user id, no role yet, not the designer", now.email === CUSTOMER && now.userId !== designerBefore.userId && !now.hasDesignerProfile && !now.hasCustomerProfile, now);
    check("8j. The designer's previous session in this browser was revoked (not just hidden)", (await session(oldDesignerCookie)).authenticated === false);
    const roleHtml = await (await fetch(`${APP_URL}/choose-role?confirmed=signup`, { headers: { cookie: jar } })).text();
    check("8k. Role selection greets the customer's verified email", roleHtml.includes('data-testid="signup-confirmed"') && roleHtml.includes(CUSTOMER));
    const prof = await api("/api/profile/customer", { method: "POST", cookie: jar, body: { name: "Incident Customer", city: "Hyderabad" } });
    check("8l. Choosing Customer creates the profile on the CUSTOMER's user id", prof.status === 200 && dbCount(`SELECT count(*) FROM public.customer_profiles WHERE user_id='${now.userId}'`) === 1, prof.data);
    const designerAgain = await login(DESIGNER, seedPassword());
    const designerAfter = await session(merge("", designerAgain.res));
    check("8m. The designer account is untouched: same id, still designer, NO customer profile, home /designer/home", designerAgain.data.home === "/designer/home" && designerAfter.userId === designerBefore.userId && designerAfter.hasDesignerProfile && !designerAfter.hasCustomerProfile && dbCount(`SELECT count(*) FROM public.customer_profiles WHERE user_id='${designerBefore.userId}'`) === 0, designerAfter);
    const replay = await post(oldDesignerCookie, { Origin: origin });
    check("8n. Replaying the switch POST (link already used) → signup 'expired' message, no session written", (replay.headers.get("location") ?? "").includes("/verify-email?error=expired") && sessionCookieNames(replay).length === 0, replay.headers.get("location"));

    // Hosted's default-template shape: the link comes back as ?code=, exchangeable only with the verifier
    // cookie in this browser — the switch must keep it working.
    const dCookie = merge("", (await login(DESIGNER, seedPassword())).res);
    const C2 = unique("incident-pkce");
    const since2 = Date.now();
    const reg2 = await signup(C2, dCookie);
    let jar2 = merge(dCookie, reg2.res);
    const { tokenHash } = await mailFor(C2, SUBJECT.signup, since2);
    const verified = await visit(defaultTemplateLink(tokenHash, "signup", `${APP_URL}/auth/confirm?flow=signup`));
    const held = await visit(verified.location, jar2);
    check("8o. Default-template (?code=) link in the designer's browser → switch step, code not spent", held.location.includes("/auth/switch-account?") && held.location.includes("code="), held.location.replace(/code=[^&]+/, "code=…"));
    const f2 = new URLSearchParams([...new URL(held.location, APP_URL).searchParams].filter(([k]) => ["token_hash", "type", "code", "flow"].includes(k)));
    const sw2 = await fetch(`${APP_URL}/auth/confirm`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: jar2, Origin: origin }, body: f2.toString() });
    jar2 = merge(jar2, sw2);
    const now2 = await session(jar2);
    check("8p. …'Sign out and continue' exchanges the code and signs in the new customer", (sw2.headers.get("location") ?? "").endsWith("/choose-role?confirmed=signup") && now2.email === C2 && now2.userId !== designerBefore.userId, { loc: sw2.headers.get("location"), now2 });

    // "Stay signed in": nothing changes and the link still works later (e.g. in another browser).
    const dCookie3 = merge("", (await login(DESIGNER, seedPassword())).res);
    const C3 = unique("incident-stay");
    const since3 = Date.now();
    await signup(C3, dCookie3);
    const m3 = await mailFor(C3, SUBJECT.signup, since3);
    await visit(m3.href, dCookie3);
    const stillDesigner = await session(dCookie3);
    const later = await visit(m3.href);
    check("8q. 'Stay signed in' keeps the designer; the unused link still confirms later in another browser", stillDesigner.userId === designerBefore.userId && later.location.endsWith("/choose-role?confirmed=signup"), later.location);

    // Normal signup with nobody signed in is unchanged: straight to role selection, no switch step.
    const C4 = unique("plain");
    const since4 = Date.now();
    await signup(C4);
    const m4 = await mailFor(C4, SUBJECT.signup, since4);
    const plain = await visit(m4.href);
    check("8r. Signup with no account signed in → straight to /choose-role?confirmed=signup (no switch step)", plain.location.endsWith("/choose-role?confirmed=signup") && sessionCookieNames(plain.res).length > 0, plain.location);

    // Sign-out clears this browser's session cookies, even when the session is already gone.
    const lo = await fetch(`${APP_URL}/api/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json", cookie: jar2 }, body: JSON.stringify({ scope: "local" }) });
    const cleared = (lo.headers.getSetCookie?.() ?? []).filter((c) => /^sb-.*-auth-token(\.\d+)?=/.test(c) && /max-age=0/i.test(c));
    const afterLogout = merge(jar2, lo);
    check("8s. Sign-out (this browser) → 200, session cookies expired, no longer signed in", lo.status === 200 && cleared.length > 0 && (await session(afterLogout)).authenticated === false, { status: lo.status, cleared: cleared.length });
    const again = await fetch(`${APP_URL}/api/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json", cookie: jar2 }, body: JSON.stringify({ scope: "local" }) });
    check("8t. Signing out with an already-revoked session still succeeds and clears cookies", again.status === 200 && (again.headers.getSetCookie?.() ?? []).some((c) => /^sb-.*-auth-token(\.\d+)?=/.test(c) && /max-age=0/i.test(c)));

    if (browser) {
      // The whole thing in a real browser, through the UI.
      const { context, page: p } = await page(merge("", (await login(DESIGNER, seedPassword())).res));
      await p.goto(`${APP_URL}/create-account`, { waitUntil: "networkidle" });
      const notice = (await p.locator('[data-testid="signed-in-registering"]').count()) === 1 && (await p.locator("#name").count()) === 1;
      await p.click('[data-testid="signout-create"]');
      await p.waitForSelector('[data-testid="signed-in-registering"]', { state: "detached", timeout: 20000 }).catch(() => undefined);
      await p.waitForLoadState("networkidle"); // let the fresh page hydrate before typing into it
      const formShown = (await p.locator("#name").count()) === 1 && (await p.locator('[data-testid="signed-in-registering"]').count()) === 0;
      check("8u. Browser: designer opens Create account → form + signed-in note → optional 'Sign out instead' → plain empty form", notice && formShown);
      const C5 = unique("ui-customer");
      const since5 = Date.now();
      await p.fill("#name", "UI Customer");
      await p.fill("#email", C5);
      await p.fill("#password", FRESH_PASSWORD);
      await p.fill("#confirmPassword", FRESH_PASSWORD);
      await p.check('input[type="checkbox"]');
      await p.click('button[type="submit"]');
      await p.waitForURL(/\/verify-email/, { timeout: 20000 }).catch(() => undefined);
      const m5 = await mailFor(C5, SUBJECT.signup, since5);
      await p.goto(m5.href, { waitUntil: "networkidle" });
      const ui1 = { url: p.url(), banner: await p.locator('[data-testid="signup-confirmed"]').innerText().catch(() => "") };
      check("8v. Browser: the customer's link in the same (now signed-out) browser → role selection, verified customer email", ui1.url.includes("/choose-role?confirmed=signup") && ui1.banner.includes(C5), ui1);
      await p.click('[data-testid="choose-customer"]');
      await p.waitForURL(/\/onboarding/, { timeout: 20000 }).catch(() => undefined);
      check("8w. Browser: choosing Customer opens customer onboarding", p.url().includes("/onboarding") && !p.url().includes("designer-onboarding"), p.url());
      await context.close();

      // Same browser still signed in as the designer when the link is opened → switch → continue.
      const { context: c2, page: p2 } = await page(merge("", (await login(DESIGNER, seedPassword())).res));
      const C6 = unique("ui-switch");
      const since6 = Date.now();
      await signup(C6); // registered elsewhere (token_hash link works in any browser)
      const m6 = await mailFor(C6, SUBJECT.signup, since6);
      await p2.goto(m6.href, { waitUntil: "networkidle" });
      const onSwitch = p2.url().includes("/auth/switch-account") && (await p2.locator('[data-testid="signed-in-email"]').innerText()).includes(DESIGNER);
      await p2.click('[data-testid="switch-continue"]');
      await p2.waitForURL(/\/choose-role/, { timeout: 20000 }).catch(() => undefined);
      const banner = await p2.locator('[data-testid="signup-confirmed"]').innerText().catch(() => "");
      const who = await p2.evaluate(async () => (await (await fetch("/api/auth/session")).json()).email);
      check("8x. Browser: designer opens the link → switch step → 'Sign out and continue' → signed in as the new customer", onSwitch && p2.url().includes("/choose-role?confirmed=signup") && banner.includes(C6) && who === C6, { url: p2.url(), who });
      await c2.close();
    }
  }

  console.log("\n=== 8B. Creating a separate account (different email) while signed in — no sign-out needed ===");
  if (browser) {
    const DESIGNER = "meera@lilirve.dev";
    const designerJar = merge("", (await login(DESIGNER, seedPassword())).res);
    const designerId = (await session(designerJar)).userId;
    // Everything that identifies and belongs to the existing account, fingerprinted before/after.
    const fingerprint = () =>
      dbValue(`SELECT md5(concat_ws('|',
        (SELECT email || ':' || coalesce(email_confirmed_at::text, '') FROM auth.users WHERE id = '${designerId}'),
        (SELECT row_to_json(u)::text FROM public.users u WHERE id = '${designerId}'),
        (SELECT row_to_json(d)::text FROM public.designer_profiles d WHERE user_id = '${designerId}'),
        (SELECT count(*)::text FROM public.customer_profiles WHERE user_id = '${designerId}'),
        (SELECT coalesce(string_agg(p.id::text || p.status::text || p.stage::text, ',' ORDER BY p.id), '') FROM public.projects p JOIN public.designer_profiles d ON d.id = p.designer_id WHERE d.user_id = '${designerId}'),
        (SELECT count(*)::text FROM public.collections c JOIN public.designer_profiles d ON d.id = c.designer_id WHERE d.user_id = '${designerId}')))`);
    const before = fingerprint();

    const { context, page: p } = await page(designerJar);
    await p.goto(`${APP_URL}/create-account`, { waitUntil: "networkidle" });
    const note = await p.locator('[data-testid="signed-in-registering"]').innerText().catch(() => "");
    const back = await p.locator('[data-testid="signed-in-registering"] a', { hasText: "Back to my account" }).getAttribute("href").catch(() => null);
    check("8Ba. Signed-in designer sees the registration form + a note: current account stays signed in, use a different email", (await p.locator("#name").count()) === 1 && note.includes(DESIGNER) && /different email/i.test(note) && /stays signed in/i.test(note) && back === "/designer/home", { note, back });

    // Same email as the signed-in account → refused before anything is sent.
    const posts = [];
    p.on("request", (r) => r.url().includes("/api/auth/signup") && posts.push(r.method()));
    await p.fill("#name", "Second Account");
    await p.fill("#email", DESIGNER.toUpperCase());
    await p.fill("#password", FRESH_PASSWORD);
    await p.fill("#confirmPassword", FRESH_PASSWORD);
    await p.check('input[type="checkbox"]');
    await p.click('button[type="submit"]');
    await p.waitForTimeout(500);
    const sameErr = await p.locator("main, body").innerText();
    check("8Bb. Using the signed-in account's own email → clear inline error, nothing sent", /the account you're signed in with/i.test(sameErr) && posts.length === 0 && authUsersWithEmail(DESIGNER) === 1);

    // A different email → normal signup: verification email, no session change here.
    const NEW = unique("second-account");
    const since = Date.now();
    await p.fill("#email", NEW);
    await p.click('button[type="submit"]');
    await p.waitForURL(/\/verify-email/, { timeout: 20000 }).catch(() => undefined);
    check("8Bc. A different email → /verify-email (verification required), exactly one new, unconfirmed account", p.url().includes("/verify-email") && authUsersWithEmail(NEW) === 1 && dbCount(`SELECT count(*) FROM auth.users WHERE email='${NEW}' AND email_confirmed_at IS NULL`) === 1, p.url());
    const still = await p.evaluate(async () => (await (await fetch("/api/auth/session")).json()));
    check("8Bd. This browser is STILL the designer (not replaced): same user id, designer role, same email", still.userId === designerId && still.email === DESIGNER && still.hasDesignerProfile, still);
    check("8Be. The new email was not attached to the existing account (separate auth user)", dbCount(`SELECT count(*) FROM auth.users WHERE email='${NEW}' AND id <> '${designerId}'`) === 1 && dbValue(`SELECT email FROM auth.users WHERE id = '${designerId}'`) === DESIGNER);

    // The new account's link on another device → normal verification + role selection for the NEW account.
    const { href } = await mailFor(NEW, SUBJECT.signup, since);
    const phone = await visit(href);
    const phoneMe = await session(merge("", phone.res));
    check("8Bf. The new account's link on another device → /choose-role?confirmed=signup, signed in as the NEW account with no role", phone.location.endsWith("/choose-role?confirmed=signup") && phoneMe.email === NEW && phoneMe.userId !== designerId && !phoneMe.hasCustomerProfile && !phoneMe.hasDesignerProfile, { loc: phone.location, phoneMe });

    // The original browser and account are untouched throughout.
    await p.goto(`${APP_URL}/designer/home`, { waitUntil: "networkidle" });
    const homeOk = new URL(p.url()).pathname === "/designer/home";
    const after = await p.evaluate(async () => (await (await fetch("/api/auth/session")).json()));
    check("8Bg. Original browser still signed in to the designer account and can open its dashboard", homeOk && after.userId === designerId && after.hasDesignerProfile, { url: p.url(), after });
    check("8Bh. The existing account's data is unchanged (auth email, user row, designer profile/studio, projects, collections, no customer profile added)", fingerprint() === before, { before, after: fingerprint() });

    // Direct API attempt with the existing email (bypassing the form) → refused, account unchanged.
    const direct = await signup(DESIGNER, designerJar);
    check("8Bi. Direct signup request with the signed-in account's email → refused (email_exists), nothing changed", direct.status === 409 && direct.data.code === "email_exists" && fingerprint() === before && authUsersWithEmail(DESIGNER) === 1, direct.data);
    await context.close();
  } else {
    console.log("  ! playwright unavailable — section 8B skipped");
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
