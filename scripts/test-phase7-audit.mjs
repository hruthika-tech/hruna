// LILIRVE — Phase 7 full-site audit test suite. Drives the REAL running app (real email + password sign-in, real API routes, real pages) verifying the fixes made this phase: the customer
// discovery surface (Home/Discover/dress/collection detail) reading real Supabase data instead of
// lib/mock-data.ts, the Navbar/DesignerNavbar/SubscriptionGate reading the REAL signed-in user
// instead of the seeded mock currentCustomer/currentDesigner, and the Saved Items page correctly
// resolving real saved designers/dresses/collections/projects.
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + the Phase 6 fixture SQL applied
// (scratchpad/phase6-fixtures.sql) + `npx next dev -p 3100` running.
// Run with: node scripts/test-phase7-audit.mjs

import { APP_URL, signInWithPassword } from "./lib/test-auth.mjs";

// Fingerprints unique to the old mock catalog (lib/mock-data.ts) — if any of these ever show up in
// a real page's response again, the mock data has regressed back in.
const MOCK_CUSTOMER_AVATAR_FRAGMENT = "1544005313-94ddf0286df2";
const MOCK_DESIGNER_AVATAR_FRAGMENT = "1580489944761-15a19d654956";
const MOCK_IDS = ["cust-1", "des-1"];

const MEERA_DESIGNER_ID = "d1000000-0000-0000-0000-000000000001"; // approved
const SEEDED_COLLECTION_ID = "e1000000-0000-0000-0000-000000000001";
const SEEDED_DRESS_ID = "e2000000-0000-0000-0000-000000000001";

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

