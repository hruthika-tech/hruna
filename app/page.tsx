import { Footer } from "@/components/layout/Footer";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/sections/Hero";
import { Journey } from "@/components/landing/sections/Journey";
import { DesignerBookSection } from "@/components/landing/sections/DesignerBookSection";
import { MoodboardSection } from "@/components/landing/sections/MoodboardSection";
import { WhyHruna } from "@/components/landing/sections/WhyHruna";
import { FinalCTA } from "@/components/landing/sections/FinalCTA";
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
      <Hero />
      <Journey />
      <DesignerBookSection designers={designers} />
      <MoodboardSection dresses={dresses} designersById={designersById} />
      <WhyHruna stats={stats} />
      <FinalCTA />
      <Footer />
    </div>
  );
}
