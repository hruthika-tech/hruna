import "server-only";

/**
 * Shared server-side shaping helpers for the designer API routes (Phase 5) — the designer-side
 * counterpart to lib/customer/data.ts. Deliberately imports the request/proposal/project mappers
 * from there rather than redefining them: fashion_requests/proposals/projects are the SAME
 * canonical rows on both sides of the marketplace (Core Principle carried over from Phase 4) — a
 * designer must see EXACTLY what the customer submitted, so there is exactly one mapper for each,
 * not a parallel "designer's view of a request" model.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/types";
import { STORAGE_BUCKETS, createSignedFileUrl, getPublicFileUrl, type StorageBucketKey } from "@/lib/supabase/storage";
import type { ResolvedImage } from "@/lib/customer/data";

export {
  mapRequest,
  mapProposal,
  mapProject,
  mapProjectUpdate,
  resolveRequestImages,
  resolveProjectUpdateImages,
  getDesignerSummaries,
  type DesignerSummary,
  type ResolvedImage,
} from "@/lib/customer/data";

type Supa = SupabaseClient<Database>;

/* ------------------------------------------------------------------ */
/* Customer summaries — the designer-side mirror of getDesignerSummaries.*/
/* Deliberately minimal: only what a designer legitimately needs to see  */
/* about a customer they share a request/project with (§18) — never the  */
/* customer's phone/measurements/other requests.                         */
/* ------------------------------------------------------------------ */

export interface CustomerSummary {
  id: string;
  name: string;
  city: string;
  avatar: string;
}

