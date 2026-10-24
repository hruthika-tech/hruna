import "server-only";

/**
 * Public designer/dress/collection discovery (Phase 7 fix) — customer Home, Discover, dress
 * detail, and collection detail pages were still reading `lib/mock-data.ts` after Phase 4/5,
 * which meant `/dresses/[id]` and `/collections/[id]` genuinely broke for any real designer's
 * catalog (mock ids don't exist in the real `dresses`/`collections` tables). No new tables, no new
 * business logic — this just applies the SAME mappers `lib/designer/data.ts` and
 * `lib/designer/studio-bundle.ts` already use for the public Studio page to the browse/listing
 * surfaces that were never converted. RLS on every table here is already public-read (Phase 1);
 * `is_admin()`/auth is irrelevant to this file — it's read-only and safe to call unauthenticated.
 *
 * Approval status is read from `designer_public_profiles` (a view), never `designer_verifications`
 * directly — that table's RLS is intentionally owner-or-admin-only, so a customer/anonymous
 * client can never see another designer's row there at all. designer_public_profiles exposes only
 * the derived `is_approved` boolean for exactly this purpose (see
 * 20260831000001_fix_designer_public_profiles_invoker.sql for why it didn't work before this
 * phase).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { mapDesignerProfile, mapDress, mapCollection, resolveStudioImage, resolveDressImages } from "@/lib/designer/data";
import { getAdminOwnedDesignerIds, isAdminOwnedDesigner } from "@/lib/supabase/authorization";
import { isUuid } from "@/lib/moderation/reports";
import type { Designer } from "@/types";

type Supa = SupabaseClient<Database>;

/** The designer fields a server-rendered dress/collection page sends to the browser — only what
 *  those pages display (and nothing they don't, e.g. contact email or story). `verified` is the
 *  designer's approval, which also decides whether the page may be indexed. */
export type PublicDesignerSummary = Pick<Designer, "id" | "name" | "studioName" | "avatar" | "verified" | "city">;

export function toPublicDesignerSummary(d: Designer): PublicDesignerSummary {
  return { id: d.id, name: d.name, studioName: d.studioName, avatar: d.avatar, verified: d.verified, city: d.city };
}

async function mapDesignerRow(supabase: Supa, designer: any, isApproved: boolean): Promise<Designer> {
  const displayName = designer.users?.display_name ?? "";
  const [avatar, banner] = await Promise.all([
    // "avatars" bucket, not the default "studioImages" — see resolveStudioImage's own comment.
    resolveStudioImage(supabase, designer.avatar_file_id, "avatars"),
    resolveStudioImage(supabase, designer.banner_file_id),
  ]);
  // designer_profiles.specializations is a plain text[] column — the enum-narrowing to
  // Specialization[] only lives in the frontend's own Designer type, same trust boundary every
  // other mapper in this codebase already crosses at this exact seam (Postgres text[] -> a closed
  // frontend union), not a new judgment call.
  return mapDesignerProfile(designer, displayName, avatar, banner, isApproved) as unknown as Designer;
}

// Admin-owned designer profiles are never part of any public surface (see getAdminOwnedDesignerIds),
// even if one were ever approved by mistake.
async function getApprovedIds(supabase: Supa): Promise<string[]> {
  const { data } = await supabase.from("designer_public_profiles").select("id").eq("is_approved", true);
  const ids = (data ?? []).map((d) => d.id).filter((id): id is string => !!id);
  const adminOwned = await getAdminOwnedDesignerIds(ids);
  return ids.filter((id) => !adminOwned.has(id));
}

/** Drops rows whose designer profile is admin-owned. */
async function withoutAdminOwned<T>(rows: T[], designerIdOf: (row: T) => string): Promise<T[]> {
  const adminOwned = await getAdminOwnedDesignerIds(rows.map(designerIdOf));
  return rows.filter((row) => !adminOwned.has(designerIdOf(row)));
}

/** Designers by exact id, regardless of approval status — powers the Saved Items page, which
 *  must still show a designer a customer saved even if that designer's status later changed. Not
 *  gated to approved-only like listApprovedDesigners, since this is "show me what I saved", not
 *  "show me the public catalog". */
