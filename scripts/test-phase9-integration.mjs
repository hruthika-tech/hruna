// LILIRVE — Phase 9 frontend integration test suite. Covers the genuinely disconnected
// functionality found this phase: the customer onboarding wizard's "Finish" button silently
// discarded all collected data (name/city/avatar) instead of creating a real customer_profiles
// row, and both the customer and designer Notifications pages rendered a hardcoded local array of
// fake events with broken mock-id links, never fetching anything real.
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + `npx next dev -p 3100` running.
// Run with: node scripts/test-phase9-integration.mjs

import { APP_URL, signInWithPassword, registerAndConfirm, assertLocalTestEnvironment } from "./lib/test-auth.mjs";

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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${JSON.stringify(detail).slice(0, 250)}` : ""}`);
  }
}

/** Signs a SEEDED account in through the real app API (POST /api/auth/login — email + password,
 *  exactly what the frontend does) and returns the session cookie header. */
const signIn = (email) => signInWithPassword(email);

/** A BRAND-NEW account via the real signup + emailed confirmation-link flow (replaces the old OTP
 *  auto-create-on-first-sign-in behavior); returns the session cookie header. */
const signUpFresh = async (email) => (await registerAndConfirm(email)).cookie;

async function api(cookie, path, options = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log("\n=== 1-3. Onboarding wizard actually creates a real customer profile now ===");
  {
    const freshEmail = `phase9-onboarding-${Date.now()}@lilirve.dev`;
    const cookie = await signUpFresh(freshEmail);

    const before = await api(cookie, "/api/requests");
    check("1. A brand-new signup with no profile yet is correctly rejected from customer-only actions", before.status === 403, before.data);

    const finish = await api(cookie, "/api/profile/customer", {
      method: "POST",
      body: JSON.stringify({ name: "Phase9 Onboarding Test", city: "Bengaluru" }),
    });
    check("2. The onboarding wizard's real Finish action creates a real customer_profiles row", finish.status === 200 && finish.data.customerProfile?.name === "Phase9 Onboarding Test", finish.data);

    const after = await api(cookie, "/api/requests");
    check("3. The same user can now use customer-only actions for real", after.status === 200, after.data);
  }

  console.log("\n=== 4/5. Customer notifications feed is real, not a hardcoded array ===");
  {
    const aanya = await signIn("aanya@lilirve.dev");
    const res = await api(aanya, "/api/notifications");
    check("4. Customer notifications endpoint returns real data", res.status === 200 && Array.isArray(res.data.notifications), res.data);
    const hasRealProposal = (res.data.notifications ?? []).some((n) => n.type === "proposal" && n.href.includes("71000000-0000-0000-0000-000000000001"));
    check("5. Feed includes the real seeded proposal, linking to the real UUID request (not a mock 'req-1' id)", hasRealProposal, res.data.notifications);
  }

  console.log("\n=== 6/7. Designer notifications feed is real, not a hardcoded array ===");
  {
    const meera = await signIn("meera@lilirve.dev");
    const res = await api(meera, "/api/designer/notifications");
    check("6. Designer notifications endpoint returns real data", res.status === 200 && Array.isArray(res.data.notifications), res.data);
    const hasRealReview = (res.data.notifications ?? []).some((n) => n.type === "review");
    check("7. Feed includes the real seeded review", hasRealReview, res.data.notifications);
  }

  console.log("\n=== 8. A pending designer's notifications feed correctly omits the request feed section ===");
  {
    const ramesh = await signIn("ramesh@lilirve.dev"); // pending, not approved
    const res = await api(ramesh, "/api/designer/notifications");
    check("8. Pending designer's feed has no 'request' items (not eligible for the swipe feed yet)", res.status === 200 && !(res.data.notifications ?? []).some((n) => n.type === "request"), res.data);
  }

  console.log("\n=== 9. Unauthenticated access to both notification endpoints is rejected ===");
  {
    const c = await api(null, "/api/notifications");
    check("9. Unauthenticated customer notifications request is rejected", c.status === 401, c.data);
    const d = await api(null, "/api/designer/notifications");
    check("   Unauthenticated designer notifications request is rejected", d.status === 401, d.data);
  }

  console.log("\n=== 10. The forgot-password page no longer fakes a successful email send ===");
  {
    const res = await fetch(`${APP_URL}/forgot-password`);
    const text = await res.text();
    check("10. Page renders 200 and no longer claims to have sent an email", res.status === 200 && !text.includes("sent a password reset link"));
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
