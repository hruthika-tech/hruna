import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DesignerCard } from "@/components/designer/DesignerCard";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/supabase/authorization";
import { listApprovedDesigners, listCollections, listDresses } from "@/lib/customer/discovery";
import { formatCurrency } from "@/lib/utils";
import { DressAvailabilityNote } from "@/components/dresses/DressAvailabilityNote";
import { dressAvailability } from "@/lib/dresses/availability";

// Real data (Phase 7 fix) — this page used to read lib/mock-data.ts entirely; it now reads the
// same real designer_profiles/collections/dresses rows the public Studio page and Discover use,
// via lib/customer/discovery.ts. Server Component, so no client-side loading state is needed.
//
// Bug fix: this used requireCustomer(), which THROWS for any signed-in account with no
// customer_profiles row — a hard, unhandled crash, not a redirect. That's exactly what an admin
// or designer-only account hits, because /login's "sign back in" flow always sends everyone to
// /home regardless of role (it was only ever built with customers in mind). Non-throwing
// getAuthContext() + an explicit role-aware redirect means /home now sends each kind of account
// to where it actually belongs instead of crashing.
export default async function CustomerHomePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.customerId) {
    if (ctx.isAdmin) redirect("/admin");
    if (ctx.designerId) redirect("/designer/home");
    redirect("/choose-role");
  }
  const supabase = createClient();

  const [{ data: profile }, designers, collections, dresses] = await Promise.all([
    supabase.from("customer_profiles").select("name").eq("id", ctx.customerId).maybeSingle(),
    listApprovedDesigners(supabase, 4),
    listCollections(supabase, 3),
    listDresses(supabase, 4),
  ]);
  const firstName = (profile?.name || "there").split(" ")[0];

  return (
    <div className="pb-section-gap">
      {/* Welcome strip */}
      <section className="container-editorial pt-12 pb-10">
        <p className="text-label-md text-outline mb-2">GOOD TO SEE YOU, {firstName.toUpperCase()}</p>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <h1 className="text-headline-md md:text-4xl max-w-lg">What are we creating next?</h1>
          <LinkButton href="/requests/new" size="lg">Start a Fashion Request</LinkButton>
        </div>
      </section>

      {/* Recommended designers */}
      <section className="container-editorial pb-section-gap">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-headline-sm">Recommended for you</h2>
          <Link href="/discover" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            See all <ArrowRight size={14} />
          </Link>
        </div>
        {designers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {designers.map((d) => (
              <DesignerCard key={d.id} designer={d} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-outline">No approved designers yet — check back soon.</p>
        )}
      </section>

      {/* Collections */}
      {collections.length > 0 && (
        <section className="bg-surface-low py-section-gap">
          <div className="container-editorial">
            <div className="flex items-end justify-between mb-8">
              <h2 className="text-headline-sm">Collections to explore</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {collections.map((c) => (
                <Link key={c.id} href={`/collections/${c.id}`}>
                  <Card hover className="group">
                    <div className="relative h-64 overflow-hidden">
                      {c.coverImage && (
                        <Image
                          src={c.coverImage}
                          alt={c.name}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-outline uppercase tracking-wide mb-1">{c.category}</p>
                      <p className="font-display text-xl">{c.name}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Dresses */}
      {dresses.length > 0 && (
        <section className="container-editorial py-section-gap">
          <div className="flex items-end justify-between mb-8">
            <h2 className="text-headline-sm">Ready-made pieces</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {dresses.map((d) => (
              <Link key={d.id} href={`/dresses/${d.id}`}>
                <Card hover>
                  <div className="relative h-72 overflow-hidden">
                    {d.images[0] && <Image src={d.images[0]} alt={d.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />}
                    {dressAvailability(d).badge && (
                      <span className="absolute top-3 left-3 bg-ink/70 text-white text-xs px-3 py-1 rounded-full">{dressAvailability(d).badge}</span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-medium text-sm truncate">{d.name}</p>
                    <p className="text-primary text-sm mt-1">{formatCurrency(d.price)}</p>
                    <DressAvailabilityNote dress={d} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
