"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Loader2 } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardBody } from "@/components/ui/Card";
import { Avatar, Badge } from "@/components/ui/Badge";
import { RatingDisplay } from "@/components/ui/Rating";
import { SaveToggleButton } from "@/components/ui/SaveToggleButton";
import { LinkButton } from "@/components/ui/Button";
import { subscribeToSavedItems, getSavedItemsSnapshot } from "@/lib/customer/saved-items-client";
import { formatCurrency } from "@/lib/utils";
import { DressAvailabilityNote } from "@/components/dresses/DressAvailabilityNote";
import type { Designer, Dress, Collection, Project } from "@/types";

const TABS = [
  { label: "Designers", value: "designer" },
  { label: "Dresses", value: "dress" },
  { label: "Collections", value: "collection" },
  { label: "Projects", value: "project" },
];

// Real data (Phase 7 fix) — which items are saved was already real (customer_saved_items), but
// resolving what those saved ids actually ARE used lib/mock-data.ts's getXById lookups, which
// always silently returned nothing for a real saved item's real UUID (every mock id vs real id).
// The Saved Items page therefore always looked empty no matter what a customer actually saved.
export default function SavedItemsPage() {
  const [active, setActive] = useState("designer");
  const savedItems = useSyncExternalStore(subscribeToSavedItems, getSavedItemsSnapshot, getSavedItemsSnapshot);

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const designerIds = savedItems.filter((i) => i.itemType === "designer").map((i) => i.itemId);
  const dressIds = savedItems.filter((i) => i.itemType === "dress").map((i) => i.itemId);
  const collectionIds = savedItems.filter((i) => i.itemType === "collection").map((i) => i.itemId);
  const hasProjectItems = savedItems.some((i) => i.itemType === "project");
  const key = savedItems.map((i) => `${i.itemType}:${i.itemId}`).join(",");

  useEffect(() => {
    if (savedItems.length === 0) {
      setDesigners([]);
      setDresses([]);
      setCollections([]);
      setProjects([]);
      setStatus("ready");
      return;
    }
    (async () => {
      try {
        const [designersRes, dressesRes, collectionsRes, projectsRes] = await Promise.all([
          designerIds.length ? fetch(`/api/designers?ids=${designerIds.join(",")}`) : null,
          dressIds.length ? fetch(`/api/dresses?ids=${dressIds.join(",")}`) : null,
          collectionIds.length ? fetch(`/api/collections?ids=${collectionIds.join(",")}`) : null,
          hasProjectItems ? fetch("/api/projects") : null,
        ]);
        setDesigners(designersRes ? (await designersRes.json()).designers ?? [] : []);
        setDresses(dressesRes ? (await dressesRes.json()).dresses ?? [] : []);
        setCollections(collectionsRes ? (await collectionsRes.json()).collections ?? [] : []);
        setProjects(projectsRes ? (await projectsRes.json()).projects ?? [] : []);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const savedProjectIds = new Set(savedItems.filter((i) => i.itemType === "project").map((i) => i.itemId));

  const buckets = {
    designer: designers,
    dress: dresses,
    collection: collections,
    project: projects.filter((p) => savedProjectIds.has(p.id)),
  };

  const filtered = buckets[active as keyof typeof buckets];

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">SAVED ITEMS</p>
      <h1 className="text-headline-md mb-8">Your fashion wishlist</h1>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: buckets[t.value as keyof typeof buckets].length }))}
        active={active}
        onChange={setActive}
      />

      <div className="mt-8">
        {status === "loading" ? (
          <div className="flex items-center justify-center gap-2 text-outline py-24">
            <Loader2 className="animate-spin" size={18} /> Loading…
          </div>
        ) : status === "error" ? (
          <div className="text-center py-24">
            <p className="text-headline-sm mb-2">Couldn't load your saved items</p>
            <p className="text-ink-variant text-sm">Please try again in a moment.</p>
          </div>
        ) : (
          <>
            {active === "designer" && (
              filtered.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(filtered as Designer[]).map((designer) => (
                    <Card key={designer.id} hover className="relative">
                      <Link href={`/studio/${designer.id}`} className="relative w-full h-40 block bg-surface-low">
                        {designer.banner && <Image src={designer.banner} alt={designer.studioName} fill sizes="33vw" className="object-cover" />}
                      </Link>
                      <div className="absolute top-3 left-3"><SaveToggleButton itemType="designer" itemId={designer.id} size="sm" /></div>
                      <CardBody className="flex items-center gap-3">
                        <Avatar src={designer.avatar} alt={designer.name} size={40} verified={designer.verified} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{designer.studioName}</p>
                          <div className="flex items-center gap-1.5"><RatingDisplay value={designer.rating} size={12} /></div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : <EmptyState label="designers" ctaHref="/discover" ctaLabel="Discover Designers" />
            )}

            {active === "dress" && (
              filtered.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {(filtered as Dress[]).map((dress) => (
                    <Card key={dress.id} hover className="relative">
                      <Link href={`/dresses/${dress.id}`} className="relative w-full h-56 block bg-surface-low">
                        {dress.images[0] && <Image src={dress.images[0]} alt={dress.name} fill sizes="25vw" className="object-cover" />}
                      </Link>
                      <div className="absolute top-3 left-3"><SaveToggleButton itemType="dress" itemId={dress.id} size="sm" /></div>
                      <CardBody>
                        <p className="text-sm font-medium truncate">{dress.name}</p>
                        <p className="text-primary text-sm mt-1">{formatCurrency(dress.price)}</p>
                        <DressAvailabilityNote dress={dress} />
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : <EmptyState label="dresses" ctaHref="/home" ctaLabel="Browse Dresses" />
            )}

            {active === "collection" && (
              filtered.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(filtered as Collection[]).map((collection) => (
                    <Card key={collection.id} hover className="relative">
                      <Link href={`/collections/${collection.id}`} className="relative w-full h-48 block bg-surface-low">
                        {collection.coverImage && <Image src={collection.coverImage} alt={collection.name} fill sizes="33vw" className="object-cover" />}
                      </Link>
                      <div className="absolute top-3 left-3"><SaveToggleButton itemType="collection" itemId={collection.id} size="sm" /></div>
                      <CardBody>
                        <p className="text-xs text-outline uppercase mb-1">{collection.category}</p>
                        <p className="font-display text-lg">{collection.name}</p>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : <EmptyState label="collections" ctaHref="/home" ctaLabel="Browse Collections" />
            )}

            {active === "project" && (
              filtered.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(filtered as Project[]).map((project) => (
                    <Card key={project.id} hover className="relative">
                      <Link href={`/projects/${project.id}`}>
                        <CardBody className="flex items-center gap-4">
                          {project.referenceImages[0] && (
                            <div className="relative w-16 h-16 rounded-sm overflow-hidden shrink-0">
                              <Image src={project.referenceImages[0]} alt="" fill sizes="64px" className="object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{project.title}</p>
                            <Badge tone="primary">{project.stage}</Badge>
                          </div>
                        </CardBody>
                      </Link>
                      {/* SaveToggleButton already stops propagation/prevents default (see the
                          component), so it's safe positioned over the card's own Link, matching
                          the un-save pattern already used on the Designers/Dresses/Collections
                          tabs — Projects was the one tab missing it. */}
                      <div className="absolute top-3 left-3"><SaveToggleButton itemType="project" itemId={project.id} size="sm" /></div>
                    </Card>
                  ))}
                </div>
              ) : <EmptyState label="projects" ctaHref="/projects" ctaLabel="View My Projects" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label, ctaHref, ctaLabel }: { label: string; ctaHref: string; ctaLabel: string }) {
  return (
    <div className="text-center py-24">
      <Heart className="mx-auto text-outline mb-4" size={28} />
      <p className="text-headline-sm mb-2">No saved {label} yet</p>
      <p className="text-ink-variant text-sm mb-8">Tap the heart icon on any {label.slice(0, -1)} to save it here.</p>
      <LinkButton href={ctaHref}>{ctaLabel}</LinkButton>
    </div>
  );
}