export async function getCustomerSummaries(
  supabase: Supa,
  customerIds: string[]
): Promise<Map<string, CustomerSummary>> {
  const ids = [...new Set(customerIds)].filter(Boolean);
  const result = new Map<string, CustomerSummary>();
  if (ids.length === 0) return result;

  const { data: customers } = await supabase
    .from("customer_profiles")
    .select("id, name, city, avatar_file_id")
    .in("id", ids);
  if (!customers) return result;

  const avatarFileIds = customers.map((c) => c.avatar_file_id).filter((id): id is string => !!id);
  const { data: avatarFiles } = avatarFileIds.length
    ? await supabase.from("files").select("id, storage_path").in("id", avatarFileIds)
    : { data: [] as { id: string; storage_path: string }[] };
  const pathByFileId = new Map((avatarFiles ?? []).map((f) => [f.id, f.storage_path]));

  for (const c of customers) {
    const avatarPath = c.avatar_file_id ? pathByFileId.get(c.avatar_file_id) : undefined;
    result.set(c.id, {
      id: c.id,
      name: c.name,
      city: c.city ?? "",
      avatar: avatarPath ? getPublicFileUrl(supabase, "avatars", avatarPath) : "",
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Studio content image resolution — same *_images -> files -> Storage  */
/* pattern as lib/customer/data.ts. Most of these (banner, highlights,   */
/* meet-the-designer, collection covers) genuinely live in the PUBLIC    */
/* "studio-images" bucket (catalog/marketing content) — that stays the   */
/* default. A designer's AVATAR does not: every avatar upload path       */
/* (designer onboarding, the Designer Profile page, the customer avatar  */
/* equivalent) writes to the "avatars" bucket, matching                  */
/* getOwnDesignerIdentity()/getCustomerSummaries() in this same file,    */
/* which already resolve avatars from "avatars" correctly. This function */
/* hardcoded "studioImages" for every fileId including the avatar one,   */
/* so every designer's photo silently 404'd wherever getStudioBundle()   */
/* supplies it — the designer's own "My Studio" preview AND the public   */
/* Studio page AND the Discover/dress/collection pages (lib/customer/    */
/* discovery.ts uses this same function), since all of them share one    */
/* bundle. Root cause was a hardcoded bucket, not a data/query problem —  */
/* files.bucket_id already correctly recorded "avatars" the whole time.  */
async function resolveStudioImage(
  supabase: Supa,
  fileId: string | null,
  bucket: StorageBucketKey = "studioImages"
): Promise<string> {
  if (!fileId) return "";
  const { data } = await supabase.from("files").select("storage_path").eq("id", fileId).maybeSingle();
  if (!data) return "";
  return getPublicFileUrl(supabase, bucket, data.storage_path);
}

/**
 * True only if `fileId` is an upload the given user owns in the public studio-images bucket.
 * Studio content resolves images as PUBLIC urls (resolveStudioImage above), so linking a file
 * from any other bucket — or someone else's file — must be refused before it's saved.
 */
export async function isOwnStudioImage(supabase: Supa, fileId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from("files").select("owner_id, bucket_id").eq("id", fileId).maybeSingle();
  return !!data && data.owner_id === userId && data.bucket_id === STORAGE_BUCKETS.studioImages.id;
}

async function resolveStudioImagesOrderedFull(
  supabase: Supa,
  table: "dress_images" | "previous_creation_images",
  parentColumn: "dress_id" | "previous_creation_id",
  parentId: string
): Promise<ResolvedImage[]> {
  const { data, error } = await (supabase.from(table) as any)
    .select("position, files(id, storage_path)")
    .eq(parentColumn, parentId)
    .order("position", { ascending: true });
  if (error || !data) return [];
  const rows = data as { files: { id: string; storage_path: string } | null }[];
  return rows
    .filter((r) => r.files)
    .map((r) => ({ fileId: r.files!.id, url: getPublicFileUrl(supabase, "studioImages", r.files!.storage_path) }));
}

/** Also fileId+url pairs — the Manage Studio dress-edit modal needs the fileId to re-populate its
 *  UploadedImage[] state, otherwise saving an edit without touching images would send an empty
 *  imageFileIds list and wipe the dress's existing photos. */
export const resolveDressImages = (supabase: Supa, dressId: string) =>
  resolveStudioImagesOrderedFull(supabase, "dress_images", "dress_id", dressId);

export const resolvePreviousCreationImages = async (supabase: Supa, creationId: string): Promise<string[]> => {
  const images = await resolveStudioImagesOrderedFull(supabase, "previous_creation_images", "previous_creation_id", creationId);
  return images.map((i) => i.url);
};

export { resolveStudioImage };

/* ------------------------------------------------------------------ */
/* Verification-documents bucket images (portfolio items) — private,   */
/* owner + admin-review only. Same signed-URL pattern as request/diary  */
/* images.                                                              */
/* ------------------------------------------------------------------ */

export async function resolvePortfolioItemImage(supabase: Supa, fileId: string | null): Promise<string> {
  if (!fileId) return "";
  const { data } = await supabase.from("files").select("storage_path").eq("id", fileId).maybeSingle();
  if (!data) return "";
  try {
    return await createSignedFileUrl(supabase, "verificationDocuments", data.storage_path, 60 * 30);
  } catch {
    return "";
  }
}

/** The signed-in designer's name/avatar, for the persistent DesignerNavbar header (Phase 7 fix —
 *  it used to always show the seeded mock designer, regardless of who was actually signed in).
 *  Same designer_profiles + avatars-bucket shape app/api/designer/profile/route.ts already reads,
 *  kept as its own small query here rather than exported from that route file, so a working route
 *  isn't touched to serve an unrelated caller. */
export async function getOwnDesignerIdentity(supabase: Supa, userId: string, designerId: string): Promise<{ name: string; avatar: string }> {
  const [{ data: user }, { data: designer }] = await Promise.all([
    supabase.from("users").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("designer_profiles").select("avatar_file_id").eq("id", designerId).maybeSingle(),
  ]);
  let avatar = "";
  if (designer?.avatar_file_id) {
    const { data: file } = await supabase.from("files").select("storage_path").eq("id", designer.avatar_file_id).maybeSingle();
    if (file) avatar = getPublicFileUrl(supabase, "avatars", file.storage_path);
  }
  return { name: user?.display_name ?? "", avatar };
}

/* ------------------------------------------------------------------ */
/* designer_profiles + studio-content -> the frontend Designer shape.  */
/* Used both by the public /studio/[id] (customer-facing) and the      */
/* designer's own "My Studio" preview — one bundle, two consumers.      */
/* ------------------------------------------------------------------ */

export function mapDesignerProfile(
  row: Tables<"designer_profiles">,
  displayName: string,
  avatar: string,
  banner: string,
  isApproved: boolean,
  highlights: { image: string; caption: string }[] = [],
  meetTheDesigner: { image: string; description: string }[] = []
) {
  return {
    id: row.id,
    name: displayName || row.studio_name,
    studioName: row.studio_name,
    type: row.type,
    avatar,
    banner,
    specializations: row.specializations,
    city: row.city ?? "",
    country: row.country ?? "",
    experienceYears: row.experience_years,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    startingPrice: row.starting_price !== null ? Number(row.starting_price) : 0,
    verified: isApproved,
    available: isApproved,
    bio: row.bio ?? "",
    story: row.story ?? "",
    highlights,
    meetTheDesigner,
    openingHours: row.opening_hours ?? "",
    atelierLocation: row.atelier_location ?? "",
    contactEmail: row.contact_email ?? "",
    instagramUrl: row.instagram_url ?? undefined,
    websiteUrl: row.website_url ?? undefined,
  };
}

export function mapCollection(row: Tables<"collections">, coverImage: string, dressIds: string[]) {
  return {
    id: row.id,
    designerId: row.designer_id,
    name: row.name,
    category: row.category ?? "",
    coverImage,
    description: row.description ?? "",
    dressIds,
  };
}

export function mapDress(row: Tables<"dresses">, images: ResolvedImage[]) {
  return {
    id: row.id,
    designerId: row.designer_id,
    collectionId: row.collection_id,
    name: row.name,
    // Plain display urls, matching the frontend Dress type (public Studio / catalog pages read this).
    images: images.map((i) => i.url),
    // fileId+url pairs, so Manage Studio's dress-edit modal can re-populate UploadedImage[] state
    // without losing track of which already-attached image is which when saving without touching
    // images (the PATCH endpoint's imageFileIds is a full ordered replacement, not a diff).
    imageFiles: images,
    description: row.description ?? "",
    price: Number(row.price),
    available: row.available,
    fabric: row.fabric ?? "",
  };
}

export function mapPreviousCreation(row: Tables<"previous_creations">, image: string) {
  return {
    id: row.id,
    designerId: row.designer_id,
    image,
    description: row.description ?? "",
    year: row.year ?? "",
  };
}

export function mapHighlight(row: Tables<"studio_highlights">, image: string) {
  return { id: row.id, image, caption: row.caption ?? "", position: row.position };
}

export function mapMeetEntry(row: Tables<"meet_the_designer_entries">, image: string) {
  return { id: row.id, image, description: row.description ?? "", position: row.position };
}

/* ------------------------------------------------------------------ */
/* Onboarding + portfolio + credentials -> frontend shapes.            */
/* ------------------------------------------------------------------ */

/** True once Supabase Auth has confirmed this user's email (the signup confirmation link). */
export function emailConfirmed(user: Pick<User, "email_confirmed_at"> | null | undefined): boolean {
  return !!user?.email_confirmed_at;
}

/**
 * `emailVerified` is passed in, not read from designer_onboarding.email_verified: that column was
 * never written by anything, so it always read false. The source of truth is Supabase Auth's own
 * auth.users.email_confirmed_at — set only when the signup confirmation link is clicked
 * (app/auth/confirm/route.ts), the same check customer signup relies on. See emailConfirmed().
 *
 * designer_onboarding.phone_verified is deliberately NOT surfaced: there is no SMS verification in
 * V1, so the phone is an optional, unverified contact detail only.
 */
export function mapOnboarding(row: Tables<"designer_onboarding">, emailVerified: boolean | null) {
  return {
    designerId: row.designer_id,
    phone: row.phone ?? "",
    emailVerified,
    roles: row.roles,
    otherRoleDescription: row.other_role_description ?? undefined,
    specializationCategories: row.specialization_categories,
    specializationCrafts: row.specialization_crafts,
    experienceLevel: row.experience_level ?? "",
    learningBackground: row.learning_background ?? "",
    experienceDescription: row.experience_description ?? "",
    portfolioOwnershipAccepted: row.portfolio_ownership_accepted,
    dateOfBirth: row.date_of_birth ?? "",
    studioName: row.studio_name ?? "",
    city: row.city ?? "",
    area: row.area ?? "",
    serviceLocations: row.service_locations,
    address: row.address ?? undefined,
    aboutStudio: row.about_studio ?? "",
    instagramUrl: row.instagram_url ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    workingModel: row.working_model ?? "",
    updatedAt: row.updated_at,
  };
}

export function mapPortfolioItem(row: Tables<"designer_portfolio_items">, image: string) {
  return {
    id: row.id,
    image,
    title: row.title,
    category: row.category ?? "",
    description: row.description ?? "",
    year: row.year ?? undefined,
  };
}

export function mapCredential(row: Tables<"designer_credentials">) {
  return {
    id: row.id,
    type: row.type,
    institution: row.institution ?? undefined,
    qualification: row.qualification ?? undefined,
    year: row.year ?? undefined,
  };
}

export function mapVerification(row: Tables<"designer_verifications">) {
  return {
    designerId: row.designer_id,
    identityStatus: row.identity_status,
    identityFailureReason: row.identity_failure_reason ?? undefined,
    portfolioStatus: row.portfolio_status,
    portfolioReviewNote: row.portfolio_review_note ?? undefined,
    overallStatus: row.overall_status,
    profileReviewNote: row.profile_review_note ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
  };
}
