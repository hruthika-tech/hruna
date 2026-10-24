"use client";

import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SaveToggleButton } from "@/components/ui/SaveToggleButton";
import { formatCurrency } from "@/lib/utils";
import { DressAvailabilityNote } from "@/components/dresses/DressAvailabilityNote";
import type { Collection, Dress } from "@/types";
import type { PublicDesignerSummary } from "@/lib/customer/discovery";

// The collection detail (cover, description, its pieces, save). The data is loaded on the server by
// ./page.tsx — which also answers 404 for a missing collection — so it arrives here ready to render.
export function CollectionDetailsView({ collection, dresses, designer }: { collection: Collection; dresses: Dress[]; designer: PublicDesignerSummary }) {
  return (
    <div className="pb-section-gap">
      <div className="relative h-80 w-full bg-surface-low">
        {collection.coverImage && <Image src={collection.coverImage} alt={collection.name} fill priority className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent flex items-end">
          <div className="container-editorial pb-10 w-full flex items-end justify-between gap-4">
            <div>
              <p className="text-white/70 text-label-md mb-2">{collection.category}</p>
              <h1 className="text-white text-display-lg-mobile md:text-headline-md font-display">{collection.name}</h1>
            </div>
            <SaveToggleButton itemType="collection" itemId={collection.id} />
          </div>
        </div>
      </div>

      <div className="container-editorial mt-10">
        {collection.description && <p className="text-ink-variant max-w-2xl mb-2">{collection.description}</p>}
        <Link href={`/studio/${designer.id}`} className="text-primary text-sm font-medium hover:underline">
          By {designer.studioName} →
        </Link>

        {dresses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {dresses.map((d) => (
              <Link key={d.id} href={`/dresses/${d.id}`}>
                <Card hover>
                  <div className="relative h-80 bg-surface-low">{d.images[0] && <Image src={d.images[0]} alt={d.name} fill sizes="33vw" className="object-cover" />}</div>
                  <div className="p-5">
                    <p className="font-display text-lg">{d.name}</p>
                    <p className="text-primary text-sm mt-1">{formatCurrency(d.price)}</p>
                    <DressAvailabilityNote dress={d} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-outline mt-12">No pieces in this collection yet.</p>
        )}
      </div>
    </div>
  );
}