function noMockFingerprints(text) {
  if (text.includes(MOCK_CUSTOMER_AVATAR_FRAGMENT) || text.includes(MOCK_DESIGNER_AVATAR_FRAGMENT)) return false;
  return !MOCK_IDS.some((id) => text.includes(`"${id}"`));
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

async function page(cookie, path) {
  const res = await fetch(`${APP_URL}${path}`, { headers: cookie ? { cookie } : {} });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  console.log("\n=== Setup: sign in as aanya (customer), meera (approved designer), priya (rejected), ramesh (pending) ===");
  const aanya = await signIn("aanya@lilirve.dev");
  const meera = await signIn("meera@lilirve.dev");
  const priya = await signIn("priya@lilirve.dev");
  const ramesh = await signIn("ramesh@lilirve.dev");

  console.log("\n=== 1-3. Public designer directory is real, not the mock catalog ===");
  {
    const res = await api(null, "/api/designers");
    check("1. GET /api/designers succeeds unauthenticated (public)", res.status === 200, res.data);
    check("2. Directory includes the real seeded approved designer (meera)", (res.data.designers ?? []).some((d) => d.id === MEERA_DESIGNER_ID), res.data);
    check("3. Directory contains no mock-catalog ids", !(res.data.designers ?? []).some((d) => MOCK_IDS.includes(d.id)), res.data);
  }

  console.log("\n=== 4-6. Real dress/collection detail (used to always 404/break for real ids) ===");
  {
    const dress = await api(null, `/api/dresses/${SEEDED_DRESS_ID}`);
    check("4. GET /api/dresses/[id] resolves the real seeded dress", dress.status === 200 && dress.data.dress?.name === "Nur Ivory Lehenga", dress.data);
    check("   ...with the correct real designer attached", dress.data.designer?.id === MEERA_DESIGNER_ID, dress.data);

    const collection = await api(null, `/api/collections/${SEEDED_COLLECTION_ID}`);
    check("5. GET /api/collections/[id] resolves the real seeded collection", collection.status === 200 && collection.data.collection?.name === "Nur — Winter Bridal", collection.data);
    check("6. ...and includes the dress that belongs to it", (collection.data.dresses ?? []).some((d) => d.id === SEEDED_DRESS_ID), collection.data);

    const missing = await api(null, "/api/dresses/00000000-0000-0000-0000-000000000000");
    check("   A nonexistent dress id returns 404, not a crash", missing.status === 404, missing.data);
  }

  console.log("\n=== 7-9. Discovery pages render for real ids, no mock fingerprints ===");
  {
    const dressPage = await page(null, `/dresses/${SEEDED_DRESS_ID}`);
    check("7. /dresses/[id] page renders 200 for a real dress", dressPage.status === 200);

    const collectionPage = await page(null, `/collections/${SEEDED_COLLECTION_ID}`);
    check("8. /collections/[id] page renders 200 for a real collection", collectionPage.status === 200);

    const discoverPage = await page(null, "/discover");
    check("9. /discover page renders 200 with no mock-catalog fingerprints", discoverPage.status === 200 && noMockFingerprints(discoverPage.text));
  }

  console.log("\n=== 10-12. Landing page + customer Home show real data, not the mock catalog ===");
  {
    const landing = await page(null, "/");
    check("10. Landing page renders 200 with no mock-catalog fingerprints", landing.status === 200 && noMockFingerprints(landing.text));

    const home = await page(aanya, "/home");
    check("11. Customer Home renders 200 for the real signed-in customer", home.status === 200);
    check("12. Customer Home contains no mock currentCustomer/currentDesigner fingerprints", noMockFingerprints(home.text), { length: home.text.length });
  }

  console.log("\n=== 13-14. Designer Home shows the real signed-in designer, not the mock currentDesigner ===");
  {
    const designerHome = await page(meera, "/designer/home");
    check("13. Designer Home renders 200 for the real signed-in designer", designerHome.status === 200);
    check("14. Designer Home contains no mock currentDesigner fingerprints", noMockFingerprints(designerHome.text), { length: designerHome.text.length });
  }

  console.log("\n=== 15-16. Verification status pages read the REAL signed-in designer's own record ===");
  {
    const rejectedVerification = await api(priya, "/api/designer/verification");
    check("15. Rejected designer's verification API returns HER OWN real rejection note", rejectedVerification.data.verification?.profileReviewNote?.includes("bridal-couture quality bar"), rejectedVerification.data);

    const pendingOnboarding = await api(ramesh, "/api/designer/onboarding");
    check("16. Pending designer's onboarding API returns HIS OWN real draft (not another designer's)", pendingOnboarding.status === 200 && pendingOnboarding.data.onboarding?.designerId === "d1000000-0000-0000-0000-000000000002", pendingOnboarding.data);
  }

  console.log("\n=== 17-19. Saved Items: save a real designer, then resolve it by id (was always empty before) ===");
  {
    const save = await api(aanya, "/api/saved-items", {
      method: "POST",
      body: JSON.stringify({ itemType: "designer", itemId: MEERA_DESIGNER_ID }),
    });
    check("17. Customer can save a real designer", save.status === 200 && save.data.saved === true, save.data);

    const list = await api(aanya, "/api/saved-items");
    check("   Saved items list includes it", (list.data.items ?? []).some((i) => i.itemType === "designer" && i.itemId === MEERA_DESIGNER_ID), list.data);

    const resolved = await api(null, `/api/designers?ids=${MEERA_DESIGNER_ID}`);
    check("18. The saved designer resolves to real content via ?ids= (Saved Items page's actual code path)", resolved.data.designers?.[0]?.id === MEERA_DESIGNER_ID && resolved.data.designers?.[0]?.studioName, resolved.data);

    const unsave = await api(aanya, "/api/saved-items", {
      method: "POST",
      body: JSON.stringify({ itemType: "designer", itemId: MEERA_DESIGNER_ID }),
    });
    check("19. (cleanup) Toggling again unsaves it", unsave.status === 200 && unsave.data.saved === false, unsave.data);
  }

  console.log("\n=== 20. Preferred-designer request flow resolves a real designerId, not a mock lookup ===");
  {
    const studio = await api(null, `/api/studio/${MEERA_DESIGNER_ID}`);
    check("20. Public Studio bundle (used by the 'Sending to:' badge) resolves the real designer", studio.status === 200 && studio.data.designer?.studioName, studio.data);

    const requestsNewPage = await page(aanya, `/requests/new?designerId=${MEERA_DESIGNER_ID}`);
    check("   /requests/new?designerId=<real-uuid> renders 200 without crashing", requestsNewPage.status === 200);
  }

  console.log("\n=== 21. Subscription gate does not block real users while payments are OFF ===");
  {
    const home = await page(aanya, "/home");
    check("21. Customer Home is NOT blocked by the subscription gate (payment_system_enabled=false)", home.status === 200 && !home.text.includes("SUBSCRIPTION REQUIRED"));
    const designerHome = await page(meera, "/designer/home");
    check("   Designer Home is NOT blocked either", designerHome.status === 200 && !designerHome.text.includes("SUBSCRIPTION REQUIRED"));
  }

  console.log("\n=== 22. Build-fixed pages requiring useSearchParams still render correctly ===");
  {
    const messages = await page(aanya, "/messages");
    check("22. /messages renders 200 (Suspense-boundary fix)", messages.status === 200);
    const designerMessages = await page(meera, "/designer/messages");
    check("   /designer/messages renders 200 (Suspense-boundary fix)", designerMessages.status === 200);
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
