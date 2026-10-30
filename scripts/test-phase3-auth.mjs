// LILIRVE — Phase 3 authentication + authorization test suite.
//
// Exercises the REAL local Supabase Auth (email + password; signup confirmation link via Mailpit) + the real Next.js app
// (middleware route protection + API routes) end to end, against all 8 required personas:
// unauthenticated, customer, designer (generic), approved designer, pending designer,
// rejected designer, suspended designer, admin. Both positive and negative access are checked
// for each, per Phase 3 §22.
//
// Prereqs: `npm run db:start` (or already running) + `npm run db:reset` (fresh seed) +
// the app on :3100 started against the LOCAL stack, plus the env vars listed in
// scripts/lib/test-auth.mjs. Run with: node scripts/test-phase3-auth.mjs

import { APP_URL, signInWithPassword, registerAndConfirm, rawClientFromCookie, seedPassword, confirmationTokenFor, FRESH_PASSWORD, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

await assertLocalTestEnvironment(); // local app + local Supabase only — aborts otherwise

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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Signs in as a seeded account via the real email + password flow (POST /api/auth/login, exactly
 *  as the frontend does) and returns the session cookie header to reuse on subsequent requests. */
const signInAs = (email) => signInWithPassword(email);

async function session(cookie) {
  const res = await fetch(`${APP_URL}/api/auth/session`, {
    headers: cookie ? { cookie } : {},
  });
  return res.json();
}

async function pageStatus(path, cookie) {
  const res = await fetch(`${APP_URL}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") };
}

async function main() {
  console.log("\n=== 1. Unauthenticated visitor ===");
  {
    const s = await session();
    check("GET /api/auth/session -> authenticated:false", s.authenticated === false);

    const pub = await pageStatus("/discover");
    check("GET /discover (public) -> 200, not redirected", pub.status === 200);

    const home = await pageStatus("/home");
    check(
      "GET /home (customer route) -> redirected to /login",
      home.status === 307 && home.location?.includes("/login"),
      `got ${home.status} ${home.location}`
    );

    const admin = await pageStatus("/admin");
    check(
      "GET /admin (admin route) -> redirected to /login",
      admin.status === 307 && admin.location?.includes("/login"),
      `got ${admin.status} ${admin.location}`
    );

    const designer = await pageStatus("/designer/home");
    check(
      "GET /designer/home (designer route) -> redirected to /login",
      designer.status === 307 && designer.location?.includes("/login"),
      `got ${designer.status} ${designer.location}`
    );
  }

  console.log("\n=== 2. Registration + login (fresh account via real signup + emailed confirmation link) ===");
  const freshEmail = `phase3-test-${Date.now()}@lilirve.dev`;
  let freshCookie;
  {
    const fresh = await registerAndConfirm(freshEmail);
    freshCookie = fresh.cookie;
    check("Real signup + email-confirmation link produced a session cookie", freshCookie.length > 0);
    const relogin = await signInWithPassword(freshEmail, fresh.password);
    check("The new account can then sign in with its email + password", relogin.length > 0);

    const s = await session(freshCookie);
    check("New user session -> authenticated:true", s.authenticated === true);
    check("New user -> hasCustomerProfile:false (no auto-created profile)", s.hasCustomerProfile === false);
    check("New user -> hasDesignerProfile:false (no auto-created profile)", s.hasDesignerProfile === false);
    check("New user -> isAdmin:false", s.isAdmin === false);
  }

  console.log("\n=== 3. Profile initialization (own data only) ===");
  {
    const createRes = await fetch(`${APP_URL}/api/profile/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: freshCookie },
      body: JSON.stringify({ name: "Phase 3 Test Customer", city: "Test City" }),
    });
    const created = await createRes.json();
    check("POST /api/profile/customer (own) -> 200", createRes.status === 200, JSON.stringify(created));
    check(
      "Created customer_profiles.user_id matches the authenticated user (not client-supplied)",
      created.customerProfile?.user_id !== undefined
    );

    const s = await session(freshCookie);
    check("After creation -> hasCustomerProfile:true", s.hasCustomerProfile === true);

    const unauthCreate = await fetch(`${APP_URL}/api/profile/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should Fail" }),
    });
    check("POST /api/profile/customer with NO session -> 401", unauthCreate.status === 401);
  }

  console.log("\n=== 4. Seeded personas: session resolution ===");
  const personas = {};
  for (const email of [
    "admin@lilirve.dev",
    "aanya@lilirve.dev", // customer
    "meera@lilirve.dev", // approved designer
    "ramesh@lilirve.dev", // pending designer
    "priya@lilirve.dev", // rejected designer
    "kabir@lilirve.dev", // suspended designer
  ]) {
    const cookie = await signInAs(email);
    personas[email] = cookie;
    const s = await session(cookie);
    console.log(`  ${email}: isAdmin=${s.isAdmin} customer=${s.hasCustomerProfile} designer=${s.hasDesignerProfile} approved=${s.isApprovedDesigner} status=${s.designerOverallStatus}`);
  }

  check("admin@lilirve.dev -> isAdmin:true", (await session(personas["admin@lilirve.dev"])).isAdmin === true);
  check("aanya (customer) -> isAdmin:false", (await session(personas["aanya@lilirve.dev"])).isAdmin === false);
  check("aanya -> hasCustomerProfile:true", (await session(personas["aanya@lilirve.dev"])).hasCustomerProfile === true);
  check("meera -> isApprovedDesigner:true, status=approved", (await session(personas["meera@lilirve.dev"])).isApprovedDesigner === true);
  check("ramesh -> isApprovedDesigner:false, status=pending", (await session(personas["ramesh@lilirve.dev"])).designerOverallStatus === "pending");
  check("priya -> status=rejected", (await session(personas["priya@lilirve.dev"])).designerOverallStatus === "rejected");
  check("kabir -> status=suspended, isApprovedDesigner:false", (await session(personas["kabir@lilirve.dev"])).designerOverallStatus === "suspended" && (await session(personas["kabir@lilirve.dev"])).isApprovedDesigner === false);

  console.log("\n=== 5. Route protection — positive access ===");
  {
    const adminOk = await pageStatus("/admin", personas["admin@lilirve.dev"]);
    check("Admin -> GET /admin -> 200 (allowed)", adminOk.status === 200, `got ${adminOk.status}`);

    const customerOk = await pageStatus("/home", personas["aanya@lilirve.dev"]);
    check("Customer -> GET /home -> 200 (allowed)", customerOk.status === 200, `got ${customerOk.status}`);

    const designerOk = await pageStatus("/designer/home", personas["meera@lilirve.dev"]);
    check("Designer -> GET /designer/home -> 200 (allowed)", designerOk.status === 200, `got ${designerOk.status}`);
  }

  console.log("\n=== 6. Route protection — negative access ===");
  {
    const nonAdmin = await pageStatus("/admin", personas["aanya@lilirve.dev"]);
    check(
      "Non-admin (customer) -> GET /admin -> redirected away, NOT 200",
      nonAdmin.status !== 200,
      `got ${nonAdmin.status} ${nonAdmin.location}`
    );

    const designerAsAdmin = await pageStatus("/admin", personas["meera@lilirve.dev"]);
    check("Designer (non-admin) -> GET /admin -> redirected away", designerAsAdmin.status !== 200);
  }

  console.log("\n=== 7. Authorization: is_admin cannot be self-modified ===");
  {
    // Direct PostgREST call as aanya (customer, non-admin) — bypassing every app route — using a
    // supabase-js client carrying her REAL session (built from her app cookie). The rule under test
    // is the users_is_admin_not_client_settable trigger (supabase/migrations/…_rls.sql).
    const aanyaCookie = personas["aanya@lilirve.dev"];
    const aanyaId = (await session(aanyaCookie)).userId;
    const raw = await rawClientFromCookie(aanyaCookie);

    // Control: an ordinary self-update IS allowed, so a rejection below is specific to is_admin.
    const control = await raw.from("users").update({ display_name: "Aanya (phase3 test)" }).eq("id", aanyaId).select("id");
    check("A customer can update an ordinary field on their own users row (control)", !control.error && control.data?.length === 1, control.error?.message);

    const escalate = await raw.from("users").update({ is_admin: true }).eq("id", aanyaId).select("is_admin");
    check(
      "A customer setting their own is_admin=true directly via PostgREST is rejected",
      !!escalate.error && !(escalate.data ?? []).some((r) => r.is_admin === true),
      escalate.error ? escalate.error.message : `no error — returned ${JSON.stringify(escalate.data)}`
    );

    const after = await raw.from("users").select("is_admin").eq("id", aanyaId).single();
    check("...and is_admin is still false in the database afterwards", after.data?.is_admin === false, after.error?.message ?? after.data);

    const s = await session(aanyaCookie);
    check("...and the app still resolves the customer as isAdmin:false", s.isAdmin === false);

    const adminPage = await pageStatus("/admin", aanyaCookie);
    check("...and /admin still redirects the customer away", adminPage.status !== 200, `got ${adminPage.status} ${adminPage.location}`);
  }

  console.log("\n=== 8. Logout ===");
  {
    const logoutRes = await fetch(`${APP_URL}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: freshCookie },
    });
    check("POST /api/auth/logout -> 200", logoutRes.status === 200);
  }

  // Regression: registering while another account is signed in on this browser (e.g. an admin
  // registering a new user). Registration is ALLOWED, but signUp() runs on an isolated client, so it
  // must never replace or change the current session, and never create a duplicate auth account.
  console.log("\n=== 9. Registering while signed in: allowed, isolated, existing session untouched ===");
  {
    const adminCookie = personas["admin@lilirve.dev"];
    const page = await pageStatus("/create-account", adminCookie);
    check("9a. GET /create-account as a signed-in admin -> 200 (not redirected anywhere)", page.status === 200, `got ${page.status} ${page.location}`);
    const html = await (await fetch(`${APP_URL}/create-account`, { headers: { cookie: adminCookie } })).text();
    const formFields = ['id="name"', 'id="email"', 'id="password"', 'id="confirmPassword"', 'type="submit"', "Create your account"];
    check("9a. ...and it shows the normal registration form", formFields.every((f) => html.includes(f)), formFields.filter((f) => !html.includes(f)).join(", "));
    const login = await pageStatus("/login", adminCookie);
    check("9b. GET /login as a signed-in admin -> 200 (form shown, no redirect)", login.status === 200, `got ${login.status} ${login.location}`);

    const signupAs = (cookie, email, password = FRESH_PASSWORD) =>
      fetch(`${APP_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ name: "New Person", email, password, confirmPassword: password }),
      });
    // Session cookies are sb-<ref>-auth-token / .0 / .1…; only the PKCE …-code-verifier may be set.
    const sessionCookiesSet = (res) =>
      (res.headers.getSetCookie?.() ?? []).map((c) => c.split("=")[0]).filter((n) => /^sb-.*-auth-token/.test(n) && !n.endsWith("-code-verifier"));
    const adminBefore = await session(adminCookie);

    // Admin signed in + UNUSED email → registration proceeds, admin session untouched.
    const newEmail = `admin-registered-${Date.now()}@lilirve.dev`;
    const created = await signupAs(adminCookie, newEmail);
    const createdBody = await created.json();
    check("9c. Admin signed in + unused email -> registration proceeds (200)", created.status === 200 && createdBody.status === "ok", createdBody);
    check("9d. ...and NO session cookie was set (the admin session can't be replaced)", sessionCookiesSet(created).length === 0, sessionCookiesSet(created));
    const adminAfter = await session(adminCookie);
    check("9e. ...and the admin session is intact (same admin user, isAdmin:true)", adminAfter.isAdmin === true && adminAfter.userId === adminBefore.userId && adminAfter.email === "admin@lilirve.dev", adminAfter);
    const adminPage = await pageStatus("/admin", adminCookie);
    check("    ...and the admin can still open /admin", adminPage.status === 200, `got ${adminPage.status} ${adminPage.location}`);
    let tokenHash = null;
    try { tokenHash = await confirmationTokenFor(newEmail); } catch {}
    check("9f. ...and the normal confirmation email was sent to the new address", !!tokenHash);

    // The new user confirms (in their own browser — no cookies) → a separate, non-admin account.
    const confirm = await fetch(`${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(tokenHash ?? "")}&type=signup`, { redirect: "manual" });
    const newCookie = (confirm.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const newSession = await session(newCookie);
    check("9g. Confirming it signs in a NEW, separate, non-admin account", newSession.authenticated === true && newSession.email === newEmail && newSession.isAdmin === false && newSession.userId !== adminBefore.userId, newSession);
    check("    ...with no profile yet (role selection still happens at /choose-role)", newSession.hasCustomerProfile === false && newSession.hasDesignerProfile === false, newSession);
    check("    ...and the admin session is STILL intact afterwards", (await session(adminCookie)).isAdmin === true);

    // Admin signed in + ALREADY-REGISTERED email → refused with sign-in guidance; no duplicate.
    const dup = await signupAs(adminCookie, "aanya@lilirve.dev");
    const dupBody = await dup.json();
    check("9h. Admin signed in + already-registered email (with a profile) -> 409 with sign-in guidance", dup.status === 409 && /already exists/i.test(dupBody.message ?? "") && /sign in/i.test(dupBody.message ?? ""), dupBody);
    const dup2 = await signupAs(adminCookie, newEmail);
    check("9i. Re-registering the just-confirmed email (no profile yet) -> 409, no duplicate auth account", dup2.status === 409, await dup2.json());
    check("    ...and the admin session is still intact after both refusals", (await session(adminCookie)).isAdmin === true);

    // Other signed-in roles get the same isolation; signed-out visitors register normally.
    const aanyaCookie = personas["aanya@lilirve.dev"];
    const custEmail = `customer-registered-${Date.now()}@lilirve.dev`;
    const byCustomer = await signupAs(aanyaCookie, custEmail);
    const aanyaAfter = await session(aanyaCookie);
    check("9j. Customer signed in + unused email -> 200, no session cookie, customer session intact", byCustomer.status === 200 && sessionCookiesSet(byCustomer).length === 0 && aanyaAfter.email === "aanya@lilirve.dev" && aanyaAfter.hasCustomerProfile === true, aanyaAfter);
    const anon = await signupAs(null, `signed-out-${Date.now()}@lilirve.dev`);
    check("9k. Signed-out visitor + unused email -> 200 (normal registration)", anon.status === 200);
  }

  console.log("\n=== 10. Login routes by VERIFIED role ===");
  {
    const loginAs = async (email, password = seedPassword()) => {
      const r = await fetch(`${APP_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      return { ...(await r.json()), httpStatus: r.status }; // httpStatus: the body has its own `status` field
    };
    const admin = await loginAs("admin@lilirve.dev");
    check("10a. Admin login -> redirectTo /admin (forced) and home /admin", admin.httpStatus === 200 && admin.redirectTo === "/admin" && admin.home === "/admin", admin);
    const customer = await loginAs("aanya@lilirve.dev");
    check("10b. Customer login -> no forced redirect, home /home", customer.httpStatus === 200 && customer.redirectTo === null && customer.home === "/home", customer);
    const designer = await loginAs("meera@lilirve.dev");
    check("10c. Designer-only login -> home /designer/home", designer.httpStatus === 200 && designer.redirectTo === null && designer.home === "/designer/home", designer);
    const bad = await loginAs("admin@lilirve.dev", "definitely-wrong-1");
    check("10d. Wrong password -> 400, no redirect info", bad.httpStatus === 400 && bad.redirectTo === undefined && bad.home === undefined, bad);
  }

  console.log("\n=== 11. Normal registration while signed OUT still works, and routes to setup ===");
  {
    const email = `phase3-noprofile-${Date.now()}@lilirve.dev`;
    const fresh = await registerAndConfirm(email);
    check("11a. Signed-out signup + emailed confirmation link still creates a real session", fresh.cookie.length > 0);
    const r = await fetch(`${APP_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: fresh.password }) });
    const body = await r.json();
    check("11b. A new account with no profile yet logs in -> home /choose-role (not admin, not a dashboard)", r.status === 200 && body.redirectTo === null && body.home === "/choose-role", body);
  }

  console.log("\n=== 12. Email-confirmation callback: cross-browser + clear failure messages ===");
  {
    const go = async (query, cookie) => {
      const r = await fetch(`${APP_URL}/auth/confirm${query}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
      return { status: r.status, location: r.headers.get("location") ?? "", cookie: (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ") };
    };
    const pageShows = async (location, text) => (await (await fetch(new URL(location, APP_URL))).text()).includes(text);

    // Browser A (a signed-in admin) registers someone; browser B (fresh: no cookies, no PKCE
    // verifier) opens the emailed token_hash link — the real "new user confirms on their own device" case.
    const email = `cross-browser-${Date.now()}@lilirve.dev`;
    const signup = await fetch(`${APP_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: personas["admin@lilirve.dev"] },
      body: JSON.stringify({ name: "Cross Browser", email, password: FRESH_PASSWORD, confirmPassword: FRESH_PASSWORD }),
    });
    check("12a. (setup) signup from browser A (signed-in admin) -> 200", signup.status === 200);
    const tokenHash = await confirmationTokenFor(email);
    const ok = await go(`?token_hash=${encodeURIComponent(tokenHash)}&type=signup`);
    check("12b. token_hash link opened in a DIFFERENT browser (no cookies/verifier) -> confirmed, straight to role selection", ok.status === 307 && ok.location.endsWith("/choose-role?confirmed=signup") && /sb-[^=]*-auth-token/.test(ok.cookie), ok);
    const nextHop = await pageStatus("/choose-role?confirmed=signup", ok.cookie);
    check("12c. ...role selection opens for the new account (not a dashboard, not a redirect)", nextHop.status === 200, nextHop);
    const s = await session(ok.cookie);
    check("12d. ...signed in as the NEW account, without admin privileges", s.email === email && s.isAdmin === false, s);

    const reused = await go(`?token_hash=${encodeURIComponent(tokenHash)}&type=signup`);
    check("12e. Re-using the same link -> /verify-email?error=expired", reused.location.includes("/verify-email?error=expired"), reused);
    check("     ...and /verify-email explains it and offers a new link", await pageShows(reused.location, "expired or was already used"));
    const bogus = await go("?token_hash=not-a-real-token-hash&type=signup");
    check("12f. An invalid token_hash -> /verify-email with an error", /\/verify-email\?error=(expired|invalid-link)$/.test(bogus.location), bogus.location);
    check("     ...and /verify-email shows how to get a new link", await pageShows(bogus.location, "Send a new verification email"));
    const missing = await go("");
    check("12g. Missing parameters -> /verify-email?error=invalid-link", missing.location.includes("/verify-email?error=invalid-link"), missing);
    check("     ...and /create-account explains it", await pageShows(missing.location, "isn&#x27;t valid") || await pageShows(missing.location, "isn't valid"));
    const supaErr = await go("?error=access_denied&error_code=otp_expired");
    check("12h. A Supabase-reported error in the link -> /verify-email?error=expired", supaErr.location.includes("/verify-email?error=expired"), supaErr);
    const pkce = await go("?code=0f1d2c3b-aaaa-bbbb-cccc-000000000000");
    check("12i. A ?code= (PKCE) link opened without its verifier -> /login?verified=signup", pkce.location.includes("/login?verified=signup"), pkce);
    check("     ...and sign-in continues to role selection (next=/choose-role), no original browser needed", decodeURIComponent(pkce.location).includes("next=/choose-role"), pkce.location);
    const plain = await fetch(`${APP_URL}/create-account?error=toString`);
    check("12j. An unknown ?error= value shows no message (form only)", plain.status === 200 && !(await plain.text()).includes('role="alert"'));
    check("12k. The admin session is untouched throughout", (await session(personas["admin@lilirve.dev"])).isAdmin === true);
  }

  console.log("\n=== 13. Email change — same account, double-confirmed, nothing else touched ===");
  {
    const OLD = "meera@lilirve.dev";
    const NEW = `meera.renamed-${Date.now()}@lilirve.dev`;
    const pageShows = async (location, text) => (await (await fetch(new URL(location, APP_URL))).text()).includes(text);
    const designerCookie = await signInAs(OLD);
    const customerCookie = await signInAs("aanya@lilirve.dev");
    const api = async (cookie, path, options = {}) => {
      const res = await fetch(`${APP_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", cookie, ...(options.headers ?? {}) } });
      return { status: res.status, data: await res.json().catch(() => ({})) };
    };
    // The /account/email result and Designer Profile are client-rendered from the live session, so
    // they are checked in a real browser (playwright, as in test-messages-ui) when it is available.
    let browser = null;
    try {
      browser = await (await import("playwright")).chromium.launch();
    } catch {
      console.log("  [33m![0m playwright/Chromium unavailable — rendered-page checks below are SKIPPED");
    }
    const rendered = async (cookie, path) => {
      const context = await browser.newContext();
      if (cookie) {
        await context.addCookies(cookie.split("; ").map((pair) => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: APP_URL })));
      }
      const page = await context.newPage();
      await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" });
      const result = { text: await page.locator("body").innerText(), hasForm: (await page.locator("#new-email").count()) > 0, url: page.url() };
      await context.close();
      return result;
    };

    // Baseline: the designer's identity, studio and a conversation with messages from both sides.
    const before = await session(designerCookie);
    const studioBefore = (await api(designerCookie, "/api/designer/studio")).data;
    const conv = (await api(customerCookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: "d1000000-0000-0000-0000-000000000001" }) })).data.conversationId;
    await api(customerCookie, `/api/conversations/${conv}/messages`, { method: "POST", body: JSON.stringify({ text: "13: from customer" }) });
    await api(designerCookie, `/api/conversations/${conv}/messages`, { method: "POST", body: JSON.stringify({ text: "13: from designer" }) });
    const msgsBefore = (await api(designerCookie, `/api/conversations/${conv}/messages`)).data.messages ?? [];
    check("13. (setup) designer with studio + a 2-sided conversation", before.hasDesignerProfile && !!studioBefore.designer?.studioName && msgsBefore.length >= 2, { before, n: msgsBefore.length });

    const taken = await api(designerCookie, "/api/auth/email", { method: "POST", body: JSON.stringify({ email: "aanya@lilirve.dev" }) });
    check("13a. An address another account already uses is refused (409) — no merge/overwrite", taken.status === 409, taken.data);
    const same = await api(designerCookie, "/api/auth/email", { method: "POST", body: JSON.stringify({ email: OLD }) });
    check("13b. The current address is refused (400)", same.status === 400, same.data);
    const bad = await api(designerCookie, "/api/auth/email", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) });
    check("13c. A malformed address is refused (400)", bad.status === 400, bad.data);
    const anon = await fetch(`${APP_URL}/api/auth/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: NEW }) });
    check("13d. Signed-out callers are refused (401)", anon.status === 401);

    const sentAt = Date.now();
    const req = await api(designerCookie, "/api/auth/email", { method: "POST", body: JSON.stringify({ email: NEW }) });
    check("13e. Requesting the change succeeds and reports it as pending", req.status === 200 && req.data.pendingEmail === NEW && req.data.currentEmail === OLD, req.data);
    const pending = await session(designerCookie);
    check("13f. Until confirmed: email unchanged, new one shown as pending", pending.email === OLD && pending.pendingEmail === NEW, pending);
    if (browser) {
      const prof = await rendered(designerCookie, "/designer/profile");
      check("13f2. Designer Profile shows the current email and the pending one", prof.text.includes(OLD) && prof.text.includes(`Waiting for confirmation: ${NEW}`), prof.text.slice(0, 400));
      const early = await rendered(designerCookie, "/account/email?status=changed");
      check("13f3. ?status=changed while still pending → 'not complete yet', never success", early.text.includes("isn't complete yet") && !early.text.includes("updated and verified"), early.text.slice(0, 400));
    }

    // Supabase emails BOTH addresses (secure email change). Links use the repo's token_hash template.
    await new Promise((r) => setTimeout(r, 1500));
    const mailpit = process.env.HRUNA_TEST_MAILPIT_URL ?? "http://127.0.0.1:54324";
    const list = await (await fetch(`${mailpit}/api/v1/messages?limit=50`)).json();
    const linkFor = async (address) => {
      const m = list.messages.find((x) => Date.parse(x.Created) >= sentAt - 5000 && x.To.some((t) => t.Address === address) && x.Subject.includes("email change"));
      if (!m) return null;
      const full = await (await fetch(`${mailpit}/api/v1/message/${m.ID}`)).json();
      const href = [...full.HTML.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&")).find((h) => h.includes("/auth/confirm"));
      if (!href) return null;
      const u = new URL(href);
      return `${APP_URL}${u.pathname}${u.search}`; // the template uses SiteURL; the app under test is on APP_URL
    };
    const oldLink = await linkFor(OLD);
    const newLink = await linkFor(NEW);
    check("13g. A confirmation link was emailed to the CURRENT address", !!oldLink && oldLink.includes("type=email_change") && oldLink.includes("token_hash="), oldLink);
    check("13h. …and one to the NEW address", !!newLink && newLink.includes("type=email_change") && newLink.includes("token_hash="), newLink);

    const signInStatus = async (email) => (await fetch(`${APP_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: seedPassword() }) })).status;
    check("13i. Before confirming, sign-in still works with the old address", (await signInStatus(OLD)) === 200);

    // Opened with NO cookies — e.g. on a phone — still works (token_hash, no PKCE verifier needed).
    const first = await fetch(oldLink, { redirect: "manual" });
    check("13j. First link → /account/email?status=confirm-other", (first.headers.get("location") ?? "").includes("/account/email?status=confirm-other"), first.headers.get("location"));
    check("13k. …and the email has NOT switched yet", (await signInStatus(OLD)) === 200 && (await signInStatus(NEW)) !== 200);
    const second = await fetch(newLink, { redirect: "manual" });
    check("13l. Second link → /account/email?status=changed", (second.headers.get("location") ?? "").includes("/account/email?status=changed"), second.headers.get("location"));
    const reuse = await fetch(newLink, { redirect: "manual" });
    check("13m. Re-using a link → expired/invalid, not a signup page", /\/account\/email\?status=(expired|invalid)/.test(reuse.headers.get("location") ?? ""), reuse.headers.get("location"));

    check("13n. Sign-in now works with the NEW address", (await signInStatus(NEW)) === 200);
    check("13o. …and no longer with the old one", (await signInStatus(OLD)) !== 200);

    const afterCookie = await signInAs(NEW);
    const after = await session(afterCookie);
    check("13p. Same user id, same roles (designer, not admin), no pending change left", after.userId === before.userId && after.hasDesignerProfile === before.hasDesignerProfile && after.isApprovedDesigner === before.isApprovedDesigner && after.isAdmin === false && after.email === NEW && !after.pendingEmail, { before, after });
    const studioAfter = (await api(afterCookie, "/api/designer/studio")).data;
    check("13q. Designer profile and studio unchanged", studioAfter.designer?.id === studioBefore.designer?.id && studioAfter.designer?.studioName === studioBefore.designer?.studioName, { b: studioBefore.designer?.studioName, a: studioAfter.designer?.studioName });
    const msgsAfter = (await api(afterCookie, `/api/conversations/${conv}/messages`)).data.messages ?? [];
    check("13r. Conversation and message ownership unchanged", JSON.stringify(msgsAfter.map((m) => [m.id, m.senderId])) === JSON.stringify(msgsBefore.map((m) => [m.id, m.senderId])), { msgsBefore, msgsAfter });
    const inbox = (await api(afterCookie, "/api/designer/conversations")).data.conversations ?? [];
    check("13s. The conversation is still in the designer's inbox", inbox.some((c) => c.id === conv), inbox);
    const raw = await rawClientFromCookie(afterCookie);
    const { data: mirror } = await raw.from("users").select("id, email, is_admin").eq("id", before.userId).single();
    check("13t. public.users mirror follows the new email; no privilege change", mirror?.email === NEW && mirror?.is_admin === false, mirror);
    const customerAfter = await session(customerCookie);
    check("13u. The other (customer) account is untouched", customerAfter.email === "aanya@lilirve.dev" && !customerAfter.pendingEmail, customerAfter);
    check("13v. /account/email explains the half-way state (signed out)", await pageShows("/account/email?status=confirm-other", "open the confirmation link we sent to your other email address"));
    check("     …and never claims success from the URL alone", !(await pageShows("/account/email?status=changed", "updated and verified")));
    if (browser) {
      const done = await rendered(afterCookie, "/account/email?status=changed");
      check("13v2. Signed in after the change: success message + new email, no empty change form", done.text.includes("Email address updated and verified successfully.") && done.text.includes(NEW) && !done.hasForm, done.text.slice(0, 400));
      const anonDone = await rendered(null, "/account/email?status=changed");
      check("13v3. Signed out: no success claim, asks to sign in", !anonDone.text.includes("updated and verified") && anonDone.text.includes("Sign in"), anonDone.text.slice(0, 400));
      const prof = await rendered(afterCookie, "/designer/profile");
      check("13v4. Designer Profile shows the NEW email and no pending message", prof.text.includes(NEW) && !prof.text.includes(OLD) && !prof.text.includes("Waiting for confirmation"), prof.text.slice(0, 400));
      const hashErr = await rendered(null, "/auth/confirm?type=email_change#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
      check("13v5. Default-template expired link (#fragment error) → /account/email 'expired' message", hashErr.url.includes("/account/email") && hashErr.text.includes("expired or was already used"), `${hashErr.url} ${hashErr.text.slice(0, 300)}`);
      await browser.close();
    }
    check("     …and ignores unknown status values", !(await pageShows("/account/email?status=toString", 'role="status"')));
    // Supabase's DEFAULT email-change template (if the hosted project still uses it) verifies the
    // first link itself and lands here with only ?message= — that must not look like a failed signup.
    const defaultFirst = await fetch(`${APP_URL}/auth/confirm?message=Confirmation+link+accepted`, { redirect: "manual" });
    check("13w. Default-template first link (?message=) → /account/email?status=confirm-other", (defaultFirst.headers.get("location") ?? "").includes("/account/email?status=confirm-other"), defaultFirst.headers.get("location"));
    // Default-template links land on POST /api/auth/email's emailRedirectTo, tagged type=email_change.
    const landing = async (query) => (await fetch(`${APP_URL}/auth/confirm?${query}`, { redirect: "manual" })).headers.get("location") ?? "";
    let loc = await landing("type=email_change&message=Confirmation+link+accepted");
    check("13x. Tagged first link (?message=) → confirm-other", loc.includes("/account/email?status=confirm-other"), loc);
    loc = await landing("type=email_change&error=access_denied&error_code=otp_expired");
    check("13y. Tagged expired link (query error) → /account/email?status=expired, not /create-account", loc.includes("/account/email?status=expired"), loc);
    loc = await landing("type=email_change&error=access_denied&error_code=bad_request");
    check("13z. Tagged other link error → /account/email?status=invalid", loc.includes("/account/email?status=invalid"), loc);
    loc = await landing("type=email_change&code=00000000-0000-0000-0000-000000000000");
    check("13aa. Tagged ?code= opened in another browser (no PKCE verifier) → status=different-browser", loc.includes("/account/email?status=different-browser"), loc);
    loc = await landing("type=email_change");
    check("13ab. Tagged link with nothing usable (error only in #fragment) → /account/email, not a signup page", loc.includes("/account/email?status=invalid"), loc);
    check("13ac. /account/email explains the different-browser case", await pageShows("/account/email?status=different-browser", "same browser you used to request the change"));

    // Opposite order: NEW address's link first, then the CURRENT one's — both opened with no cookies.
    const NEW2 = `meera.again-${Date.now()}@lilirve.dev`;
    const sentAt2 = Date.now();
    const req2 = await api(afterCookie, "/api/auth/email", { method: "POST", body: JSON.stringify({ email: NEW2 }) });
    await new Promise((r) => setTimeout(r, 1500));
    const list2 = await (await fetch(`${mailpit}/api/v1/messages?limit=50`)).json();
    const linkFor2 = async (address) => {
      const m = list2.messages.find((x) => Date.parse(x.Created) >= sentAt2 - 1000 && x.To.some((t) => t.Address === address) && x.Subject.includes("email change"));
      const full = m && (await (await fetch(`${mailpit}/api/v1/message/${m.ID}`)).json());
      const href = full && [...full.HTML.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&")).find((h) => h.includes("/auth/confirm"));
      return href ? `${APP_URL}${new URL(href).pathname}${new URL(href).search}` : null;
    };
    const [curLink2, newLink2] = [await linkFor2(NEW), await linkFor2(NEW2)];
    const r1 = newLink2 && (await fetch(newLink2, { redirect: "manual" })).headers.get("location");
    const r2 = curLink2 && (await fetch(curLink2, { redirect: "manual" })).headers.get("location");
    const final2 = await session(await signInAs(NEW2));
    check("13ad. Reverse order (new address first): confirm-other, then changed; same user id", req2.status === 200 && (r1 ?? "").includes("status=confirm-other") && (r2 ?? "").includes("status=changed") && final2.email === NEW2 && final2.userId === before.userId && !final2.pendingEmail, { r1, r2, final2 });
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
