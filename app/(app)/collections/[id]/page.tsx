import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCollectionDetail, toPublicDesignerSummary } from "@/lib/customer/discovery";
import { NOINDEX_FOLLOW, pageMetadata, truncateDescription } from "@/lib/seo";
import type { Collection, Dress } from "@/types";
import { CollectionDetailsView } from "./CollectionDetailsView";

// Server-rendered: the collection loads here, through the same getCollectionDetail() as
// /api/collections/[id] (same anonymous-readable data, same rules), so search engines get the real
// content, a missing or malformed id is a real 404, and metadata comes from what the page shows.
// Always the latest saved data, never a cached copy.
export const dynamic = "force-dynamic";

// One load per request, shared by generateMetadata() and the page.
const loadCollection = cache((id: string) => getCollectionDetail(createClient(), id));

// Indexable only when the designer is approved (the public catalog's rule); other designers'
// collections stay reachable by direct link, marked noindex — the same policy as their studios.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const result = await loadCollection(params.id);
  if (!result) return { title: "Collection not found", robots: NOINDEX_FOLLOW };
  const { collection, dresses, designer } = result;
  const city = designer.city.trim();
  const by = `by ${designer.studioName}${city ? `, ${city}` : ""}`;
  const pieces = dresses.length === 1 ? "1 piece" : `${dresses.length} pieces`;
  const description = collection.description.trim()
    ? truncateDescription(`${collection.description.trim()} A collection ${by} — ${pieces} on HRUNA.`)
    : truncateDescription(`${collection.name}${collection.category ? `, a ${collection.category} collection` : ", a collection"} ${by} — ${pieces} on HRUNA.`);
  const image = collection.coverImage || dresses.find((d) => d.images[0])?.images[0];
  return pageMetadata({
    title: `${collection.name} by ${designer.studioName}`,
    description,
    path: `/collections/${collection.id}`,
    images: image ? [image] : undefined,
    robots: designer.verified ? undefined : NOINDEX_FOLLOW,
  });
}

export default async function CollectionDetailsPage({ params }: { params: { id: string } }) {
  const result = await loadCollection(params.id);
  if (!result) notFound();
  // Only what the page displays goes to the browser: no storage file ids, no extra designer fields.
  const dresses = result.dresses.map(({ imageFiles: _fileIds, ...d }) => d satisfies Dress);
  return <CollectionDetailsView collection={result.collection satisfies Collection} dresses={dresses} designer={toPublicDesignerSummary(result.designer)} />;
}
