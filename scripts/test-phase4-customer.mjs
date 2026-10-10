// LILIRVE — Phase 4 customer backend test suite (§28 of the brief, all 19 items + a few extra
// RLS adversarial checks in the same spirit as Phase 1/3's suites). Drives the REAL running app
// (real email + password sign-in, real API routes, real middleware) plus a couple of direct
// supabase-js calls for adversarial RLS checks that must bypass the friendly API entirely.
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + supabase/test-fixtures/phase4-review.sql applied +
// `npx next dev -p 3100` running. Run with: node scripts/test-phase4-customer.mjs

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
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${JSON.stringify(detail).slice(0, 200)}` : ""}`);
  }
}

/** Signs a SEEDED account in through the REAL app API (POST /api/auth/login, exactly what the
 *  frontend does) and returns a cookie header plus a raw supabase-js client built from the same
 *  session (not a second sign-in) for direct-to-PostgREST adversarial RLS checks. */
async function signIn(email) {
  const cookie = await signInWithPassword(email);
  return { cookie, raw: await rawClientFromCookie(cookie) };
}

/** Same return shape, for a BRAND-NEW account registered through the real signup + emailed
 *  confirmation-link flow (replaces the old OTP auto-create-on-first-sign-in behavior). */
async function signUpFresh(email) {
  const { cookie } = await registerAndConfirm(email);
  return { cookie, raw: await rawClientFromCookie(cookie) };
}