export async function listDesignersByIds(supabase: Supa, ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return [];
  const { data: designerRows, error } = await supabase.from("designer_profiles").select("*, users(display_name)").in("id", uniqueIds);
  if (error) throw error;
  const designers = await withoutAdminOwned(designerRows ?? [], (d) => d.id);
  const { data: approvals } = await supabase.from("designer_public_profiles").select("id, is_approved").in("id", uniqueIds);
  const approvedById = new Map((approvals ?? []).map((a) => [a.id, !!a.is_approved]));
  return Promise.all(designers.map((d) => mapDesignerRow(supabase, d, approvedById.get(d.id) ?? false)));
}

/** Dresses by exact id — powers the Saved Items page. */
export async function listDressesByIds(supabase: Supa, ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return [];
  const { data: dressRows, error } = await supabase.from("dresses").select("*").in("id", uniqueIds);
  if (error) throw error;
  const dresses = await withoutAdminOwned(dressRows ?? [], (d) => d.designer_id);
  return Promise.all(dresses.map(async (d) => mapDress(d, await resolveDressImages(supabase, d.id))));
}

/** Collections by exact id — powers the Saved Items page. */
export async function listCollectionsByIds(supabase: Supa, ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return [];
  const { data: collectionRows, error } = await supabase.from("collections").select("*").in("id", uniqueIds);
  if (error) throw error;
  const collections = await withoutAdminOwned(collectionRows ?? [], (c) => c.designer_id);
  return Promise.all(
    collections.map(async (c) => {
      const cover = await resolveStudioImage(supabase, c.cover_image_file_id);
      return mapCollection(c, cover, []);
    })
  );
}

/** Approved designers only — this is the public catalog, not a raw table dump. */
export async function listApprovedDesigners(supabase: Supa, limit?: number) {
  const approvedIds = await getApprovedIds(supabase);
  if (approvedIds.length === 0) return [];

  let query = supabase.from("designer_profiles").select("*, users(display_name)").in("id", approvedIds).order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data: designers, error } = await query;
  if (error) throw error;

  return Promise.all((designers ?? []).map((d) => mapDesignerRow(supabase, d, true)));
}

/** Approved designers' studio ids + last update, for app/sitemap.ts — same approval gate as the
 *  public catalog (getApprovedIds), and nothing beyond the id and timestamp is read. */
export async function listApprovedStudioSitemapEntries(supabase: Supa): Promise<{ id: string; updatedAt: string }[]> {
  const approvedIds = await getApprovedIds(supabase);
  if (approvedIds.length === 0) return [];

  const { data, error } = await supabase.from("designer_profiles").select("id, updated_at").in("id", approvedIds).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.id, updatedAt: d.updated_at }));
}

/** Dress and collection ids + last update for app/sitemap.ts — only items of approved designers,
 *  the same rule as the public catalog (listDresses/listCollections). Nothing else is read. */
export async function listApprovedCatalogSitemapEntries(
  supabase: Supa
): Promise<{ dresses: { id: string; updatedAt: string }[]; collections: { id: string; updatedAt: string }[] }> {
  const approvedIds = await getApprovedIds(supabase);
  if (approvedIds.length === 0) return { dresses: [], collections: [] };

  const [dresses, collections] = await Promise.all([
    supabase.from("dresses").select("id, updated_at").in("designer_id", approvedIds).order("created_at", { ascending: true }),
    supabase.from("collections").select("id, updated_at").in("designer_id", approvedIds).order("created_at", { ascending: true }),
  ]);
  if (dresses.error) throw dresses.error;
  if (collections.error) throw collections.error;
  const entry = (r: { id: string; updated_at: string }) => ({ id: r.id, updatedAt: r.updated_at });
  return { dresses: (dresses.data ?? []).map(entry), collections: (collections.data ?? []).map(entry) };
}

