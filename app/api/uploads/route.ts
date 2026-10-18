/**
 * Generic authenticated file upload — the one place any customer-facing upload surface (avatar,
 * request images, diary images) goes through. Uses the AUTHENTICATED server client throughout
 * (never lib/supabase/admin.ts), so Supabase Storage's own storage.objects RLS policies
 * (supabase/migrations/20260829180014_storage.sql) are the real gate on what bucket/path a given
 * user can write to — this route doesn't re-decide that, it just uploads as the calling user and
 * lets Storage accept or reject it.
 *
 * Every object is written under `${user.id}/${entityType}/<random uuid>.<ext>` — built entirely
 * server-side (the user id from the session, the entity type only from the allowlist below), which
 * is the exact path-prefix convention every bucket's storage.objects INSERT policy requires.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotAdmin, requireUser } from "@/lib/supabase/authorization";
import { AuthorizationError, errorResponse } from "@/lib/supabase/errors";
import { STORAGE_BUCKETS, getPublicFileUrl, type StorageBucketKey } from "@/lib/supabase/storage";
import type { TablesInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Every upload surface wired up so far (Phase 4 customer + Phase 5 designer). Actual write
// eligibility for each bucket is still enforced by storage.objects RLS (every policy requires the
// object path to start with the caller's own auth uid) — this list only says "is this a bucket
// meant for browser uploads at all" (verification-documents' path convention matches too, even
// though the only writer there right now is the designer onboarding portfolio flow).
const ALLOWED_BUCKETS: StorageBucketKey[] = [
  "avatars",
  "requestImages",
  "diaryImages",
  "projectUpdates",
  "studioImages",
  "verificationDocuments",
];

// Every legitimate upload category in the app, each pinned to the ONE bucket its flow uses and the
// role allowed to make it. files.entity_type is not just a label — files_select RLS grants other
// users read access by it ('request_image', 'project_update_image'), so a client must never be able
// to pick a type that doesn't match the bucket/role (e.g. call a diary image a request image).
//   customer — any non-admin signed-in user (a customer profile may not exist yet: onboarding's
//              avatar and the new-request form upload before it's created);
//   designer — the caller must have a designer profile (designer onboarding creates it first).
// Admin accounts never upload as a customer or designer (role separation — see assertNotAdmin).
const UPLOAD_TYPES = {
  customer_avatar: { bucket: "avatars", role: "customer" },
  request_image: { bucket: "requestImages", role: "customer" },
  diary_image: { bucket: "diaryImages", role: "customer" },
  designer_avatar: { bucket: "avatars", role: "designer" },
  studio_banner: { bucket: "studioImages", role: "designer" },
  studio_highlight: { bucket: "studioImages", role: "designer" },
  meet_the_designer: { bucket: "studioImages", role: "designer" },
  dress_image: { bucket: "studioImages", role: "designer" },
  previous_creation: { bucket: "studioImages", role: "designer" },
  collection_cover: { bucket: "studioImages", role: "designer" },
  project_update_image: { bucket: "projectUpdates", role: "designer" },
  portfolio_item: { bucket: "verificationDocuments", role: "designer" },
} as const satisfies Record<string, { bucket: StorageBucketKey; role: "customer" | "designer" }>;
type UploadType = keyof typeof UPLOAD_TYPES;

function isUploadType(value: unknown): value is UploadType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(UPLOAD_TYPES, value);
}

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    const bucketKey = form.get("bucket") as StorageBucketKey | null;
    const entityType = form.get("entityType");

    if (!isUploadType(entityType)) {
      return NextResponse.json({ status: "error", message: "Unknown or unsupported upload type." }, { status: 400 });
    }
    const uploadType = UPLOAD_TYPES[entityType];
    if (bucketKey !== uploadType.bucket) {
      return NextResponse.json({ status: "error", message: "That upload type doesn't belong in that location." }, { status: 400 });
    }
    // Role gate for the type (403 via errorResponse): admins never; designer types need a designer
    // profile — same rule and message as requireDesigner(), using the context already resolved.
    assertNotAdmin(ctx);
    if (uploadType.role === "designer" && !ctx.designerId) {
      throw new AuthorizationError("A designer profile is required for this action.", 403);
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ status: "error", message: "No file was provided." }, { status: 400 });
    }
    if (!bucketKey || !ALLOWED_BUCKETS.includes(bucketKey)) {
      return NextResponse.json({ status: "error", message: "Unknown or unsupported upload target." }, { status: 400 });
    }
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { status: "error", message: "Please choose a JPG, PNG, or WEBP image." },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ status: "error", message: "Image must be smaller than 10MB." }, { status: 400 });
    }

    const { id: bucketId, public: isPublic } = STORAGE_BUCKETS[bucketKey];
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${ctx.user.id}/${entityType}/${crypto.randomUUID()}.${extension}`;

    const supabase = createClient();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(bucketId).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const insert: TablesInsert<"files"> = {
      owner_id: ctx.user.id,
      entity_type: entityType,
      bucket_id: bucketId,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      is_private: !isPublic,
    };
    const { data: fileRow, error: insertError } = await supabase.from("files").insert(insert).select().single();
    if (insertError) {
      // Roll back the orphaned storage object rather than leaving bytes with no metadata row.
      await supabase.storage.from(bucketId).remove([path]);
      throw insertError;
    }

    // Public buckets: a public URL is just a computed path, safe to return immediately. Private
    // buckets: deliberately do NOT try to mint a signed URL in this same response — Storage's own
    // object index can lag noticeably behind a just-completed upload (observed directly against
    // this bucket: createSignedUrl/list() both miss an object for a while after a 200 upload
    // response, well past what a bounded in-request retry can wait out), so a signed-URL call
    // here would make this endpoint slow and occasionally still fail for no real reason. The
    // client already has the file it just picked — it shows its own local preview instead (see
    // lib/customer/upload-client.ts) — and every later read of this image (GET /api/requests,
    // /api/diary, ...) resolves a fresh signed URL at that point, by which time the object has
    // long since settled.
    const url = isPublic ? getPublicFileUrl(supabase, bucketKey, path) : null;

    return NextResponse.json({ status: "ok", fileId: fileRow.id, url });
  } catch (err) {
    return errorResponse(err, "api.uploads.create");
  }
}

/**
 * Removes a not-yet-referenced upload (e.g. the user added an image to a form, then removed it
 * before submitting). `files_delete_own` RLS scopes this to the caller's own file regardless; the
 * `on delete restrict` FK from request_images/diary_entry_images means this cleanly fails instead
 * of silently orphaning a reference if the file is already linked to something.
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await requireUser();
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");
    if (!fileId) {
      return NextResponse.json({ status: "error", message: "Missing fileId." }, { status: 400 });
    }

    const supabase = createClient();
    const { data: fileRow, error: fetchError } = await supabase
      .from("files")
      .select("id, owner_id, bucket_id, storage_path")
      .eq("id", fileId)
      .single();
    if (fetchError || !fileRow) {
      return NextResponse.json({ status: "error", message: "File not found." }, { status: 404 });
    }
    if (fileRow.owner_id !== ctx.user.id) {
      return NextResponse.json({ status: "error", message: "You don't have permission to do that." }, { status: 403 });
    }

    const { error: deleteRowError } = await supabase.from("files").delete().eq("id", fileId);
    if (deleteRowError) {
      // Most likely the FK-restrict case — the file is already linked to a request/diary entry.
      return NextResponse.json(
        { status: "error", message: "This image is already in use and can't be removed this way." },
        { status: 409 }
      );
    }

    await supabase.storage.from(fileRow.bucket_id).remove([fileRow.storage_path]);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.uploads.delete");
  }
}
