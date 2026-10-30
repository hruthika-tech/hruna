// LILIRVE — Phase 4 customer backend test suite (§28 of the brief, all 19 items + a few extra
// RLS adversarial checks in the same spirit as Phase 1/3's suites). Drives the REAL running app
// (real email + password sign-in, real API routes, real middleware) plus a couple of direct
// supabase-js calls for adversarial RLS checks that must bypass the friendly API entirely.
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + supabase/test-fixtures/phase4-review.sql applied +
// `npx next dev -p 3100` running. Run with: node scripts/test-phase4-customer.mjs

import { APP_URL, signInWithPassword, registerAndConfirm, rawClientFromCookie, assertLocalTestEnvironment } from "./lib/test-auth.mjs";
import { messageSide } from "../lib/messaging/alignment.ts";

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

  console.log("\n=== Registration → profile → request (no re-entry, nothing lost, nothing leaked) ===");
  {
    const regName = "Registered Rhea";
    const regEmail = `phase4-reg-${Date.now()}@lilirve.dev`;
    const fresh = await signUpFresh(regEmail);
    // A second, explicitly named registration — the account under test.
    const reg = await registerAndConfirm(`phase4-named-${Date.now()}@lilirve.dev`, regName);
    const named = { cookie: reg.cookie, raw: await rawClientFromCookie(reg.cookie) };

    const sess = await api(named.cookie, "/api/auth/session");
    check("Session API returns the caller's own registration name", sess.data.name === regName, sess.data);
    check("A freshly registered account has no customer profile yet", sess.data.hasCustomerProfile === false, sess.data);

    const noProfileGet = await api(named.cookie, "/api/profile/customer");
    check("GET profile before setup -> customerProfile:null (nothing to edit yet)", noProfileGet.status === 200 && noProfileGet.data.customerProfile === null, noProfileGet.data);

    // A request attempted BEFORE the profile exists: refused with a recognisable code, and nothing saved.
    const requestBody = {
      title: "Before-profile request",
      category: "Occasion Wear",
      description: "Created before the customer profile existed.",
      budgetMin: 5000,
      budgetMax: 9000,
      dueDate: "2027-02-01",
      imageFileIds: [],
    };
    const early = await api(named.cookie, "/api/requests", { method: "POST", body: JSON.stringify(requestBody) });
    check("POST /api/requests without a profile -> 403 customer_profile_required", early.status === 403 && early.data.code === "customer_profile_required", early.data);
    const earlyList = await api(named.cookie, "/api/requests");
    check("GET /api/requests without a profile -> 403 customer_profile_required", earlyList.status === 403 && earlyList.data.code === "customer_profile_required", earlyList.data);
    const { data: strayRows } = await named.raw.from("fashion_requests").select("id").eq("title", requestBody.title);
    check("No request row was written by the refused attempt", (strayRows ?? []).length === 0, strayRows);

    // Profile setup with NO fields re-entered: populated from registration, linked to this user.
    const created = await api(named.cookie, "/api/profile/customer", { method: "POST", body: "{}" });
    check("POST profile with an empty body -> 200, named from registration", created.status === 200 && created.data.customerProfile?.name === regName, created.data);
    check("New profile's user_id is the signed-in user's id", created.data.customerProfile?.user_id === sess.data.userId, created.data);

    // Existing profile is loaded/edited, never duplicated or overwritten by a blank re-submission.
    await api(named.cookie, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ name: "Rhea Edited", city: "Pune" }) });
    const again = await api(named.cookie, "/api/profile/customer", { method: "POST", body: "{}" });
    check("Re-POSTing an empty body keeps the existing profile's edited name", again.status === 200 && again.data.customerProfile?.name === "Rhea Edited" && again.data.customerProfile?.city === "Pune", again.data);
    check("…and it is the SAME profile row (no duplicate)", again.data.customerProfile?.id === created.data.customerProfile?.id, again.data);
    const loaded = await api(named.cookie, "/api/profile/customer");
    check("GET profile now loads the existing profile for editing", loaded.data.customerProfile?.id === created.data.customerProfile?.id && loaded.data.customerProfile?.name === "Rhea Edited", loaded.data);
    const { data: ownProfiles } = await named.raw.from("customer_profiles").select("id");
    check("Exactly one customer profile is visible to this user", (ownProfiles ?? []).length === 1, ownProfiles);

    // Retrying the same request after profile completion: saved once, listed once, owned by this profile.
    const late = await api(named.cookie, "/api/requests", { method: "POST", body: JSON.stringify(requestBody) });
    check("POST /api/requests after profile setup -> 200", late.status === 200 && !!late.data.request?.id, late.data);
    const lateId = late.data.request?.id;
    const list = await api(named.cookie, "/api/requests");
    const matches = (list.data.requests ?? []).filter((r) => r.id === lateId);
    check("My requests lists the new request exactly once", list.status === 200 && matches.length === 1 && list.data.requests.length === 1, list.data);
    const { data: ownerRow } = await named.raw.from("fashion_requests").select("customer_id").eq("id", lateId).maybeSingle();
    check("The request is owned by this user's customer profile", ownerRow?.customer_id === created.data.customerProfile?.id, ownerRow);

    // Never exposed to another user.
    const other = await api(fresh.cookie, `/api/requests/${lateId}`);
    check("A different account cannot read it", other.status === 403 || other.status === 404, other.data);
    const otherA = await api(customerA.cookie, `/api/requests/${lateId}`);
    check("Another customer gets 404 for it", otherA.status === 404, otherA.data);
    const otherList = await api(customerA.cookie, "/api/requests");
    check("…and it isn't in another customer's list", !(otherList.data.requests ?? []).some((r) => r.id === lateId));

    // Designer onboarding stays separate, and admins never gain a customer role.
    const freshSess = await api(fresh.cookie, "/api/auth/session");
    check("Profile setup for one account doesn't create a profile for another", freshSess.data.hasCustomerProfile === false, freshSess.data);
    const admin = await signIn("admin@lilirve.dev");
    const adminCreate = await api(admin.cookie, "/api/profile/customer", { method: "POST", body: "{}" });
    check("Admin POST profile (empty body) is refused -> 403", adminCreate.status === 403, adminCreate.data);
    const adminSess = await api(admin.cookie, "/api/auth/session");
    check("Admin still has no customer profile", adminSess.data.hasCustomerProfile === false, adminSess.data);
  }

  console.log("\n=== A designer who is ALSO a customer sees a public request in the feed, never in their own My Requests ===");
  let creator;
  let creatorProfileId;
  {
    // Mirrors the reported case: account 1 creates a public request; account 2 (an approved designer
    // that also has its own customer profile) can see it in the designer feed — but it belongs to
    // account 1's My Requests only.
    const reg = await registerAndConfirm(`phase4-creator-${Date.now()}@lilirve.dev`, "Creator Customer");
    creator = { cookie: reg.cookie, raw: await rawClientFromCookie(reg.cookie) };
    const profile = await api(creator.cookie, "/api/profile/customer", { method: "POST", body: "{}" });
    creatorProfileId = profile.data.customerProfile?.id;

    const created = await api(creator.cookie, "/api/requests", {
      method: "POST",
      body: JSON.stringify({ title: "lehanga choli (test)", category: "Bridal", description: "Public request.", budgetMin: 1000, budgetMax: 2000, dueDate: "2027-03-01", imageFileIds: [] }),
    });
    const reqId = created.data.request?.id;
    check("Creator's public request is created", created.status === 200 && !!reqId, created.data);

    const designer = await signIn("meera@lilirve.dev");
    const designerAsCustomer = await api(designer.cookie, "/api/profile/customer", { method: "POST", body: JSON.stringify({ name: "Meera (customer side)" }) });
    check("Approved designer can also hold a separate customer profile", designerAsCustomer.status === 200, designerAsCustomer.data);

    const feed = await api(designer.cookie, "/api/designer/feed");
    check("The request is visible in the approved designer's feed", (feed.data.requests ?? []).some((r) => r.id === reqId), feed.data);
    const designerOwn = await api(designer.cookie, "/api/requests");
    check("…but NOT in that designer account's own My Requests", designerOwn.status === 200 && !(designerOwn.data.requests ?? []).some((r) => r.id === reqId), designerOwn.data);

    const mine = await api(creator.cookie, "/api/requests");
    const list = mine.data.requests ?? [];
    check("The creator's My Requests lists it exactly once", list.filter((r) => r.id === reqId).length === 1 && list.length === 1, list);
    check("Every listed request belongs to the creator's own customer profile", list.every((r) => r.customerId === creatorProfileId), list);
    check("Status counts match the returned requests (1 submitted, 0 others)", list.filter((r) => r.status === "submitted").length === 1 && list.filter((r) => r.status !== "submitted").length === 0, list);
  }

  console.log("\n=== Customer avatar: persists, loads in header + profile, owner-only ===");
  {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const upload = async (who, bucket, entityType) => {
      const form = new FormData();
      form.append("file", new Blob([png], { type: "image/png" }), "a.png");
      form.append("bucket", bucket);
      form.append("entityType", entityType);
      const res = await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie: who.cookie }, body: form });
      return res.json();
    };

    const avatarFile = await upload(creator, "avatars", "customer_avatar");
    check("Customer uploads an avatar", !!avatarFile.fileId, avatarFile);
    const set = await api(creator.cookie, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ avatarFileId: avatarFile.fileId }) });
    const avatarUrl = set.data.customerProfile?.avatar ?? "";
    check("Saving it returns a real avatar URL", set.status === 200 && avatarUrl.includes("/avatars/"), set.data);

    const img = await fetch(avatarUrl);
    check("The avatar URL actually loads as an image", img.status === 200 && (img.headers.get("content-type") ?? "").startsWith("image/"), { status: img.status });

    const fileName = avatarUrl.split("/").pop();
    const page = await fetch(`${APP_URL}/profile`, { headers: { cookie: creator.cookie } });
    const html = await page.text();
    check("The customer header/profile page renders that same avatar", page.status === 200 && html.includes(fileName), { status: page.status });

    const finishAgain = await api(creator.cookie, "/api/profile/customer", { method: "POST", body: "{}" });
    check("Re-running profile setup (no avatar sent) keeps the avatar", finishAgain.data.customerProfile?.avatar_file_id === avatarFile.fileId, finishAgain.data);
    const rename = await api(creator.cookie, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ name: "Creator Renamed" }) });
    check("Editing other fields keeps the avatar", rename.data.customerProfile?.avatar === avatarUrl, rename.data);
    const reload = await api(creator.cookie, "/api/profile/customer");
    check("Avatar persists across reloads", reload.data.customerProfile?.avatar === avatarUrl, reload.data);

    // Ownership: nobody can adopt another user's file, and a private-bucket file can't become a photo.
    const other = await signIn("meera@lilirve.dev");
    const steal = await api(other.cookie, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ avatarFileId: avatarFile.fileId }) });
    check("Another user cannot set someone else's file as their customer avatar", steal.status === 400, steal.data);
    const stealDesigner = await api(other.cookie, "/api/designer/profile", { method: "PATCH", body: JSON.stringify({ avatarFileId: avatarFile.fileId }) });
    check("…nor as their designer avatar", stealDesigner.status === 400, stealDesigner.data);
    const privateFile = await upload(creator, "requestImages", "request_image");
    const wrongBucket = await api(creator.cookie, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ avatarFileId: privateFile.fileId }) });
    check("A private request-image file can't be used as an avatar", wrongBucket.status === 400, wrongBucket.data);
    const stillMine = await api(creator.cookie, "/api/profile/customer");
    check("…and the rejected attempts leave the real avatar untouched", stillMine.data.customerProfile?.avatar === avatarUrl, stillMine.data);

    // The designer profile page's own uploads are recorded as designer avatars (not customer ones).
    const designerFile = await upload(other, "avatars", "designer_avatar");
    const designerSet = await api(other.cookie, "/api/designer/profile", { method: "PATCH", body: JSON.stringify({ avatarFileId: designerFile.fileId }) });
    check("A designer can set their own designer_avatar upload", designerSet.status === 200 && (designerSet.data.profile?.avatar ?? "").includes("/designer_avatar/"), designerSet.data);

    const removed = await api(creator.cookie, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ avatarFileId: null }) });
    check("Removing the photo clears it (UI falls back to the default avatar)", removed.status === 200 && removed.data.customerProfile?.avatar === "", removed.data);
  }

  console.log("\n=== Messaging: sides by sender id, one card per pair, previews update, no self-conversations ===");
  {
    const MEERA_DESIGNER_ID = "d1000000-0000-0000-0000-000000000001";
    const reg = await registerAndConfirm(`phase4-chat-${Date.now()}@lilirve.dev`, "Chat Customer");
    const chatter = { cookie: reg.cookie, raw: await rawClientFromCookie(reg.cookie) };
    const chatterProfile = (await api(chatter.cookie, "/api/profile/customer", { method: "POST", body: "{}" })).data.customerProfile;
    const designer = await signIn("meera@lilirve.dev");
    const customerUserId = (await api(chatter.cookie, "/api/auth/session")).data.userId;
    const designerUserId = (await api(designer.cookie, "/api/auth/session")).data.userId;
    // Exactly the rule both inbox pages render with.
    const sides = (msgs, viewerUserId) => Object.fromEntries((msgs ?? []).map((m) => [m.text, messageSide(m.senderId, viewerUserId)]));

    const open1 = await api(chatter.cookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: MEERA_DESIGNER_ID }) });
    const open2 = await api(chatter.cookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: MEERA_DESIGNER_ID }) });
    const convId = open1.data.conversationId;
    check("Opening a conversation twice returns the SAME conversation", open1.status === 200 && convId && open2.data.conversationId === convId, [open1.data, open2.data]);
    const fromDesignerSide = await api(designer.cookie, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: chatterProfile.id }) });
    check("…and the designer opening it from their side gets that same conversation", fromDesignerSide.data.conversationId === convId, fromDesignerSide.data);

    const m1 = await api(chatter.cookie, `/api/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ text: "chat-1 from customer" }) });
    check("Customer's message is stored with the customer's own user id as sender", m1.status === 200 && m1.data.message?.senderId === customerUserId, m1.data);
    const m2 = await api(designer.cookie, `/api/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ text: "chat-2 from designer" }) });
    check("Designer's reply is stored with the designer's own user id as sender", m2.status === 200 && m2.data.message?.senderId === designerUserId, m2.data);

    for (const round of ["first load", "after reload"]) {
      const cView = sides((await api(chatter.cookie, `/api/conversations/${convId}/messages`)).data.messages, customerUserId);
      const dView = sides((await api(designer.cookie, `/api/conversations/${convId}/messages`)).data.messages, designerUserId);
      check(`Customer screen (${round}): own message right, designer's reply left`, cView["chat-1 from customer"] === "right" && cView["chat-2 from designer"] === "left", cView);
      check(`Designer screen (${round}): own reply right, customer's message left`, dView["chat-2 from designer"] === "right" && dView["chat-1 from customer"] === "left", dView);
    }

    // This customer has no request/project with the designer — the "messaged from a dress page" case.
    const { data: seenProfile } = await designer.raw.from("customer_profiles").select("id, name").eq("id", chatterProfile.id);
    check("After the customer messages them, the designer can see that customer's name", seenProfile?.[0]?.name === "Chat Customer", seenProfile);

    // Privacy + start rules: a designer can't open a conversation with an unrelated customer (no
    // request/project/proposal), neither through the API nor directly against the database, and
    // can't read that customer's profile (e.g. phone) before the customer makes contact.
    const quietReg = await registerAndConfirm(`phase4-quiet-${Date.now()}@lilirve.dev`, "Quiet Customer");
    const quiet = { cookie: quietReg.cookie, raw: await rawClientFromCookie(quietReg.cookie) };
    const quietProfile = (await api(quiet.cookie, "/api/profile/customer", { method: "POST", body: JSON.stringify({ phone: "+91 90000 00000" }) })).data.customerProfile;
    const coldOpen = await api(designer.cookie, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: quietProfile.id }) });
    check("Designer → unrelated customer: API refuses to start a conversation (403)", coldOpen.status === 403, coldOpen.data);
    const coldInsert = await designer.raw.from("conversations").insert({ customer_id: quietProfile.id, designer_id: MEERA_DESIGNER_ID });
    check("…and the database policy refuses a direct insert too", !!coldInsert.error, coldInsert.error ?? "insert succeeded");
    const { data: quietSeen } = await designer.raw.from("customer_profiles").select("id, phone").eq("id", quietProfile.id);
    check("The designer can't read that customer's profile or phone", (quietSeen ?? []).length === 0, quietSeen);
    const { data: quietConvs } = await quiet.raw.from("conversations").select("id");
    check("No conversation was created for that customer", (quietConvs ?? []).length === 0, quietConvs);
    const badId = await api(designer.cookie, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: "not-a-uuid" }) });
    check("A malformed customer id is a clean 400", badId.status === 400, badId.data);

    // The rule only answers for the caller's own side.
    const { data: proxyAnswer } = await customerA.raw.rpc("can_start_conversation", { p_customer_id: quietProfile.id, p_designer_id: MEERA_DESIGNER_ID });
    check("can_start_conversation() is false for a pair the caller isn't part of", proxyAnswer === false, proxyAnswer);

    // An OPEN public request makes the customer reachable by approved designers — not by a pending one.
    const openReq = await api(quiet.cookie, "/api/requests", {
      method: "POST",
      body: JSON.stringify({ title: "Open public request", category: "Bridal", description: "Looking for a designer.", budgetMin: 1000, budgetMax: 2000, dueDate: "2027-04-01", imageFileIds: [] }),
    });
    const pendingDesigner = await signIn("ramesh@lilirve.dev");
    const pendingOpen = await api(pendingDesigner.cookie, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: quietProfile.id }) });
    check("A pending (unapproved) designer still can't start one from a public request (403)", pendingOpen.status === 403, pendingOpen.data);
    const approvedOpen = await api(designer.cookie, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: quietProfile.id }) });
    check("An approved designer CAN message the customer about their open public request", openReq.status === 200 && approvedOpen.status === 200 && !!approvedOpen.data.conversationId, approvedOpen.data);

    // Once the request is no longer open, a NEW conversation can't be started from it — but the
    // existing one stays available to both participants.
    const closeReq = await quiet.raw.from("fashion_requests").update({ status: "cancelled" }).eq("id", openReq.data.request?.id).select("status");
    check("   (setup) the customer cancels their request", closeReq.data?.[0]?.status === "cancelled", closeReq.error ?? closeReq.data);
    const reopen = await api(designer.cookie, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: quietProfile.id }) });
    check("The existing conversation still reopens for the designer (same id)", reopen.status === 200 && reopen.data.conversationId === approvedOpen.data.conversationId, reopen.data);
    const { data: stillAllowedNew } = await designer.raw.rpc("can_start_conversation", { p_customer_id: quietProfile.id, p_designer_id: MEERA_DESIGNER_ID });
    check("…but a closed request alone no longer allows starting a new one", stillAllowedNew === false, stillAllowedNew);

    // Customer-initiated contact: approved designers yes; a pending designer with no relationship no.
    const toPending = await api(quiet.cookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: "d1000000-0000-0000-0000-000000000002" }) });
    check("Customer → pending designer with no relationship: refused (403)", toPending.status === 403, toPending.data);
    const toApproved = await api(quiet.cookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: MEERA_DESIGNER_ID }) });
    check("Customer → approved designer: allowed (returns their existing conversation)", toApproved.status === 200 && toApproved.data.conversationId === approvedOpen.data.conversationId, toApproved.data);
    const badDesigner = await api(quiet.cookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: "nope" }) });
    check("A malformed designer id is a clean 400", badDesigner.status === 400, badDesigner.data);

    const m3 = await api(chatter.cookie, `/api/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ text: "chat-3 latest" }) });
    const designerInbox = (await api(designer.cookie, "/api/designer/conversations")).data.conversations ?? [];
    const cards = designerInbox.filter((c) => c.customerId === chatterProfile.id);
    check("Designer inbox: exactly ONE card for this customer (named, so it renders) after several messages", cards.length === 1 && cards[0].id === convId && cards[0].customer?.name === "Chat Customer", cards);
    check("…showing the latest message and its timestamp", cards[0]?.lastMessage === "chat-3 latest" && new Date(cards[0]?.lastTimestamp).getTime() === new Date(m3.data.message?.timestamp).getTime(), { card: cards[0], sent: m3.data.message });
    check("…and it's at the top of the designer's inbox (newest first)", designerInbox[0]?.id === convId, designerInbox.map((c) => c.id));
    const customerInbox = (await api(chatter.cookie, "/api/conversations")).data.conversations ?? [];
    check("Customer inbox: exactly ONE card for this designer, with the latest message", customerInbox.filter((c) => c.designerId === MEERA_DESIGNER_ID).length === 1 && customerInbox[0]?.lastMessage === "chat-3 latest", customerInbox);
    const { data: convRows } = await chatter.raw.from("conversations").select("id");
    check("Still only one conversation row for this pair (sending never creates another)", (convRows ?? []).length === 1, convRows);

    // Other pairs stay separate, and private.
    const aanyaCard = designerInbox.find((c) => c.customerId !== chatterProfile.id);
    check("A different customer's conversation with the same designer remains its own card", !!aanyaCard && aanyaCard.id !== convId && aanyaCard.lastMessage !== "chat-3 latest", designerInbox);
    const peek = await api(customerA.cookie, `/api/conversations/${convId}/messages`);
    check("Another customer can't read this conversation", (peek.data.messages ?? []).length === 0, peek.data);
    const intrude = await api(customerA.cookie, `/api/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify({ text: "intrusion" }) });
    check("…or post into it", intrude.status >= 400, intrude.data);
    const otherDesigner = await signIn("ramesh@lilirve.dev");
    const otherDesignerPeek = await api(otherDesigner.cookie, `/api/conversations/${convId}/messages`);
    check("Another designer can't read it either", (otherDesignerPeek.data.messages ?? []).length === 0, otherDesignerPeek.data);
    const otherDesignerInbox = (await api(otherDesigner.cookie, "/api/designer/conversations")).data.conversations ?? [];
    check("…and it isn't in that designer's inbox", !otherDesignerInbox.some((c) => c.id === convId), otherDesignerInbox);
    const forged = await chatter.raw.from("messages").insert({ conversation_id: convId, sender_id: designerUserId, text: "forged as designer" });
    check("RLS: a participant can't insert a message under the other participant's sender id", !!forged.error, forged.error ?? "insert succeeded");

    // An account with BOTH profiles must not open a conversation with itself (the reported "two
    // M.HRUTHIKA cards / everything on the right" case).
    const designerAsCustomer = (await api(designer.cookie, "/api/profile/customer", { method: "POST", body: JSON.stringify({ name: "Meera (customer side)" }) })).data.customerProfile;
    const selfFromCustomer = await api(designer.cookie, "/api/conversations", { method: "POST", body: JSON.stringify({ designerId: MEERA_DESIGNER_ID }) });
    check("Self-conversation refused from the customer side → 400", selfFromCustomer.status === 400 && /your own studio/.test(selfFromCustomer.data.message ?? ""), selfFromCustomer.data);
    const selfFromDesigner = await api(designer.cookie, "/api/designer/conversations", { method: "POST", body: JSON.stringify({ customerId: designerAsCustomer?.id }) });
    check("Self-conversation refused from the designer side → 400", selfFromDesigner.status === 400 && /your own customer profile/.test(selfFromDesigner.data.message ?? ""), selfFromDesigner.data);
    const ownCards = ((await api(designer.cookie, "/api/designer/conversations")).data.conversations ?? []).filter((c) => c.customerId === designerAsCustomer?.id);
    check("…and no self-conversation card exists", ownCards.length === 0, ownCards);
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
