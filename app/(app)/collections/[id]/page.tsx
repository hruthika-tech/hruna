"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SaveToggleButton } from "@/components/ui/SaveToggleButton";
import { formatCurrency } from "@/lib/utils";
import { DressAvailabilityNote } from "@/components/dresses/DressAvailabilityNote";
import type { Collection, Dress, Designer } from "@/types";

// Real data (Phase 7 fix) — this page used to read lib/mock-data.ts entirely, which meant it
// broke for any real designer's collection (the mock ids don't exist in the real `collections`
// table).
export default function CollectionDetailsPage() {
  const params = useParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "error" | "ready">("loading");
  const [collection, setCollection] = useState<Collection | null>(null);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [designer, setDesigner] = useState<Designer | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/collections/${params.id}`);
        const data = await res.json();
        if (res.status === 404) return setStatus("notFound");
        if (!res.ok) throw new Error(data.message ?? "Couldn't load this collection.");
        setCollection(data.collection);
        setDresses(data.dresses);
        setDesigner(data.designer);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, [params.id]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-outline py-24">
        <Loader2 className="animate-spin" size={18} /> Loading…
      </div>
    );
  }
  if (status === "notFound") {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Collection not found</p>
        <p className="text-ink-variant text-sm">It may have been removed by the designer.</p>
      </div>
    );
  }
  if (status === "error" || !collection) {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Couldn't load this collection</p>
        <p className="text-ink-variant text-sm">Please try again in a moment.</p>
      </div>
    );
  }

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
        {designer && (
          <Link href={`/studio/${designer.id}`} className="text-primary text-sm font-medium hover:underline">
            By {designer.studioName} →
          </Link>
        )}

        {dresses.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
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
