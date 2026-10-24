import "server-only";

/**
 * The full public Studio bundle for one designer — designer_profiles + highlights + meet-the-
 * designer + collections + dresses + previous creations + reviews. Extracted here so the exact
 * same query/shaping logic backs three different call sites without duplication:
 *   - app/api/studio/[id]/route.ts (a fetchable API, for any client-side consumer)
 *   - app/(app)/studio/[id]/page.tsx (customer-facing public Studio, a Server Component)
 *   - app/(designer)/designer/studio/page.tsx (the designer's own "preview", a Server Component)
 * All three show the SAME real data — §31's "keep public view separate from management" is about
 * WRITE access, not a second read implementation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isAdminOwnedDesigner } from "@/lib/supabase/authorization";
import { isUuid } from "@/lib/moderation/reports";
import {
  mapDesignerProfile,
  mapCollection,
  mapDress,
  mapPreviousCreation,
  mapHighlight,
  mapMeetEntry,
  resolveStudioImage,
  resolveDressImages,
  resolvePreviousCreationImages,
} from "@/lib/designer/data";

export async function getStudioBundle(supabase: SupabaseClient<Database>, designerId: string) {
  // A malformed id can't match any studio — answer "not found" instead of letting Postgres reject
  // the uuid cast (which surfaced as a 500 on /studio/<anything>).
  if (!isUuid(designerId)) return null;
  const { data: designer, error } = await supabase
    .from("designer_profiles")
    .select("*, users(display_name)")
    .eq("id", designerId)
    .maybeSingle();
  if (error) throw error;
  if (!designer) return null;
  // A designer profile owned by an ADMIN account is never a public studio — treat it as not found
  // (404 on /studio/[id] and /api/studio/[id]) rather than exposing its content.
  if (await isAdminOwnedDesigner(designer.id)) return null;

  const [
    { data: approval },
    { data: collectionsRaw },
    { data: dressesRaw },
    { data: creationsRaw },
    { data: reviewsRaw },
    { data: highlightsRaw },
    { data: meetRaw },
  ] = await Promise.all([
    // designer_public_profiles, not designer_verifications directly — that table's RLS is
    // owner-or-admin-only, so a customer/anonymous visitor's client could never see another
    // designer's row there at all (Phase 7 fix: this silently made every real visitor's "verified"/
    // "Trusted Professional" badge on this exact public Studio page read false, since Phase 5).
    supabase.from("designer_public_profiles").select("is_approved").eq("id", designerId).maybeSingle(),
    supabase.from("collections").select("*").eq("designer_id", designerId).order("created_at", { ascending: false }),
    supabase.from("dresses").select("*").eq("designer_id", designerId).order("created_at", { ascending: false }),
    supabase.from("previous_creations").select("*").eq("designer_id", designerId).order("created_at", { ascending: false }),
    supabase.from("reviews").select("*").eq("designer_id", designerId).order("created_at", { ascending: false }),
    supabase.from("studio_highlights").select("*").eq("designer_id", designerId).order("position", { ascending: true }),
    supabase.from("meet_the_designer_entries").select("*").eq("designer_id", designerId).order("position", { ascending: true }),
  ]);

  const isApproved = !!approval?.is_approved;
  const [avatar, banner] = await Promise.all([
    // "avatars" bucket, not the default "studioImages" — this is where every avatar upload path
    // actually writes (see resolveStudioImage's own comment for the full explanation).
    resolveStudioImage(supabase, designer.avatar_file_id, "avatars"),
    resolveStudioImage(supabase, designer.banner_file_id),
  ]);
  const displayName = (designer as unknown as { users: { display_name: string | null } | null }).users?.display_name ?? "";

  const dresses = await Promise.all(
    (dressesRaw ?? []).map(async (d) => mapDress(d, await resolveDressImages(supabase, d.id)))
  );
  const collections = await Promise.all(
    (collectionsRaw ?? []).map(async (c) => {
      const cover = await resolveStudioImage(supabase, c.cover_image_file_id);
      const dressIds = dresses.filter((d) => d.collectionId === c.id).map((d) => d.id);
      return mapCollection(c, cover, dressIds);
    })
  );
  const previousCreations = await Promise.all(
    (creationsRaw ?? []).map(async (cr) => {
      const images = await resolvePreviousCreationImages(supabase, cr.id);
      return mapPreviousCreation(cr, images[0] ?? "");
    })
  );

  const { count: completedProjectCountRaw } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("designer_id", designerId)
    .eq("status", "completed");
  const completedProjectCount = completedProjectCountRaw ?? 0;

  const isTrustedProfessional = isApproved && completedProjectCount >= 3 && Number(designer.rating) >= 4.5;

  const highlights = await Promise.all(
    (highlightsRaw ?? []).map(async (h) => mapHighlight(h, await resolveStudioImage(supabase, h.file_id)))
  );
  const meetTheDesigner = await Promise.all(
    (meetRaw ?? []).map(async (m) => mapMeetEntry(m, await resolveStudioImage(supabase, m.file_id)))
  );

  return {
    designer: mapDesignerProfile(designer, displayName, avatar, banner, isApproved, highlights, meetTheDesigner),
    collections,
    dresses,
    previousCreations,
    reviews: (reviewsRaw ?? []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      designerId: r.designer_id,
      customerId: r.customer_id,
      rating: r.rating,
      text: r.review_text,
      date: r.created_at,
    })),
    completedProjectCount,
    isTrustedProfessional,
  };
}

export type StudioBundle = NonNullable<Awaited<ReturnType<typeof getStudioBundle>>>;
