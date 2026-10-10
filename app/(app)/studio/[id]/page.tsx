import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Clock, Mail, ArrowRight, CheckCircle2, Award } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/Badge";
import { RatingDisplay } from "@/components/ui/Rating";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CollectionCard } from "@/components/designer/CollectionCard";
import { createClient } from "@/lib/supabase/server";
import { getStudioBundle } from "@/lib/designer/studio-bundle";
import { formatCurrency, formatDate } from "@/lib/utils";

// Real data (Phase 5) — designer_profiles + studio content, via the same lib/designer/
// studio-bundle.ts bundle the designer's own "My Studio" preview and app/api/studio/[id] use.
// This is a Server Component, so the fetch happens directly, server-side, with no client-side
// loading state needed — the page itself IS the loading boundary (Next's routing shows nothing
// until this resolves, matching how this page already behaved before Phase 5).
// Always render with the latest saved studio data — never a cached copy.
export const dynamic = "force-dynamic";

export default async function PublicStudioPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const bundle = await getStudioBundle(supabase, params.id);
  if (!bundle) notFound();

  const { designer, collections: studioCollections, dresses: studioDresses, reviews: studioReviews, completedProjectCount: completedCount, isTrustedProfessional } = bundle;

  return (
    <div className="pb-section-gap">
      {/* Banner */}
      <div className="relative h-72 md:h-96 w-full">
        {designer.banner && <Image src={designer.banner} alt={designer.studioName} fill priority className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
      </div>

      <div className="container-editorial -mt-16 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-surface-lowest rounded-md border border-primary/10 p-8 shadow-soft">
          <div className="flex items-center gap-4">
            <Avatar src={designer.avatar} alt={designer.name} size={72} verified={designer.verified} />
            <div>
              <h1 className="text-headline-md">{designer.studioName}</h1>
              <p className="text-ink-variant text-sm">{designer.type} · {designer.name} · {designer.experienceYears} yrs experience</p>
              <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                <span className="flex items-center gap-1 text-outline"><MapPin size={14} />{designer.city}, {designer.country}</span>
                <span className="flex items-center gap-1.5"><RatingDisplay value={designer.rating} /> <span className="text-outline">({designer.reviewCount})</span></span>
                {completedCount > 0 && (
                  <span className="flex items-center gap-1.5 text-primary">
                    <CheckCircle2 size={14} /> {completedCount} Completed on HRUNA
                  </span>
                )}
                {isTrustedProfessional && (
                  <Badge tone="success"><Award size={12} className="inline mr-1" />Trusted Professional</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <LinkButton href={`/requests/new?designerId=${designer.id}`} size="lg">
              Send a Fashion Request
            </LinkButton>
          </div>
        </div>
      </div>

      {/* About */}
      <section className="container-editorial mt-16 grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2">
          <p className="text-label-md text-outline mb-3">ABOUT THE STUDIO</p>
          <p className="text-body-lg text-ink-variant leading-relaxed">{designer.story}</p>
          <div className="flex flex-wrap gap-2 mt-6">
            {designer.specializations.map((s) => (
              <Badge key={s} tone="primary">{s}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 bg-surface-low rounded-md p-6 h-fit">
          <p className="text-label-md text-outline">STUDIO INFORMATION</p>
          <div className="flex items-start gap-3 text-sm">
            <MapPin size={16} className="text-outline mt-0.5 shrink-0" />
            <span className="text-ink-variant">{designer.atelierLocation}</span>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <Clock size={16} className="text-outline mt-0.5 shrink-0" />
            <span className="text-ink-variant">{designer.openingHours}</span>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <Mail size={16} className="text-outline mt-0.5 shrink-0" />
            <span className="text-ink-variant">{designer.contactEmail}</span>
          </div>
        </div>
      </section>

      {/* Studio highlights */}
      {designer.highlights.length > 0 && (
        <section className="container-editorial mt-20">
          <p className="text-label-md text-outline mb-6">STUDIO HIGHLIGHTS</p>
          <div className="grid md:grid-cols-3 gap-6">
            {designer.highlights.map((h, i) => (
              <div key={i} className="relative h-72 rounded-md overflow-hidden group">
                <Image src={h.image} alt={h.caption} fill sizes="33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent flex items-end p-5">
                  <p className="text-white text-sm">{h.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Meet the designer */}
      {designer.meetTheDesigner.length > 0 && (
        <section className="container-editorial mt-20">
          <p className="text-label-md text-outline mb-6">MEET THE DESIGNER</p>
          <div className="grid md:grid-cols-2 gap-10">
            {designer.meetTheDesigner.map((m, i) => (
              <div key={i} className="flex gap-5 items-start">
                <div className="relative w-28 h-36 rounded-sm overflow-hidden shrink-0">
                  <Image src={m.image} alt="" fill sizes="112px" className="object-cover" />
                </div>
                <p className="text-ink-variant text-sm leading-relaxed">{m.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Collections */}
      {studioCollections.length > 0 && (
        <section className="container-editorial mt-20">
          <div className="flex items-end justify-between mb-6">
            <p className="text-label-md text-outline">COLLECTIONS</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {studioCollections.map((c) => (
              <Link key={c.id} href={`/collections/${c.id}`}>
                <CollectionCard name={c.name} category={c.category} coverImage={c.coverImage} pieceCount={c.dressIds.length} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Dresses */}
      {studioDresses.length > 0 && (
        <section className="container-editorial mt-20">
          <p className="text-label-md text-outline mb-6">PREVIOUS CREATIONS & AVAILABLE PIECES</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {studioDresses.map((d) => (
              <Link key={d.id} href={`/dresses/${d.id}`}>
                <Card hover>
                  <div className="relative h-64">{d.images[0] && <Image src={d.images[0]} alt={d.name} fill sizes="25vw" className="object-cover" />}</div>
                  <div className="p-4">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-primary text-sm mt-1">{formatCurrency(d.price)}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Reviews */}
      <section className="container-editorial mt-20">
        <p className="text-label-md text-outline mb-6">CUSTOMER REVIEWS</p>
        {studioReviews.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {studioReviews.map((r) => (
              <div key={r.id} className="border border-outline-variant rounded-md p-6">
                <RatingDisplay value={r.rating} />
                <p className="text-ink-variant text-sm mt-3 leading-relaxed">{r.text}</p>
                <p className="text-xs text-outline mt-3">{formatDate(r.date)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-outline">No reviews yet.</p>
        )}
      </section>

      <section className="container-editorial mt-20">
        <div className="rounded-lg bg-primary text-white p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-headline-sm mb-1">Ready to work with {designer.name}?</h2>
            <p className="text-white/75 text-sm">Send a private fashion request and receive a tailored proposal.</p>
          </div>
          <LinkButton href={`/requests/new?designerId=${designer.id}`} className="bg-white text-ink hover:bg-white/90 shrink-0">
            Send a Request <ArrowRight size={16} />
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
