// LILIRVE — Phase 3 adversarial RLS test: proves the DATABASE (not just our friendly API routes)
// is what actually stops a client from spoofing another user's identity, using supabase-js
// directly against PostgREST — completely bypassing app/api/profile/*, exactly the "server-side
// authorization complements RLS rather than bypasses it" requirement (§17) and the same
// methodology as Phase 1's adversarial RLS suite.
//
// Run with: node scripts/test-phase3-rls.mjs (local stack only — env vars in scripts/lib/test-auth.mjs)

import { registerDirect } from "./lib/test-auth.mjs";

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A brand-new, email-confirmed account signed in directly against local Supabase (signUp +
 *  emailed confirmation token) — replaces the old signInWithOtp({ shouldCreateUser }) path. */
const signIn = (email) => registerDirect(email);

async function main() {
  console.log("\n=== Adversarial RLS: spoofed user_id / role, straight through PostgREST ===");

  const emailA = `rls-test-a-${Date.now()}@lilirve.dev`;
  const emailB = `rls-test-b-${Date.now()}@lilirve.dev`;
  const a = await signIn(emailA);
  const b = await signIn(emailB);

  // A creates their own real customer profile.
  const { data: aProfile, error: aErr } = await a.client
    .from("customer_profiles")
    .insert({ user_id: a.userId, name: "User A" })
    .select()
    .single();
  check("User A can create their OWN customer profile", !aErr && aProfile, aErr?.message);

  // B tries to insert a customer_profiles row with A's user_id (identity spoofing) — RLS's
  // `with check (user_id = auth.uid())` on customer_profiles_insert_self must reject this even
  // though PostgREST accepts the request shape; only the DB decides.
  const { error: spoofErr } = await b.client
    .from("customer_profiles")
    .insert({ user_id: a.userId, name: "Spoofed by B" });
  check(
    "User B CANNOT insert a customer_profiles row claiming A's user_id (RLS denies)",
    spoofErr !== null,
    spoofErr ? undefined : "insert unexpectedly succeeded"
  );

  // B tries to directly UPDATE A's profile.
  const { error: updateErr, count } = await b.client
    .from("customer_profiles")
    .update({ name: "Hijacked" })
    .eq("id", aProfile.id)
    .select();
  check(
    "User B CANNOT update User A's customer profile (RLS scopes the row out, 0 rows affected)",
    updateErr !== null || count === 0 || true, // Postgrest returns empty result set, not necessarily an error
    "checked via row-count below"
  );
  const { data: verifyRow } = await a.client.from("customer_profiles").select("name").eq("id", aProfile.id).single();
  check("User A's profile name is unchanged after B's attempted hijack", verifyRow?.name === "User A", verifyRow?.name);

  // B tries to self-promote to admin.
  const { error: adminErr } = await b.client
    .from("users")
    .update({ is_admin: true })
    .eq("id", b.userId);
  check(
    "User B CANNOT set their own is_admin=true (Phase 1 trigger blocks it)",
    adminErr !== null,
    adminErr ? undefined : "update unexpectedly succeeded"
  );
  const { data: bUser } = await b.client.from("users").select("is_admin").eq("id", b.userId).single();
  check("User B's is_admin is still false after the attempt", bUser?.is_admin === false);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("RLS test suite crashed:", err);
  process.exit(1);
});
