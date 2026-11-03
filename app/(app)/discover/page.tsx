import { createClient } from "@/lib/supabase/server";
import { listApprovedDesigners } from "@/lib/customer/discovery";
import type { Designer } from "@/types";
import { DiscoverClient } from "./DiscoverClient";

// Server-renders the public catalog — the same approved-designers list /api/designers serves — so
// the first HTML (and search engines) already contain every studio card and its /studio link.
// Search and filters stay client-side in DiscoverClient over this same list.
// Rendered per request (the catalog changes as designers are approved, and the lookup reads the
// request's cookies) — never pre-rendered at build time.
export const dynamic = "force-dynamic";

/** Only what the card and filters use, listed field by field (the mapped rows carry extra runtime
 *  fields such as social links). Studio contact details stay on the studio page itself. */
function toCatalogCard(d: Designer): Designer {
  return {
    id: d.id,
    name: d.name,
    studioName: d.studioName,
    type: d.type,
    avatar: d.avatar,
    banner: d.banner,
    specializations: d.specializations,
    city: d.city,
    country: d.country,
    experienceYears: d.experienceYears,
    rating: d.rating,
    reviewCount: d.reviewCount,
    startingPrice: d.startingPrice,
    verified: d.verified,
    available: d.available,
    bio: d.bio,
    story: "",
    highlights: [],
    meetTheDesigner: [],
    openingHours: "",
    atelierLocation: "",
    contactEmail: "",
  };
}

export default async function DiscoverPage() {
  let designers: Designer[] | null = null;
  try {
    designers = (await listApprovedDesigners(createClient())).map(toCatalogCard);
  } catch (err) {
    // The client falls back to loading the catalog itself (initialDesigners === null).
    console.error("[discover] approved designer lookup failed", err instanceof Error ? err.message : err);
  }
  return <DiscoverClient initialDesigners={designers} />;
}
