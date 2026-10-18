/**
 * Browser-side helpers for app/api/uploads — used by ImageUploader and ProfilePhotoSection so both
 * components upload through the exact same endpoint/contract rather than each hand-rolling fetch
 * calls. Client-safe (no server-only imports); does not talk to Supabase directly — everything
 * goes through our own API route, which is what actually holds the authenticated session.
 */

export interface UploadedImage {
  fileId: string;
  url: string;
}

export type UploadBucket = "avatars" | "requestImages" | "diaryImages" | "projectUpdates" | "studioImages" | "verificationDocuments";

/** Mirrors app/api/uploads/route.ts's UPLOAD_TYPES allowlist (the server is the real gate). */
export type UploadEntityType =
  | "customer_avatar" | "request_image" | "diary_image"
  | "designer_avatar" | "studio_banner" | "studio_highlight" | "meet_the_designer" | "dress_image"
  | "previous_creation" | "collection_cover" | "project_update_image" | "portfolio_item";

export async function uploadImage(file: File, bucket: UploadBucket, entityType: UploadEntityType): Promise<UploadedImage> {
  const form = new FormData();
  form.append("file", file);
  form.append("bucket", bucket);
  form.append("entityType", entityType);

  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Something went wrong uploading that image.");
  // Private buckets (request/diary images) deliberately don't get a signed url back in this same
  // response — see app/api/uploads/route.ts's comment. The browser already has the file it just
  // picked, so a local object URL is a perfectly good immediate preview; it's never sent anywhere
  // or persisted — only `fileId` is, which is what actually links the image in on submit.
  return { fileId: data.fileId, url: data.url ?? URL.createObjectURL(file) };
}

/** Best-effort cleanup for an image the user added then removed before submitting the form it
 *  belongs to — failures here are intentionally swallowed (the file simply stays orphaned, which
 *  is a storage-hygiene concern only, never a correctness or security one). */
export async function deleteUnusedImage(fileId: string): Promise<void> {
  try {
    await fetch(`/api/uploads?fileId=${encodeURIComponent(fileId)}`, { method: "DELETE" });
  } catch {
    // Swallowed — see file comment.
  }
}
