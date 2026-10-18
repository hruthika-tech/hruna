// LILIRVE — Storage/Uploads gap-fill test suite. Drives the REAL running app (real email + password sign-in;
// signup confirmation via Mailpit, real API routes) plus a couple of direct supabase-js calls (with the anon key, as a
// signed-in user) for adversarial RLS checks that must bypass the app's own routes entirely.
//
// Covers the fix made this pass: `files_select`/`request_images_select`/
// `project_update_images_select` and the storage.objects `request_images_read`/
// `project_updates_read` policies were either too restrictive (an eligible designer/customer
// couldn't see a shared image at all) or too permissive (the join-table policies were vacuous —
// "the parent row exists", not "the caller is related to it") — see
// supabase/migrations/20260902000001_fix_shared_image_visibility.sql for the full explanation.
// Also covers the avatar-replace orphan-cleanup fix (lib/supabase/storage.ts's
// deleteFileIfOwnedBy).
//
// Prereqs: `npm run db:start` + a fresh `npm run db:reset` + `npx next dev -p 3100` running.
// Run with: node scripts/test-storage-uploads.mjs

import { execSync } from "node:child_process";
import { APP_URL, signInWithPassword, registerAndConfirm, registerDirect } from "./lib/test-auth.mjs";

/** Read-only check against the LOCAL Supabase DB container (same helper as the Phase 10 suite). */
function sql(query) {
  return execSync(`docker exec -i supabase_db_lilirve-app psql -U postgres -d postgres -t -A -c "${query.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
  }).trim();
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

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

/** A BRAND-NEW account signed in directly with the anon-key supabase-js client (signUp + emailed
 *  confirmation token) — used for direct RLS checks against storage.objects that must bypass the
 *  app's own routes entirely. */
const signUpFreshDirect = async (email) => (await registerDirect(email)).client;

async function api(cookie, path, options = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function uploadImage(cookie, bucket, entityType) {
  const form = new FormData();
  form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "t.png");
  form.append("bucket", bucket);
  form.append("entityType", entityType);
  const res = await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  return res.json();
}

async function main() {
  console.log("\n=== Setup: sign in as personas ===");
  const aanya = await signIn("aanya@lilirve.dev"); // customer, request owner
  const meera = await signIn("meera@lilirve.dev"); // approved designer, eligible for public requests
  const ramesh = await signIn("ramesh@lilirve.dev"); // pending designer, not eligible

  // A second, freshly-created customer — needed for diary-isolation checks, since ramesh (a
  // designer with no customer profile at all) can't stand in for "a different customer" there.
  const freshCustomerEmail = `storage-customer-${Date.now()}@lilirve.dev`;
  const customerB = await signUpFresh(freshCustomerEmail);
  await api(customerB, "/api/profile/customer", { method: "POST", body: JSON.stringify({ name: "Storage Test Customer B" }) });

  console.log("\n=== 1/2. Eligible designer can now see a shared request image (was previously always empty) ===");
  let publicRequestId, requestImagePath;
  {
    const upload = await uploadImage(aanya, "requestImages", "request_image");
    check("   Request-image upload succeeds", !!upload.fileId, upload);

    const create = await api(aanya, "/api/requests", {
      method: "POST",
      body: JSON.stringify({ title: "Storage Test Public Request", category: "Occasion Wear", description: "x", budgetMin: 5000, budgetMax: 10000, dueDate: "2027-01-01", imageFileIds: [upload.fileId] }),
    });
    publicRequestId = create.data.request?.id;
    check("1. Owner (customer) sees the real image on their own request", (create.data.request?.inspirationImages ?? []).length === 1, create.data.request);
    requestImagePath = new URL(create.data.request.inspirationImages[0]).pathname.split("/request-images/")[1]?.split("?")[0];

    const designerView = await api(meera, `/api/requests/${publicRequestId}`);
    check("2. An eligible approved designer ALSO sees the real image (the bug this fix addresses)", (designerView.data.request?.inspirationImages ?? []).length === 1, designerView.data.request);
  }

  console.log("\n=== 3. A non-eligible designer still cannot see a DIRECTED (private) request at all ===");
  {
    const upload = await uploadImage(aanya, "requestImages", "request_image");
    const create = await api(aanya, "/api/requests", {
      method: "POST",
      body: JSON.stringify({ title: "Storage Test Private Request", category: "Occasion Wear", description: "x", budgetMin: 5000, budgetMax: 10000, dueDate: "2027-01-01", preferredDesignerId: "d1000000-0000-0000-0000-000000000001", imageFileIds: [upload.fileId] }),
    });
    const rameshView = await api(ramesh, `/api/requests/${create.data.request.id}`);
    check("3. A non-eligible (pending) designer cannot access a private request addressed to someone else", rameshView.status === 404, rameshView.data);
  }

  console.log("\n=== 4. An unrelated user cannot directly sign a URL for another customer's request-image ===");
  {
    const freshEmail = `storage-audit-${Date.now()}@lilirve.dev`;
    const freshClient = await signUpFreshDirect(freshEmail);
    const { data: signed, error } = await freshClient.storage.from("request-images").createSignedUrl(requestImagePath, 300);
    check("4. Direct storage.objects RLS denies an unrelated, freshly-signed-up user", !!error && !signed, { error: error?.message });
  }

  console.log("\n=== 5/6. Project-update images: both participants can see them, a third party cannot ===");
  {
    // Uses the seeded completed project (91000000...0001) between aanya (customer) and meera (designer).
    const create = await api(meera, `/api/projects/91000000-0000-0000-0000-000000000001/updates`, {
      method: "POST",
      body: JSON.stringify({ stage: "Fitting", note: "Storage test update." }),
    });
    check("   (setup) Designer can create a project update", create.status === 200, create.data);

    const customerView = await api(aanya, "/api/projects/91000000-0000-0000-0000-000000000001/updates");
    check("5. Customer (the other participant) can read the designer's update", (customerView.data.updates ?? []).some((u) => u.id === create.data.update?.id), customerView.data);

    const thirdPartyView = await api(ramesh, "/api/projects/91000000-0000-0000-0000-000000000001/updates");
    check("6. An unrelated designer cannot read this project's updates at all", (thirdPartyView.data.updates ?? []).length === 0, thirdPartyView.data);
  }

  console.log("\n=== 7. Diary images remain strictly owner-only (unaffected by this fix) ===");
  {
    const upload = await uploadImage(aanya, "diaryImages", "diary_image");
    const create = await api(aanya, "/api/diary", {
      method: "POST",
      body: JSON.stringify({ title: "Storage test diary entry", note: "x", mood: "Happy", imageFileIds: [upload.fileId] }),
    });
    check("   (setup) Customer can create a diary entry with an image", create.status === 200 && (create.data.entry?.images ?? []).length === 1, create.data);

    const otherView = await api(customerB, `/api/diary/${create.data.entry.id}`);
    check("7. A different customer cannot read someone else's diary entry at all", otherView.status === 404, otherView.data);
  }

  console.log("\n=== 8. Verification documents remain owner+admin only (unaffected by this fix) ===");
  {
    const admin = await signIn("admin@lilirve.dev");
    const upload = await uploadImage(ramesh, "verificationDocuments", "portfolio_item");
    check("   (setup) Designer can upload a portfolio/verification image", !!upload.fileId, upload);

    const adminBundle = await api(admin, "/api/admin/designers/d1000000-0000-0000-0000-000000000002");
    check("8. Admin CAN resolve portfolio images via the existing service-role-signed path", adminBundle.status === 200, { status: adminBundle.status });
  }

  console.log("\n=== 9/10. Avatar replace cleans up the old file (was previously an unbounded orphan) ===");
  {
    const first = await uploadImage(aanya, "avatars", "customer_avatar");
    const setFirst = await api(aanya, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ avatarFileId: first.fileId }) });
    check("   (setup) Customer sets their first avatar", setFirst.status === 200, setFirst.data);

    const firstAvatarUrl = setFirst.data.customerProfile?.avatar;

    const second = await uploadImage(aanya, "avatars", "customer_avatar");
    const setSecond = await api(aanya, "/api/profile/customer", { method: "PATCH", body: JSON.stringify({ avatarFileId: second.fileId }) });
    check("9. Customer can replace their avatar with a new upload", setSecond.status === 200 && !!setSecond.data.customerProfile?.avatar && setSecond.data.customerProfile.avatar !== firstAvatarUrl, setSecond.data);

    // The OLD file's storage object should be gone now (deleteFileIfOwnedBy) — verified directly:
    // the old avatar's public URL, while still a resolvable path shape, now 404s because the
    // underlying object was actually removed from Storage, not just unlinked.
    const oldObjectRes = firstAvatarUrl ? await fetch(firstAvatarUrl) : null;
    check("10. The OLD avatar's storage object was actually deleted (no orphan left behind)", !!oldObjectRes && oldObjectRes.status === 400, { status: oldObjectRes?.status });
  }

  console.log("\n=== 11/12. Upload validation — file type and size ===");
  {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("not an image")], { type: "text/plain" }), "x.txt");
    form.append("bucket", "avatars");
    form.append("entityType", "customer_avatar");
    const res = await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie: aanya }, body: form });
    check("11. A non-image file is rejected", res.status === 400);

    const oversized = Buffer.alloc(11 * 1024 * 1024, 1); // 11MB > the 10MB limit
    const bigForm = new FormData();
    bigForm.append("file", new Blob([oversized], { type: "image/png" }), "big.png");
    bigForm.append("bucket", "avatars");
    bigForm.append("entityType", "customer_avatar");
    const bigRes = await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie: aanya }, body: bigForm });
    check("12. An oversized file is rejected", bigRes.status === 400);
  }

  console.log("\n=== 13. Unauthenticated upload attempts are rejected ===");
  {
    const form = new FormData();
    form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "t.png");
    form.append("bucket", "avatars");
    form.append("entityType", "customer_avatar");
    const res = await fetch(`${APP_URL}/api/uploads`, { method: "POST", body: form });
    check("13. Unauthenticated upload is rejected (401)", res.status === 401);
  }

  console.log("\n=== 14. Request images must be the customer's OWN uploads in request-images ===");
  {
    const createWith = (imageFileIds, title) =>
      api(aanya, "/api/requests", {
        method: "POST",
        body: JSON.stringify({ title, category: "Occasion Wear", description: "x", budgetMin: 5000, budgetMax: 10000, dueDate: "2027-01-01", imageFileIds }),
      });
    const genericRejection = (res) => res.status === 400 && res.data.message === "One or more images couldn't be used. Please upload them again.";

    const own = await uploadImage(aanya, "requestImages", "request_image");
    const ok = await createWith([own.fileId], "Ownership test — own image");
    check("14a. A customer can attach their own request-images upload", ok.status === 200 && (ok.data.request?.inspirationImages ?? []).length === 1, ok.data);

    const foreign = await uploadImage(customerB, "requestImages", "request_image");
    const stolen = await createWith([foreign.fileId], "Ownership test — foreign file");
    check("14b. Attaching ANOTHER customer's request image is rejected (generic message, nothing about the file)", genericRejection(stolen) && !JSON.stringify(stolen.data).includes(foreign.fileId), stolen.data);

    const diary = await uploadImage(aanya, "diaryImages", "diary_image");
    const wrongBucket = await createWith([diary.fileId], "Ownership test — wrong bucket");
    check("14c. Attaching the customer's own file from a DIFFERENT bucket (diary-images) is rejected", genericRejection(wrongBucket), wrongBucket.data);

    const missing = await createWith(["00000000-0000-4000-8000-0000000000aa"], "Ownership test — nonexistent");
    check("14d. A nonexistent file id is rejected", genericRejection(missing), missing.data);

    const malformed = await createWith(["not-a-uuid"], "Ownership test — malformed");
    check("    A malformed file id is rejected cleanly (400, not a 500)", genericRejection(malformed), malformed.data);

    const mixedTitle = `Ownership test — mixed ${Date.now()}`;
    const own2 = await uploadImage(aanya, "requestImages", "request_image");
    const mixed = await createWith([own2.fileId, foreign.fileId], mixedTitle);
    check("14e. A mix of valid + invalid ids rejects the whole request", genericRejection(mixed), mixed.data);
    const createdRows = sql(`select count(*) from public.fashion_requests where title = '${mixedTitle.replace(/'/g, "''")}';`);
    check("     ...and NO request row was created", createdRows === "0", { createdRows });
    const linkedRows = sql(`select count(*) from public.request_images where file_id in ('${own2.fileId}', '${foreign.fileId}');`);
    check("     ...and NO request_images association exists for either file", linkedRows === "0", { linkedRows });
    const foreignEverLinked = sql(`select count(*) from public.request_images where file_id = '${foreign.fileId}';`);
    check("     ...and the other customer's file was never linked by any attempt above", foreignEverLinked === "0", { foreignEverLinked });
  }

  console.log("\n=== 15. Upload entityType is allowlisted, pinned to its bucket and role, path built server-side ===");
  {
    const uploadRaw = async (cookie, fields) => {
      const form = new FormData();
      form.append("file", new Blob([PNG_BYTES], { type: "image/png" }), "t.png");
      for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v);
      const res = await fetch(`${APP_URL}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
      return { status: res.status, data: await res.json().catch(() => ({})) };
    };
    const ids = Object.fromEntries(
      sql("select email || '=' || id from auth.users where email in ('aanya@lilirve.dev','meera@lilirve.dev');").split("\n").map((l) => l.split("="))
    );
    const bucketIds = { avatars: "avatars", requestImages: "request-images", diaryImages: "diary-images", projectUpdates: "project-updates", studioImages: "studio-images", verificationDocuments: "verification-documents" };

    const VALID = [
      ["customer_avatar", "avatars", aanya, "aanya@lilirve.dev"],
      ["request_image", "requestImages", aanya, "aanya@lilirve.dev"],
      ["diary_image", "diaryImages", aanya, "aanya@lilirve.dev"],
      ["designer_avatar", "avatars", meera, "meera@lilirve.dev"],
      ["studio_banner", "studioImages", meera, "meera@lilirve.dev"],
      ["studio_highlight", "studioImages", meera, "meera@lilirve.dev"],
      ["meet_the_designer", "studioImages", meera, "meera@lilirve.dev"],
      ["dress_image", "studioImages", meera, "meera@lilirve.dev"],
      ["previous_creation", "studioImages", meera, "meera@lilirve.dev"],
      ["collection_cover", "studioImages", meera, "meera@lilirve.dev"],
      ["project_update_image", "projectUpdates", meera, "meera@lilirve.dev"],
      ["portfolio_item", "verificationDocuments", meera, "meera@lilirve.dev"],
    ];
    for (const [type, bucket, who, email] of VALID) {
      const r = await uploadRaw(who, { bucket, entityType: type });
      const row = r.data.fileId
        ? sql(`select entity_type || '|' || bucket_id || '|' || storage_path from public.files where id = '${r.data.fileId}';`).split("|")
        : [];
      const pathOk = (row[2] ?? "").startsWith(`${ids[email]}/${type}/`) && /^[0-9a-f-]{36}\.png$/.test((row[2] ?? "").split("/")[2] ?? "");
      check(`15a. ${type} → ${bucket}: accepted, stored with that type/bucket under the uploader's own path`, r.status === 200 && row[0] === type && row[1] === bucketIds[bucket] && pathOk, { status: r.status, row });
    }

    const before = sql("select count(*) from public.files;");
    const BAD_TYPES = [
      ["missing", undefined],
      ["empty", ""],
      ["the old default 'upload'", "upload"],
      ["unknown", "profile_banner"],
      ["path traversal", "../meera"],
      ["nested path", "customer_avatar/../../x"],
      ["wrong case", "CUSTOMER_AVATAR"],
      ["prototype key", "__proto__"],
      ["inherited key", "toString"],
    ];
    for (const [label, entityType] of BAD_TYPES) {
      const r = await uploadRaw(aanya, { bucket: "avatars", entityType });
      check(`15b. ${label} entityType → 400`, r.status === 400 && r.data.message === "Unknown or unsupported upload type.", r);
    }

    const MISMATCH = [
      ["a request image into the public avatars bucket", "request_image", "avatars"],
      ["an avatar into the private request-images bucket", "customer_avatar", "requestImages"],
      ["a diary-bucket file labelled request_image (would gain request visibility)", "request_image", "diaryImages"],
      ["a project-update label on a request image", "project_update_image", "requestImages"],
      ["no bucket at all", "customer_avatar", undefined],
    ];
    for (const [label, entityType, bucket] of MISMATCH) {
      const r = await uploadRaw(entityType === "project_update_image" ? meera : aanya, { bucket, entityType });
      check(`15c. Rejects ${label} → 400`, r.status === 400 && r.data.message === "That upload type doesn't belong in that location.", r);
    }

    const customerAsDesigner = await uploadRaw(aanya, { bucket: "studioImages", entityType: "studio_highlight" });
    check("15d. A customer (no designer profile) can't upload studio images → 403", customerAsDesigner.status === 403, customerAsDesigner);
    const customerDesignerAvatar = await uploadRaw(aanya, { bucket: "avatars", entityType: "designer_avatar" });
    check("     …nor a designer avatar → 403", customerDesignerAvatar.status === 403, customerDesignerAvatar);
    const customerPortfolio = await uploadRaw(aanya, { bucket: "verificationDocuments", entityType: "portfolio_item" });
    check("     …nor verification/portfolio documents → 403", customerPortfolio.status === 403, customerPortfolio);
    const pendingDesigner = await uploadRaw(ramesh, { bucket: "studioImages", entityType: "studio_highlight" });
    check("15e. A pending designer (has a designer profile) can still upload studio images", pendingDesigner.status === 200, pendingDesigner);
    const admin = await signIn("admin@lilirve.dev");
    const adminCustomer = await uploadRaw(admin, { bucket: "avatars", entityType: "customer_avatar" });
    check("15f. An admin can't upload as a customer → 403", adminCustomer.status === 403, adminCustomer);
    const adminDesigner = await uploadRaw(admin, { bucket: "studioImages", entityType: "studio_banner" });
    check("     …nor as a designer → 403", adminDesigner.status === 403, adminDesigner);
    const anon = await uploadRaw("", { bucket: "avatars", entityType: "customer_avatar" });
    check("15g. Unauthenticated → 401 (checked before anything else)", anon.status === 401, anon);

    const after = sql("select count(*) from public.files;");
    check("15h. None of the rejected attempts created a files row (only the one allowed pending-designer upload)", Number(after) === Number(before) + 1, { before, after });
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
