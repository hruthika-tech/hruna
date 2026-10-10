import Image from "next/image";
import Link from "next/link";
import { MapPin, Clock, Mail, Settings, CheckCircle2, Award } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/Badge";
import { RatingDisplay } from "@/components/ui/Rating";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CollectionCard } from "@/components/designer/CollectionCard";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/supabase/authorization";
import { getStudioBundle } from "@/lib/designer/studio-bundle";
import { formatCurrency, formatDate } from "@/lib/utils";

// The designer's own "My Studio" — the exact same real data as the public /studio/[id] page
// (same getStudioBundle()), just for the signed-in designer's own id, plus a "Manage Studio"
// button. This IS a preview of the real public page, not a separately-maintained mock — anything
// changed in Manage Studio shows up here immediately, and here is exactly what a customer sees.
// Always render with the latest saved studio data — never a cached copy.
export const dynamic = "force-dynamic";

export default async function MyStudioPage() {
  // getAuthContext() (not requireDesigner()) deliberately: middleware only requires a valid
  // session for /designer/* routes, not a completed designer profile (see lib/auth/routes.ts) —
  // an authenticated user who hasn't set one up yet should see a helpful empty state here, not an
  // unhandled server-side throw with no error boundary.
  const ctx = await getAuthContext();
  if (!ctx?.designerId) {
    return (
      <div className="container-narrow py-24 text-center">
        <p className="text-headline-sm mb-2">Set up your Studio first</p>
        <p className="text-ink-variant text-sm mb-8">Complete designer onboarding to create your Studio.</p>
        <LinkButton href="/designer-onboarding">Start Onboarding</LinkButton>
      </div>
    );
  }

  const supabase = createClient();
  const bundle = await getStudioBundle(supabase, ctx.designerId);
  if (!bundle) return null;

  const { designer, collections, dresses: studioDresses, previousCreations, reviews, completedProjectCount: completedCount, isTrustedProfessional } = bundle;

  return (
    <div className="pb-section-gap">
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
              <p className="text-ink-variant text-sm">{designer.type} · {designer.name}</p>
              <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                <span className="flex items-center gap-1 text-outline"><MapPin size={14} />{designer.city}</span>
                <RatingDisplay value={designer.rating} />
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
            <LinkButton href="/designer/studio/manage" size="lg"><Settings size={16} /> Manage Studio</LinkButton>
          </div>
        </div>
      </div>

      <section className="container-editorial mt-16 grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2">
          <p className="text-label-md text-outline mb-3">STUDIO STORY</p>
          <p className="text-body-lg text-ink-variant leading-relaxed">{designer.story}</p>
          <div className="flex flex-wrap gap-2 mt-6">
            {designer.specializations.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}
          </div>
        </div>
        <div className="flex flex-col gap-4 bg-surface-low rounded-md p-6 h-fit">
          <p className="text-label-md text-outline">STUDIO INFORMATION</p>
          <div className="flex items-start gap-3 text-sm"><MapPin size={16} className="text-outline mt-0.5" /><span className="text-ink-variant">{designer.atelierLocation}</span></div>
          <div className="flex items-start gap-3 text-sm"><Clock size={16} className="text-outline mt-0.5" /><span className="text-ink-variant">{designer.openingHours}</span></div>
          <div className="flex items-start gap-3 text-sm"><Mail size={16} className="text-outline mt-0.5" /><span className="text-ink-variant">{designer.contactEmail}</span></div>
        </div>
      </section>

      <section className="container-editorial mt-16">
        <p className="text-label-md text-outline mb-6">COLLECTIONS ({collections.length})</p>
        {collections.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((c) => (
              <CollectionCard key={c.id} name={c.name} category={c.category} coverImage={c.coverImage} pieceCount={c.dressIds.length} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-outline">No collections yet — add one from Manage Studio.</p>
        )}
      </section>

      <section className="container-editorial mt-16">
        <p className="text-label-md text-outline mb-6">DRESSES ({studioDresses.length})</p>
        {studioDresses.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {studioDresses.map((d) => (
              <Card key={d.id} hover>
                <div className="relative h-56">{d.images[0] && <Image src={d.images[0]} alt={d.name} fill sizes="25vw" className="object-cover" />}</div>
                <div className="p-4"><p className="text-sm font-medium truncate">{d.name}</p><p className="text-primary text-sm mt-1">{formatCurrency(d.price)}</p></div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-outline">No dresses yet — add one from Manage Studio.</p>
        )}
      </section>

      <section className="container-editorial mt-16">
        <p className="text-label-md text-outline mb-6">PREVIOUS CREATIONS ({previousCreations.length})</p>
        {previousCreations.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {previousCreations.map((cr) => (
              <Card key={cr.id} hover>
                <div className="relative h-48">{cr.image && <Image src={cr.image} alt="" fill sizes="33vw" className="object-cover" />}</div>
                <div className="p-4"><p className="text-xs text-outline mb-1">{cr.year}</p><p className="text-sm text-ink-variant">{cr.description}</p></div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-outline">No previous creations added yet.</p>
        )}
      </section>

      <section className="container-editorial mt-16">
        <p className="text-label-md text-outline mb-6">CUSTOMER REVIEWS ({reviews.length})</p>
        {reviews.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6">
            {reviews.map((r) => (
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
    </div>
  );
}
