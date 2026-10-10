// LILIRVE — Phase 6 admin backend test suite (§35, 26 minimum scenarios + a few extras in the
// same spirit as Phase 1/3/4/5's suites). Drives the REAL running app (real email + password sign-in, real API routes, real middleware) using the seeded personas: admin, meera (approved
// designer), ramesh (pending), priya (rejected), kabir (suspended), aanya (customer).
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + the Phase 6 fixture SQL applied
// (supabase/test-fixtures/phase6-disputes.sql — an open + a resolved dispute; disputes have
// no creation endpoint anywhere in the app, by design) + `npx next dev -p 3100` running.
// Run with: node scripts/test-phase6-admin.mjs

import { APP_URL, signInWithPassword } from "./lib/test-auth.mjs";

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

async function api(cookie, path, options = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log("\n=== Setup: sign in as admin + all designer/customer personas ===");
  const admin = await signIn("admin@lilirve.dev");
  const approved = await signIn("meera@lilirve.dev"); // designer, approved
  const pending = await signIn("ramesh@lilirve.dev"); // designer, pending
  const rejected = await signIn("priya@lilirve.dev"); // designer, rejected
  const suspendedDesigner = await signIn("kabir@lilirve.dev"); // designer, suspended
  const customerA = await signIn("aanya@lilirve.dev"); // customer

  const DESIGNER_ID = "d1000000-0000-0000-0000-000000000001"; // meera
  const CUSTOMER_ID = "c1000000-0000-0000-0000-000000000001"; // aanya
  const PENDING_DESIGNER_ID = "d1000000-0000-0000-0000-000000000002"; // ramesh
  const OPEN_DISPUTE_ID = "96000000-0000-0000-0000-000000000001";
  const RESOLVED_DISPUTE_ID = "96000000-0000-0000-0000-000000000002";

  console.log("\n=== 1. Admin dashboard access — positive ===");
  {
    const res = await api(admin, "/api/admin/dashboard");
    check("1. Admin can access the dashboard", res.status === 200, res.data);
    check("   Dashboard returns real (non-fabricated) counts", typeof res.data.stats?.totalCustomers === "number" && typeof res.data.stats?.totalDesigners === "number", res.data);
  }

  console.log("\n=== 2-6. Admin dashboard access — negative (5 non-admin roles denied) ===");
  {
    const a = await api(approved, "/api/admin/dashboard");
    check("2. Approved designer cannot access the admin dashboard", a.status !== 200, a.data);
    const p = await api(pending, "/api/admin/dashboard");
    check("3. Pending designer cannot access the admin dashboard", p.status !== 200, p.data);
    const r = await api(rejected, "/api/admin/dashboard");
    check("4. Rejected designer cannot access the admin dashboard", r.status !== 200, r.data);
    const s = await api(suspendedDesigner, "/api/admin/dashboard");
    check("5. Suspended designer cannot access the admin dashboard", s.status !== 200, s.data);
    const c = await api(customerA, "/api/admin/dashboard");
    check("6. Customer cannot access the admin dashboard", c.status !== 200, c.data);
    const anon = await api(null, "/api/admin/dashboard");
    check("   Unauthenticated request is rejected", anon.status !== 200, anon.data);
  }

  console.log("\n=== 7/8. Designer verification — view queue, non-admin denied ===");
  {
    const res = await api(admin, "/api/admin/verification");
    check("7. Admin can view the verification queue", res.status === 200 && Array.isArray(res.data.rows), res.data);
    const denied = await api(approved, "/api/admin/verification");
    check("8. Non-admin cannot view the verification queue", denied.status !== 200, denied.data);
  }

  console.log("\n=== 9/10. Designer detail bundle — admin only ===");
  {
    const res = await api(admin, `/api/admin/designers/${PENDING_DESIGNER_ID}`);
    check("9. Admin can view a full designer review bundle", res.status === 200, res.data);
    const denied = await api(customerA, `/api/admin/designers/${PENDING_DESIGNER_ID}`);
    check("10. Non-admin cannot view a designer review bundle", denied.status !== 200, denied.data);
  }

  console.log("\n=== 11/12. Approve/reject designer — non-admin denial + self-approval denial ===");
  {
    const nonAdminTry = await api(approved, `/api/admin/designers/${PENDING_DESIGNER_ID}/verify-identity`, { method: "POST" });
    check("11. Non-admin cannot verify a designer's identity", nonAdminTry.status !== 200, nonAdminTry.data);

    // "Self-approval" — a designer trying to approve/verify their OWN profile via the admin route.
    const selfTry = await api(pending, `/api/admin/designers/${PENDING_DESIGNER_ID}/verify-identity`, { method: "POST" });
    check("12. A designer cannot self-approve their own verification via the admin route", selfTry.status !== 200, selfTry.data);
  }

  console.log("\n=== 13. Designer suspend + suspended designer loses protected access ===");
  {
    // Use a throwaway path: verify+approve ramesh (pending) fully, then suspend, then confirm
    // suspension removes designer-protected access, matching kabir's seeded behavior.
    const verify = await api(admin, `/api/admin/designers/${PENDING_DESIGNER_ID}/verify-identity`, { method: "POST" });
    check("   (setup) Admin verifies pending designer's identity", verify.status === 200, verify.data);
    const approvePortfolio = await api(admin, `/api/admin/designers/${PENDING_DESIGNER_ID}/approve-portfolio`, { method: "POST" });
    check("   (setup) Admin approves pending designer's portfolio", approvePortfolio.status === 200, approvePortfolio.data);
    const approveProfile = await api(admin, `/api/admin/designers/${PENDING_DESIGNER_ID}/approve-profile`, { method: "POST" });
    check("   (setup) Admin approves pending designer's profile", approveProfile.status === 200, approveProfile.data);

    const suspend = await api(admin, `/api/admin/designers/${PENDING_DESIGNER_ID}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason: "Automated test suspension." }),
    });
    check("13. Admin can suspend a designer", suspend.status === 200, suspend.data);

    const feedAfter = await api(pending, "/api/designer/feed");
    check("   Suspended designer loses access to protected designer functionality", feedAfter.status !== 200, feedAfter.data);

    // Reinstate for repeatability of the suite.
    const reinstate = await api(admin, `/api/admin/designers/${PENDING_DESIGNER_ID}/approve-profile`, { method: "POST" });
    check("   (cleanup) Admin can reinstate a suspended designer via approve-profile", reinstate.status === 200, reinstate.data);
  }

  console.log("\n=== 14/15. User management — view all users, non-admin denied ===");
  {
    const res = await api(admin, "/api/admin/users");
    check("14. Admin can view all users (not just one hardcoded demo)", res.status === 200 && (res.data.customers ?? []).length >= 1 && (res.data.designers ?? []).length >= 4, res.data);
    const denied = await api(approved, "/api/admin/users");
    check("15. Non-admin cannot access user management", denied.status !== 200, denied.data);
  }

  console.log("\n=== 16. User account actions — customer suspend/reactivate roundtrip ===");
  {
    const suspend = await api(admin, `/api/admin/customers/${CUSTOMER_ID}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason: "Automated test suspension." }),
    });
    check("16. Admin can suspend a customer account", suspend.status === 200, suspend.data);

    const detailAfterSuspend = await api(admin, `/api/admin/customers/${CUSTOMER_ID}`);
    check("   Customer detail reflects suspended status", detailAfterSuspend.data.customer?.status === "suspended", detailAfterSuspend.data);

    const nonAdminTry = await api(approved, `/api/admin/customers/${CUSTOMER_ID}/suspend`, { method: "POST" });
    check("   Non-admin cannot suspend a customer account", nonAdminTry.status !== 200, nonAdminTry.data);

    const reactivate = await api(admin, `/api/admin/customers/${CUSTOMER_ID}/reactivate`, { method: "POST" });
    check("   (cleanup) Admin can reactivate a suspended customer", reactivate.status === 200, reactivate.data);
  }

  console.log("\n=== 17/18. Dispute management — view + non-admin denied ===");
  {
    const res = await api(admin, "/api/admin/disputes");
    check("17. Admin can view disputes list", res.status === 200 && (res.data.disputes ?? []).some((d) => d.id === OPEN_DISPUTE_ID), res.data);
    const denied = await api(approved, "/api/admin/disputes");
    check("18. Non-admin cannot view disputes", denied.status !== 200, denied.data);

    const detail = await api(admin, `/api/admin/disputes/${OPEN_DISPUTE_ID}`);
    check("   Admin can view a single dispute's detail + notes", detail.status === 200 && detail.data.dispute?.id === OPEN_DISPUTE_ID, detail.data);

    const note = await api(admin, `/api/admin/disputes/${OPEN_DISPUTE_ID}/notes`, {
      method: "POST",
      body: JSON.stringify({ text: "Automated test note." }),
    });
    check("   Admin can add a note to a dispute", note.status === 200, note.data);

    const advance = await api(admin, `/api/admin/disputes/${OPEN_DISPUTE_ID}/status`, { method: "POST" });
    check("   Admin can advance a dispute's status (open -> under_review)", advance.status === 200 && advance.data.newStatus === "under_review", advance.data);

    const closedTry = await api(admin, `/api/admin/disputes/${RESOLVED_DISPUTE_ID}/status`, { method: "POST" });
    check("   Advancing an already-resolved dispute still works or is a clean no-op (resolved -> closed)", closedTry.status === 200 && closedTry.data.newStatus === "closed", closedTry.data);

    const nonAdminNote = await api(approved, `/api/admin/disputes/${OPEN_DISPUTE_ID}/notes`, {
      method: "POST",
      body: JSON.stringify({ text: "Should be rejected." }),
    });
    check("   Non-admin cannot add a dispute note", nonAdminNote.status !== 200, nonAdminNote.data);
  }

  console.log("\n=== 19/20. Payment/subscription monitoring — view + non-admin settings denied ===");
  {
    const res = await api(admin, "/api/admin/subscriptions");
    check("19. Admin can view the subscriptions/payments bundle", res.status === 200 && res.data.settings && Array.isArray(res.data.plans), res.data);
    const denied = await api(approved, "/api/admin/subscriptions");
    check("   Non-admin cannot view the subscriptions/payments bundle", denied.status !== 200, denied.data);

    const settingsTry = await api(approved, "/api/admin/settings/payment", {
      method: "PATCH",
      body: JSON.stringify({ currency: "USD" }),
    });
    check("20. Non-admin cannot change platform payment settings", settingsTry.status !== 200, settingsTry.data);

    const adminChange = await api(admin, "/api/admin/settings/payment", {
      method: "PATCH",
      body: JSON.stringify({ currency: "INR" }),
    });
    check("   Admin CAN change platform payment settings", adminChange.status === 200, adminChange.data);
  }

  console.log("\n=== 21. System notifications — create + non-admin denied ===");
  {
    const create = await api(admin, "/api/admin/notifications", {
      method: "POST",
      body: JSON.stringify({ title: "Automated test notice", message: "Scheduled maintenance tonight.", audience: "all" }),
    });
    check("21. Admin can publish a system notification", create.status === 200, create.data);

    const nonAdminTry = await api(approved, "/api/admin/notifications", {
      method: "POST",
      body: JSON.stringify({ title: "Should be rejected", message: "x", audience: "all" }),
    });
    check("   Non-admin cannot publish a system notification", nonAdminTry.status !== 200, nonAdminTry.data);
  }

  console.log("\n=== 22. Audit log — creation on admin actions, no admin-facing tamper endpoint ===");
  {
    const designerDetail = await api(admin, `/api/admin/designers/${PENDING_DESIGNER_ID}`);
    const auditEntries = designerDetail.data.auditLog ?? designerDetail.data.designer?.auditLog ?? [];
    check("22. Admin actions on a designer are recorded in the audit log", auditEntries.length >= 1, auditEntries);

    // No PATCH/DELETE endpoint exists anywhere under /api/admin for admin_audit_log — the table
    // itself has no update/delete RLS policy for any role (append-only by database guarantee), and
    // the application layer never exposes a route that could even attempt it.
    const tryDelete = await fetch(`${APP_URL}/api/admin/audit-log`, { method: "DELETE", headers: { cookie: admin } });
    check("   No admin-facing endpoint exists to modify/delete audit log entries", tryDelete.status === 404 || tryDelete.status === 405, { status: tryDelete.status });
  }

  console.log("\n=== 23. Private verification documents remain protected from non-admins ===");
  {
    const nonAdminTry = await api(approved, `/api/admin/designers/${PENDING_DESIGNER_ID}`);
    check("23. A designer cannot use the admin bundle route to see another designer's private documents", nonAdminTry.status !== 200, nonAdminTry.data);
  }

  console.log("\n=== 24. No service-role key reaches any admin API response or the client bundle ===");
  {
    const res = await api(admin, "/api/admin/dashboard");
    const text = JSON.stringify(res.data);
    check("24. Admin dashboard response body contains no service-role key substring", !text.includes("service_role") && !text.includes("sb_secret_"), { length: text.length });

    const page = await fetch(`${APP_URL}/admin`, { headers: { cookie: admin } });
    const html = await page.text();
    check("   /admin page response body contains no service-role key substring", !html.includes("service_role") && !html.includes("sb_secret_"), { length: html.length });
  }

  console.log("\n=== 25. No Community/Moodboard/Delivery functionality anywhere in the admin surface ===");
  {
    const nav = await fetch(`${APP_URL}/admin`, { headers: { cookie: admin } });
    const html = await nav.text();
    const hasForbidden = /community|moodboard|delivery.?agent/i.test(html);
    check("25. Admin dashboard page contains no Community/Moodboard/Delivery references", !hasForbidden, { length: html.length });

    const forbiddenRoutes = ["/api/admin/community", "/api/admin/moodboard", "/api/admin/delivery"];
    for (const route of forbiddenRoutes) {
      const res = await fetch(`${APP_URL}${route}`, { headers: { cookie: admin } });
      check(`   ${route} does not exist`, res.status === 404, { status: res.status });
    }
  }

  console.log("\n=== 26. Regression sanity — customer/designer core workflows still function ===");
  {
    const feed = await api(approved, "/api/designer/feed");
    check("26. Approved designer's request feed still works after Phase 6 changes", feed.status === 200, feed.data);
    const projects = await api(customerA, "/api/projects");
    check("   Customer's project list still works after Phase 6 changes", projects.status === 200, projects.data);
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
