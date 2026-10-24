import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDressDetail, toPublicDesignerSummary } from "@/lib/customer/discovery";
import { NOINDEX_FOLLOW, pageMetadata, truncateDescription } from "@/lib/seo";
import { formatCurrency } from "@/lib/utils";
import type { Dress } from "@/types";
import { DressDetailsView } from "./DressDetailsView";

// Server-rendered: the dress loads here, through the same getDressDetail() as /api/dresses/[id]
// (same anonymous-readable data, same rules), so search engines get the real content, a missing
// or malformed id is a real 404, and metadata comes from the same data the page shows. Always the
// latest saved data, never a cached copy.
export const dynamic = "force-dynamic";

// One load per request, shared by generateMetadata() and the page.
const loadDress = cache((id: string) => getDressDetail(createClient(), id));

// Indexable only when the designer is approved (the public catalog's rule); other designers'
// dresses stay reachable by direct link, marked noindex — the same policy as their studios.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const result = await loadDress(params.id);
  if (!result) return { title: "Dress not found", robots: NOINDEX_FOLLOW };
  const { dress, designer } = result;
  const city = designer.city.trim();
  const facts = [dress.fabric, formatCurrency(dress.price)].filter(Boolean).join(" · ");
  const description = dress.description.trim()
    ? truncateDescription(`${dress.description.trim()} By ${designer.studioName}${city ? `, ${city}` : ""} — ${facts}.`)
    : truncateDescription(`${dress.name} by ${designer.studioName}${city ? `, ${city}` : ""} — ${facts}. View photos and availability on HRUNA.`);
  return pageMetadata({
    title: `${dress.name} by ${designer.studioName}`,
    description,
    path: `/dresses/${dress.id}`,
    images: dress.images[0] ? [dress.images[0]] : undefined,
    robots: designer.verified ? undefined : NOINDEX_FOLLOW,
  });
}

export default async function DressDetailsPage({ params }: { params: { id: string } }) {
  const result = await loadDress(params.id);
  if (!result) notFound();
  // Only what the page displays goes to the browser: no storage file ids, no extra designer fields.
  const { imageFiles: _fileIds, ...dress } = result.dress;
  return <DressDetailsView dress={dress satisfies Dress} designer={toPublicDesignerSummary(result.designer)} />;
}
