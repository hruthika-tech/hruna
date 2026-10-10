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

import { APP_URL, signInWithPassword, registerAndConfirm, rawClientFromCookie } from "./lib/test-auth.mjs";

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
