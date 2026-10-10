/**
 * Storage foundation — bucket registry + URL-resolution helpers only. Deliberately NOT an upload
 * layer yet (no uploadFile()/deleteFile() helpers here) — that belongs to the phase that actually
 * builds an upload workflow end to end (presign → upload → write the `files` metadata row), per
 * this phase's scope.
 *
 * The six buckets and their public/private split come directly from
 * supabase/migrations/20260829180014_storage.sql — this file is the single place that names them
 * for application code, so nothing else hardcodes a bucket-id string.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const STORAGE_BUCKETS = {
  avatars: { id: "avatars", public: true },
  studioImages: { id: "studio-images", public: true },
  requestImages: { id: "request-images", public: false },
  diaryImages: { id: "diary-images", public: false },
  projectUpdates: { id: "project-updates", public: false },
  verificationDocuments: { id: "verification-documents", public: false },
} as const;

export type StorageBucketKey = keyof typeof STORAGE_BUCKETS;

type AnySupabaseClient = SupabaseClient<Database>;

/**
 * For PUBLIC buckets only — returns a stable, unauthenticated URL. Throws if called on a private
 * bucket, since a "public URL" for a private object would be meaningless (it isn't reachable
 * without a signature) and silently returning one risks a caller treating it as usable — verified
 * documents especially must never be handed out this way, per this phase's explicit instruction.
 */
export function getPublicFileUrl(
  supabase: AnySupabaseClient,
  bucket: StorageBucketKey,
  path: string
): string {
  const { id, public: isPublic } = STORAGE_BUCKETS[bucket];
  if (!isPublic) {
    throw new Error(
      `getPublicFileUrl() was called on "${id}", which is a private bucket. Use ` +
        `createSignedFileUrl() instead.`
    );
  }
  const { data } = supabase.storage.from(id).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * For PRIVATE buckets — returns a time-limited signed URL. Callers must already have verified
 * (via the caller's own authenticated Supabase client, so RLS on the `files` table/the storage
 * policies apply) that the requesting user is actually allowed to see this object; this helper
 * does not itself perform an authorization check beyond whatever storage.objects RLS policy the
 * *given* `supabase` client is subject to — see 20260829180014_storage.sql for those policies.
 */
export async function createSignedFileUrl(
  supabase: AnySupabaseClient,
  bucket: StorageBucketKey,
  path: string,
  expiresInSeconds = 60 * 5
): Promise<string> {
  const { id, public: isPublic } = STORAGE_BUCKETS[bucket];
  if (isPublic) {
    // Not an error — public buckets can still be signed — but callers almost certainly meant
    // getPublicFileUrl() here, so this is worth a loud reminder during development.
    console.warn(
      `createSignedFileUrl() was called on "${id}", which is a public bucket. ` +
        `getPublicFileUrl() is simpler and doesn't expire.`
    );
  }

  // A signed-URL request made immediately after the upload that created this object can briefly
  // race Storage's own propagation (observed empirically: the upload itself returns 200 with the
  // real object metadata, a direct GET of the same object succeeds, yet a createSignedUrl() call
  // in the same request/response cycle can still 404 for a few dozen milliseconds). Retrying a
  // couple of times with a short backoff is cheap and makes "upload, then immediately show a
  // preview" (exactly what the request/diary image flows do) reliable without over-engineering a
  // queue or a polling UI for what's normally a near-instant operation.
  let lastError: { message: string } | null = null;
  for (const delayMs of [0, 150, 400]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const { data, error } = await supabase.storage.from(id).createSignedUrl(path, expiresInSeconds);
    if (!error && data) return data.signedUrl;
    lastError = error;
  }

  throw new Error(`Could not create a signed URL for ${id}/${path}: ${lastError?.message}`);
}

/**
 * Deletes one `files` row + its underlying Storage object, if the row exists and is owned by
 * `ownerId` — used both by `DELETE /api/uploads` (removing a not-yet-referenced upload) and by
 * profile PATCH routes replacing an avatar (Phase 7 storage gap-fill: avatar re-uploads
 * previously left the old photo's storage object + `files` row behind forever — a plain,
 * unbounded orphan on every single re-upload). Silently no-ops (never throws) if the file doesn't
 * exist or belongs to someone else — callers use this as a best-effort cleanup step after their
 * own real work (e.g. writing the NEW avatar_file_id) has already succeeded, so a cleanup failure
 * must never surface as the request's own error.
 */
/**
 * True only if EVERY id in `fileIds` is an existing upload owned by `ownerId` in the given bucket —
 * the check to run before linking caller-supplied file ids to anything (e.g. request_images, whose
 * RLS only checks the parent request, not the file). Pass the caller's own RLS-scoped client:
 * another user's private file is then simply invisible, so it fails exactly like a nonexistent id
 * and nothing about it is revealed. Malformed ids fail too (never reach Postgres as a 500).
 */
export async function areFilesOwnedInBucket(
  supabase: AnySupabaseClient,
  fileIds: string[],
  ownerId: string,
  bucket: StorageBucketKey
): Promise<boolean> {
  const ids = [...new Set(fileIds)];
  if (ids.length === 0) return true;
  if (!ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return false;

  const { data, error } = await supabase.from("files").select("id, owner_id, bucket_id").in("id", ids);
  if (error) throw error;
  const bucketId = STORAGE_BUCKETS[bucket].id;
  return (data ?? []).filter((f) => f.owner_id === ownerId && f.bucket_id === bucketId).length === ids.length;
}

export async function deleteFileIfOwnedBy(
  supabase: AnySupabaseClient,
  fileId: string,
  ownerId: string
): Promise<void> {
  const { data: fileRow } = await supabase.from("files").select("id, owner_id, bucket_id, storage_path").eq("id", fileId).maybeSingle();
  if (!fileRow || fileRow.owner_id !== ownerId) return;

  const { error: deleteRowError } = await supabase.from("files").delete().eq("id", fileId);
  if (deleteRowError) return; // still referenced elsewhere (FK restrict), or a transient error — leave it, not this caller's problem to solve.

  await supabase.storage.from(fileRow.bucket_id).remove([fileRow.storage_path]);
}