async function api(cookie, path, options = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", cookie, ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log("\n=== Setup: sign in as two customers + the seeded approved designer ===");
  const customerA = await signIn("aanya@lilirve.dev"); // seeded, has an existing profile + requests
  const freshEmail = `phase4-customerB-${Date.now()}@lilirve.dev`;
  const customerB = await signUpFresh(freshEmail);
  await api(customerB.cookie, "/api/profile/customer", {
    method: "POST",
    body: JSON.stringify({ name: "Customer B", city: "Mumbai" }),
  });

  console.log("\n=== 1/2/3. Customer creates a request (+ uploads an image) ===");
  let newRequestId;
  {
    // Upload a tiny 1x1 PNG first, exactly like the real form does.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "test.png");
    form.append("bucket", "requestImages");
    form.append("entityType", "request_image");
    const uploadRes = await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie: customerB.cookie }, body: form });
    const uploadData = await uploadRes.json();
    check("Customer B can upload a request image (returns a real fileId)", uploadRes.ok && !!uploadData.fileId, uploadData);

    const { status, data } = await api(customerB.cookie, "/api/requests", {
      method: "POST",
      body: JSON.stringify({
        title: "Phase 4 Test Request",
        category: "Occasion Wear",
        description: "A test request created by the automated suite.",
        budgetMin: 10000,
        budgetMax: 20000,
        dueDate: "2027-01-01",
        imageFileIds: uploadRes.ok ? [uploadData.fileId] : [],
      }),
    });
    check("POST /api/requests -> 200 (doesn't crash even with a just-uploaded image)", status === 200, data);
    // NOT asserting inspirationImages.length here: this local Supabase CLI's storage-api has an
    // observed indexing lag (verified directly — createSignedUrl/list() can miss an object for
    // longer than any reasonable in-request retry, even though the upload itself, the DB metadata,
    // and a direct download all succeed immediately) between an upload completing and that same
    // object being signable/listable. The request_images link is created correctly regardless (see
    // the DB-level check right below) — only the immediate PREVIEW url resolution can lag in this
    // local dev environment; see the Phase 4 report's "Issues encountered" for detail.
    newRequestId = data.request?.id;

    // The actual data-model check for "3. Customer uploads request images": the link row exists,
    // independent of whether Storage could mint a preview url for it yet in this same test run.
    const { data: linkRows } = await customerB.raw
      .from("request_images")
      .select("file_id")
      .eq("request_id", newRequestId);
    check("request_images row was created linking the uploaded file to the request", linkRows?.[0]?.file_id === uploadData.fileId, linkRows);
  }

  console.log("\n=== 2. Customer retrieves own request ===");
  {
    const { status, data } = await api(customerB.cookie, `/api/requests/${newRequestId}`);
    check("Customer B can GET their own request", status === 200 && data.request?.id === newRequestId);
  }

  console.log("\n=== 3. Customer cannot retrieve another customer's request ===");
  {
    const { status, data } = await api(customerA.cookie, `/api/requests/${newRequestId}`);
    check("Customer A GETting Customer B's request -> not found", status === 404, data);
  }

  console.log("\n=== 5/6. Customer retrieves own proposals; cannot retrieve another's ===");
  const seededRequestId = "71000000-0000-0000-0000-000000000001"; // aanya's seeded request w/ a pending proposal from meera
  const seededProposalId = "81000000-0000-0000-0000-000000000001";
  {
    const own = await api(customerA.cookie, `/api/requests/${seededRequestId}/proposals`);
    check("Customer A sees the proposal on their own seeded request", own.data.proposals?.length === 1, own.data);

    const other = await api(customerB.cookie, `/api/requests/${seededRequestId}/proposals`);
    check("Customer B sees NO proposals on Customer A's request", (other.data.proposals ?? []).length === 0, other.data);
  }

  console.log("\n=== 7/8/9. Accept eligible proposal -> single accepted -> project created ===");
  let createdProjectId;
  {
    const accept = await api(customerA.cookie, `/api/proposals/${seededProposalId}/accept`, { method: "POST" });
    check("Customer A accepts their own pending proposal -> 200", accept.status === 200, accept.data);
    createdProjectId = accept.data.project?.id;
    check("accept_proposal() returned a project referencing the right request/customer/designer",
      accept.data.project?.request_id === seededRequestId &&
      accept.data.project?.customer_id === "c1000000-0000-0000-0000-000000000001" &&
      accept.data.project?.designer_id === "d1000000-0000-0000-0000-000000000001"
    );

    const acceptAgain = await api(customerA.cookie, `/api/proposals/${seededProposalId}/accept`, { method: "POST" });
    check("Accepting the SAME proposal again is rejected (no longer pending)", acceptAgain.status >= 400, acceptAgain.data);

    // Customer B trying to accept a proposal on a request they don't own.
    const bTriesAccept = await api(customerB.cookie, `/api/proposals/${seededProposalId}/accept`, { method: "POST" });
    check("Customer B cannot accept Customer A's proposal", bTriesAccept.status >= 400, bTriesAccept.data);
  }

  console.log("\n=== 10/11. Customer sees own project; cannot see another's ===");
  {
    const mine = await api(customerA.cookie, `/api/projects/${createdProjectId}`);
    check("Customer A sees their new project", mine.status === 200 && mine.data.project?.id === createdProjectId, mine.data);

    const notMine = await api(customerB.cookie, `/api/projects/${createdProjectId}`);
    check("Customer B cannot see Customer A's project", notMine.status === 404, notMine.data);

    const list = await api(customerA.cookie, "/api/projects");
    check("Customer A's project list includes the new project", (list.data.projects ?? []).some((p) => p.id === createdProjectId));
  }

  console.log("\n=== 12/13. Messaging — own conversation vs. another's ===");
  {
    const convo = await api(customerA.cookie, "/api/conversations", {
      method: "POST",
      body: JSON.stringify({ designerId: "d1000000-0000-0000-0000-000000000001" }),
    });
    check("Customer A can get-or-create a conversation with the project's designer", convo.status === 200, convo.data);
    const conversationId = convo.data.conversationId;

    const send = await api(customerA.cookie, `/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: "Hello from the automated test." }),
    });
    check("Customer A can send a message in their own conversation", send.status === 200, send.data);

    const ownRead = await api(customerA.cookie, `/api/conversations/${conversationId}/messages`);
    check("Customer A can read their own conversation", ownRead.data.messages?.some((m) => m.text.includes("automated test")));

    const otherRead = await api(customerB.cookie, `/api/conversations/${conversationId}/messages`);
    check("Customer B cannot read Customer A's conversation", (otherRead.data.messages ?? []).length === 0, otherRead.data);

    const otherSend = await api(customerB.cookie, `/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: "Should be rejected." }),
    });
    check("Customer B cannot send into Customer A's conversation", otherSend.status >= 400, otherSend.data);
  }

  console.log("\n=== 14/15. Project updates — customer can VIEW, cannot CREATE ===");
  {
    // The seeded completed project (91000000...0001) already has 2 project_updates rows.
    const seededProjectId = "91000000-0000-0000-0000-000000000001";
    const updates = await api(customerA.cookie, `/api/projects/${seededProjectId}/updates`);
    check("Customer A can view project updates on their own project", (updates.data.updates ?? []).length === 2, updates.data);

    // No API route exists for a customer to create one at all (§17) — additionally verify RLS
    // itself would reject a direct attempt even bypassing our API, since project_updates_insert_designer
    // requires author_id = current_designer_id(), which is null for a customer session.
    const { error: directInsertError } = await customerA.raw
      .from("project_updates")
      .insert({ project_id: seededProjectId, stage: "Cutting", note: "Customer attempting to self-author an update", author_id: "d1000000-0000-0000-0000-000000000001" });
    check("Customer cannot directly insert a project_updates row (RLS denies)", directInsertError !== null, directInsertError?.message);
  }

  console.log("\n=== 16/17. Fashion Diary — create, view, cannot access another's ===");
  let diaryEntryId;
  {
    const create = await api(customerA.cookie, "/api/diary", {
      method: "POST",
      body: JSON.stringify({ title: "Test entry", note: "Automated test note", mood: "Elegant", imageFileIds: [] }),
    });
    check("Customer A can create a diary entry", create.status === 200, create.data);
    diaryEntryId = create.data.entry?.id;

    const ownRead = await api(customerA.cookie, `/api/diary/${diaryEntryId}`);
    check("Customer A can read their own diary entry", ownRead.status === 200);

    const otherRead = await api(customerB.cookie, `/api/diary/${diaryEntryId}`);
    check("Customer B cannot read Customer A's diary entry", otherRead.status === 404, otherRead.data);

    const otherDelete = await fetch(`${APP_URL}/api/diary/${diaryEntryId}`, { method: "DELETE", headers: { cookie: customerB.cookie } });
    check("Customer B cannot delete Customer A's diary entry", otherDelete.status === 404);

    const patch = await api(customerA.cookie, `/api/diary/${diaryEntryId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated title" }),
    });
    check("Customer A can edit their own diary entry", patch.data.entry?.title === "Updated title", patch.data);
  }

  console.log("\n=== 18/19. Review — eligible submission, then duplicate rejected ===");
  {
    const fixtureProjectId = "93000000-0000-0000-0000-000000000001"; // completed, no review yet (test fixture)
    const review = await api(customerA.cookie, "/api/reviews", {
      method: "POST",
      body: JSON.stringify({ projectId: fixtureProjectId, rating: 5, reviewText: "Wonderful work from the automated suite." }),
    });
    check("Customer A can submit a review for their own completed, unreviewed project", review.status === 200, review.data);

    const duplicate = await api(customerA.cookie, "/api/reviews", {
      method: "POST",
      body: JSON.stringify({ projectId: fixtureProjectId, rating: 3, reviewText: "Trying again." }),
    });
    check("A second review on the same project is rejected", duplicate.status === 409, duplicate.data);

    // Customer B trying to review Customer A's project.
    const otherReview = await api(customerB.cookie, "/api/reviews", {
      method: "POST",
      body: JSON.stringify({ projectId: fixtureProjectId, rating: 1, reviewText: "Not my project." }),
    });
    check("Customer B cannot review Customer A's project", otherReview.status >= 400, otherReview.data);

    // The already-seeded, already-reviewed project (91000000...0001) — a fresh attempt must also fail.
    const alreadyReviewed = await api(customerA.cookie, "/api/reviews", {
      method: "POST",
      body: JSON.stringify({ projectId: "91000000-0000-0000-0000-000000000001", rating: 4, reviewText: "Again." }),
    });
    check("Reviewing the seed data's already-reviewed project is rejected", alreadyReviewed.status === 409, alreadyReviewed.data);
  }

  console.log("\n=== Extra: saved items ===");
  {
    const toggleOn = await api(customerA.cookie, "/api/saved-items", {
      method: "POST",
      body: JSON.stringify({ itemType: "designer", itemId: "d1000000-0000-0000-0000-000000000001" }),
    });
    check("Customer A can save a designer", toggleOn.data.saved === true, toggleOn.data);
    const list = await api(customerA.cookie, "/api/saved-items");
    check("Saved designer appears in Customer A's saved items", list.data.items?.some((i) => i.itemType === "designer"));
    const toggleOff = await api(customerA.cookie, "/api/saved-items", {
      method: "POST",
      body: JSON.stringify({ itemType: "designer", itemId: "d1000000-0000-0000-0000-000000000001" }),
    });
    check("Toggling again unsaves it", toggleOff.data.saved === false);
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
