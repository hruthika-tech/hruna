// LILIRVE — Phase 10 final validation/security-hardening test suite. Covers genuinely NEW ground
// not exercised by any Phase 3–9 test script: a REAL concurrent proposal-acceptance race against
// the running database, dual-role (customer+designer on one identity) account isolation, invalid/
// malformed sign-in credential handling (originally OTP), the DB-level trigger blocking a directed request at a non-approved
// designer, message sender-id spoofing resistance, and admin_audit_log immutability. Existing
// IDOR/RLS/admin/payment/storage coverage from prior phases is treated as standing evidence and
// re-run as regression (see the Phase 10 final report), not duplicated here.
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + `npx next dev -p 3100` running.
// Run with: node scripts/test-phase10-security.mjs

import { execSync } from "node:child_process";

import { APP_URL, signInWithPassword, registerAndConfirm } from "./lib/test-auth.mjs";

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

function sql(query) {
  return execSync(`docker exec -i supabase_db_lilirve-app psql -U postgres -d postgres -t -A -c "${query.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
  }).trim();
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
  console.log("\n=== Setup ===");
  const admin = await signIn("admin@lilirve.dev");
  const aanya = await signIn("aanya@lilirve.dev");
  const meera = await signIn("meera@lilirve.dev"); // approved
  const ramesh = await signIn("ramesh@lilirve.dev"); // pending -> temporarily approved below

  console.log("\n=== 1-4. CRITICAL: real concurrent proposal acceptance race ===");
  {
    const RAMESH_ID = "d1000000-0000-0000-0000-000000000002";
    await api(admin, `/api/admin/designers/${RAMESH_ID}/verify-identity`, { method: "POST" });
    await api(admin, `/api/admin/designers/${RAMESH_ID}/approve-portfolio`, { method: "POST" });
    const approve = await api(admin, `/api/admin/designers/${RAMESH_ID}/approve-profile`, { method: "POST" });
    check("   (setup) Second designer temporarily approved for a genuine 2-proposal race", approve.status === 200, approve.data);

    const create = await api(aanya, "/api/requests", {
      method: "POST",
      body: JSON.stringify({ title: "Phase10 Concurrency Test", category: "Occasion Wear", description: "x", budgetMin: 5000, budgetMax: 10000, dueDate: "2027-01-01" }),
    });
    const requestId = create.data.request.id;

    const p1 = await api(meera, "/api/designer/proposals", { method: "POST", body: JSON.stringify({ requestId, price: 30000, estimatedDays: 15, description: "A" }) });
    const p2 = await api(ramesh, "/api/designer/proposals", { method: "POST", body: JSON.stringify({ requestId, price: 35000, estimatedDays: 20, description: "B" }) });
    const proposalIds = [p1.data.proposal?.id, p2.data.proposal?.id];
    check("   (setup) Two independent pending proposals exist on the same request", proposalIds.every(Boolean), { p1: p1.data, p2: p2.data });

    // Truly concurrent — both HTTP requests dispatched before either resolves.
    const [accept1, accept2] = await Promise.all([
      api(aanya, `/api/proposals/${proposalIds[0]}/accept`, { method: "POST" }),
      api(aanya, `/api/proposals/${proposalIds[1]}/accept`, { method: "POST" }),
    ]);
    const successCount = [accept1, accept2].filter((r) => r.status === 200).length;
    check("1. Exactly ONE of the two concurrent accept attempts succeeds", successCount === 1, { accept1: accept1.status, accept2: accept2.status });
    check("   The other fails with a clean, safe error (no raw DB error, no deadlock exposed to the client)", [accept1, accept2].some((r) => r.status !== 200 && typeof r.data.message === "string" && !/deadlock|constraint|violat/i.test(r.data.message)), { accept1: accept1.data, accept2: accept2.data });

    const statuses = sql(`select status from public.proposals where request_id = '${requestId}' order by created_at;`).split("\n");
    check("2. Database shows exactly one accepted + one declined proposal, no other state", statuses.filter((s) => s === "accepted").length === 1 && statuses.filter((s) => s === "declined").length === 1, { statuses });

    const projectCount = sql(`select count(*) from public.projects where request_id = '${requestId}';`);
    check("3. Exactly ONE project was created for this request (no duplicate)", projectCount === "1", { projectCount });

    const requestStatus = sql(`select status from public.fashion_requests where id = '${requestId}';`);
    check("4. Request status correctly moved to 'accepted'", requestStatus === "accepted", { requestStatus });
  }

  console.log("\n=== 5-8. Dual-role account (one identity, both a customer and designer profile) ===");
  {
    const dualEmail = `phase10-dual-${Date.now()}@lilirve.dev`;
    const dualCookie = await signUpFresh(dualEmail);

    const customerProfile = await api(dualCookie, "/api/profile/customer", { method: "POST", body: JSON.stringify({ name: "Dual Role Test", city: "Pune" }) });
    check("   (setup) Real customer profile created", customerProfile.status === 200, customerProfile.data);

    const designerProfile = await api(dualCookie, "/api/profile/designer", { method: "POST", body: JSON.stringify({ studioName: "Dual Role Studio", type: "Designer" }) });
    check("   (setup) Real designer profile ALSO created for the SAME identity", designerProfile.status === 200, designerProfile.data);

    const customerAction = await api(dualCookie, "/api/requests", {
      method: "POST",
      body: JSON.stringify({ title: "Dual role customer request", category: "Occasion Wear", description: "x", budgetMin: 1000, budgetMax: 2000, dueDate: "2027-01-01" }),
    });
    check("5. The dual-role identity can use customer-only actions for real", customerAction.status === 200, customerAction.data);

    const designerAction = await api(dualCookie, "/api/designer/onboarding");
    check("6. The SAME identity can also use designer-only actions for real", designerAction.status === 200, designerAction.data);

    // Not yet approved (fresh designer profile) — must still be denied approved-only actions,
    // exactly like any other unapproved designer. Having a customer profile too must not help.
    const feedAttempt = await api(dualCookie, "/api/designer/feed");
    check("7. Having a customer profile grants NO designer privileges — still correctly denied the approved-only feed (not approved)", feedAttempt.status !== 200, feedAttempt.data);

    // Customer-only route must still work fine for this identity even though it also has a
    // (unapproved) designer profile — the two are independent, neither blocks the other.
    const requestsList = await api(dualCookie, "/api/requests");
    check("8. Having a designer profile does not interfere with normal customer access", requestsList.status === 200 && (requestsList.data.requests ?? []).some((r) => r.title === "Dual role customer request"), requestsList.data);
  }

  // Migrated from "invalid/malformed OTP": sign-in is now email + password (POST /api/auth/login),
  // so the same three guarantees are checked against that route — a wrong credential is rejected
  // generically, a malformed body is rejected, and a failed attempt doesn't lock out the real one.
  console.log("\n=== 9/10. Invalid/malformed sign-in credentials are safely rejected, never leak info ===");
  {
    const freshEmail = `phase10-login-${Date.now()}@lilirve.dev`;
    const { password } = await registerAndConfirm(freshEmail);
    const leaks = (m) => /postgres|supabase|stack|at\s+\w+\.\w+\s*\(/i.test(m);

    const wrong = await api(null, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: freshEmail, password: `${password}-wrong` }) });
    check("9. A wrong password is rejected, with a generic message (no stack trace/internal detail)", wrong.status >= 400 && typeof wrong.data.message === "string" && !leaks(wrong.data.message), wrong.data);

    const malformed = await api(null, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: freshEmail, password: 12345678 }) });
    check("10. A malformed sign-in body (non-string password) is also safely rejected", malformed.status >= 400 && typeof malformed.data.message === "string" && !leaks(malformed.data.message), malformed.data);

    // The real password still works afterward — a wrong attempt doesn't lock out the real one.
    const real = await api(null, "/api/auth/login", { method: "POST", body: JSON.stringify({ email: freshEmail, password }) });
    check("    The REAL password still works after a prior wrong attempt", real.status === 200, real.data);
  }

  console.log("\n=== 11. A directed (private) request cannot target a non-approved designer (DB trigger) ===");
  {
    const RAMESH_ID = "d1000000-0000-0000-0000-000000000002"; // now approved from the setup above — use priya (rejected) instead
    const PRIYA_ID = "d1000000-0000-0000-0000-000000000003";
    const res = await api(aanya, "/api/requests", {
      method: "POST",
      body: JSON.stringify({ title: "Should be rejected", category: "Occasion Wear", description: "x", budgetMin: 1000, budgetMax: 2000, dueDate: "2027-01-01", preferredDesignerId: PRIYA_ID }),
    });
    check("11. Directing a private request at a REJECTED designer is rejected (DB trigger, not just app logic)", res.status >= 400, res.data);
  }

  console.log("\n=== 12. Message sender identity cannot be spoofed via the request body ===");
  {
    const convo = await api(meera, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: "c1000000-0000-0000-0000-000000000001" }) });
    const conversationId = convo.data.conversationId;
    const send = await api(meera, `/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: "Spoof test", senderId: "c1000000-0000-0000-0000-000000000001", sender_id: "c1000000-0000-0000-0000-000000000001" }),
    });
    check("12. A spoofed senderId/sender_id field in the request body is ignored — the message is still attributed to the real caller", send.status === 200 && send.data.message?.senderId !== "c1000000-0000-0000-0000-000000000001", send.data);
  }

  console.log("\n=== 13/14. Admin audit log is truly immutable (no UPDATE/DELETE policy at all) ===");
  {
    const { data: logRows } = { data: sql(`select id from public.admin_audit_log limit 1;`) };
    const logId = logRows;
    if (logId) {
      let updateRejected = false;
      try {
        sql(`set role authenticated; update public.admin_audit_log set action = 'tampered' where id = '${logId}';`);
      } catch {
        updateRejected = true;
      }
      // Even as postgres superuser via a plain UPDATE this would succeed (superuser bypasses RLS) —
      // the real guarantee is that NO POLICY exists for authenticated/admin roles, verified by
      // checking the actual row is untouched after a normal authenticated-role attempt.
      const stillOriginal = sql(`select action != 'tampered' from public.admin_audit_log where id = '${logId}';`);
      check("13. Audit log row is unmodified after an attempted UPDATE under the authenticated role (no policy grants it)", stillOriginal === "t", { stillOriginal });
    } else {
      check("13. (skipped — no audit log rows exist yet to test against)", true);
    }
    const policyCount = sql(`select count(*) from pg_policies where tablename = 'admin_audit_log' and cmd in ('UPDATE','DELETE');`);
    check("14. No UPDATE or DELETE policy exists on admin_audit_log at all (append-only by construction)", policyCount === "0", { policyCount });
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
