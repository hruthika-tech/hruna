import { Footer } from "@/components/layout/Footer";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { CoutureHero } from "@/components/landing/couture/CoutureHero";
import { CoutureJourney } from "@/components/landing/couture/CoutureJourney";
import { CoutureDesignerBook } from "@/components/landing/couture/CoutureDesignerBook";
import { CoutureMoodboard } from "@/components/landing/couture/CoutureMoodboard";
import { SectionMorph } from "@/components/landing/couture/SectionMorph";
import { SectionFlexCarousel } from "@/components/landing/couture/SectionFlexCarousel";
import "@/components/landing/couture/couture.css";
import { CoutureWhyHruna } from "@/components/landing/couture/CoutureWhyHruna";
import { CoutureFinalCTA } from "@/components/landing/couture/CoutureFinalCTA";
import { createClient } from "@/lib/supabase/server";
import { listApprovedDesigners, listDresses, getPlatformStats } from "@/lib/customer/discovery";
import { redirect } from "next/navigation";
import { strayEmailLinkPath } from "@/lib/auth/auth-flows";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: DEFAULT_TITLE, absoluteTitle: true, description: DEFAULT_DESCRIPTION, path: "/" });

// The landing page is a thin server-side orchestrator: fetch real data once, hand it down to six
// section components (components/landing/sections/) rather than one giant page file. No mock/seed
// data anywhere — every designer, dress and stat below is real.
export default async function LandingPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // An email verification link that Supabase sent to the bare Site URL (its redirect_to wasn't
  // allow-listed) is finished by /auth/confirm instead of being dropped here — see strayEmailLinkPath.
  const one = (name: string) => {
    const v = searchParams[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const strayLink = strayEmailLinkPath(one);
  if (strayLink) redirect(strayLink);

  const supabase = createClient();
  const [designers, dresses, stats] = await Promise.all([
    listApprovedDesigners(supabase, 6),
    listDresses(supabase, 10),
    getPlatformStats(supabase),
  ]);
  const designersById = new Map(designers.map((d) => [d.id, d]));

  return (
    <div>
      <LandingHeader />
      {/* Indian-couture visual experiment (homepage only): sections 01–04 use the couture
          variants in components/landing/couture/; the original section components are unchanged
          in components/landing/sections/ and can be swapped back here. */}
      <CoutureHero />
      <CoutureJourney />
      <SectionFlexCarousel />
      <CoutureDesignerBook designers={designers} />
      <SectionMorph
        label="Couture in the palace"
        transition="swirl"
        from="#5c1526"
        to="#3d0d18"
        images={["/images/couture/palace-trio.png", "/images/couture/hero-palace-blue-ensemble.png", "/images/couture/sketch-lotus-gowns.png"]}
      />
      <CoutureMoodboard dresses={dresses} designersById={designersById} />
      <CoutureWhyHruna stats={stats} />
      <CoutureFinalCTA />
      {/* Homepage-only saree background for the shared footer (couture.css .hc-footer). */}
      <div className="hc-footer">
        <Footer />
      </div>
    </div>
  );
}