/** Dresses from approved designers only, newest first — used by Home's "Ready-made pieces". */
export async function listDresses(supabase: Supa, limit = 8) {
  const approvedIds = await getApprovedIds(supabase);
  if (approvedIds.length === 0) return [];

  const { data: dresses, error } = await supabase
    .from("dresses")
    .select("*")
    .in("designer_id", approvedIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return Promise.all((dresses ?? []).map(async (d) => mapDress(d, await resolveDressImages(supabase, d.id))));
}

/** Collections from approved designers only, newest first — used by Home's "Collections to explore". */
export async function listCollections(supabase: Supa, limit = 6) {
  const approvedIds = await getApprovedIds(supabase);
  if (approvedIds.length === 0) return [];

  const { data: collections, error } = await supabase
    .from("collections")
    .select("*")
    .in("designer_id", approvedIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return Promise.all(
    (collections ?? []).map(async (c) => {
      const cover = await resolveStudioImage(supabase, c.cover_image_file_id);
      return mapCollection(c, cover, []);
    })
  );
}

/** One dress + its designer's public summary — powers /dresses/[id]. */
export async function getDressDetail(supabase: Supa, dressId: string) {
  // A malformed id can't match any dress: "not found", not a Postgres uuid-cast error (a 500).
  if (!isUuid(dressId)) return null;
  const { data: dressRow, error } = await supabase.from("dresses").select("*").eq("id", dressId).maybeSingle();
  if (error) throw error;
  if (!dressRow || (await isAdminOwnedDesigner(dressRow.designer_id))) return null;

  const [images, { data: designerRow }, { data: approval }] = await Promise.all([
    resolveDressImages(supabase, dressId),
    supabase.from("designer_profiles").select("*, users(display_name)").eq("id", dressRow.designer_id).maybeSingle(),
    supabase.from("designer_public_profiles").select("is_approved").eq("id", dressRow.designer_id).maybeSingle(),
  ]);
  if (!designerRow) return null;

  return { dress: mapDress(dressRow, images), designer: await mapDesignerRow(supabase, designerRow, !!approval?.is_approved) };
}

/** Real, cheap platform counts for the landing page's "Why HRUNA" stats — count-only queries
 *  (head: true means no rows are actually returned), same public-RLS surface as everything else
 *  in this file. Intentionally just two honest numbers: no third "ratings/users" stat is invented
 *  here since there isn't a cheap, meaningful one to report yet. */
export async function getPlatformStats(supabase: Supa) {
  const approvedIds = await getApprovedIds(supabase);
  if (approvedIds.length === 0) return { designers: 0, pieces: 0 };

  const { count: pieces } = await supabase
    .from("dresses")
    .select("*", { count: "exact", head: true })
    .in("designer_id", approvedIds);

  return { designers: approvedIds.length, pieces: pieces ?? 0 };
}

/** One collection + its dresses + its designer's public summary — powers /collections/[id]. */
export async function getCollectionDetail(supabase: Supa, collectionId: string) {
  if (!isUuid(collectionId)) return null;
  const { data: collectionRow, error } = await supabase.from("collections").select("*").eq("id", collectionId).maybeSingle();
  if (error) throw error;
  if (!collectionRow || (await isAdminOwnedDesigner(collectionRow.designer_id))) return null;

  const [cover, { data: dressRows }, { data: designerRow }, { data: approval }] = await Promise.all([
    resolveStudioImage(supabase, collectionRow.cover_image_file_id),
    supabase.from("dresses").select("*").eq("collection_id", collectionId).order("created_at", { ascending: false }),
    supabase.from("designer_profiles").select("*, users(display_name)").eq("id", collectionRow.designer_id).maybeSingle(),
    supabase.from("designer_public_profiles").select("is_approved").eq("id", collectionRow.designer_id).maybeSingle(),
  ]);
  if (!designerRow) return null;

  const dresses = await Promise.all((dressRows ?? []).map(async (d) => mapDress(d, await resolveDressImages(supabase, d.id))));
  return {
    collection: mapCollection(collectionRow, cover, dresses.map((d) => d.id)),
    dresses,
    designer: await mapDesignerRow(supabase, designerRow, !!approval?.is_approved),
  };
}
