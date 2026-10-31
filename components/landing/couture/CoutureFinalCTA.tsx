import Image from "next/image";
import { PaperCard } from "@/components/landing/PaperCard";
import { AnimatedCTA } from "@/components/landing/AnimatedCTA";
import { FadeUp } from "@/components/landing/Motion";

// Homepage final CTA (couture experiment). Same card, copy, buttons, links and FadeUp animation as
// sections/FinalCTA.tsx, laid on an emerald Kanjivaram silk saree with its gold border running along
// the bottom.
//
// The photo covers the section anchored to its bottom edge, so any crop only trims plain silk at the
// top (or the repeating border at the sides) — the gold border is never cut. The border is the
// bottom ~24.5% of the 1600×742 image, so the bottom padding leaves room for it below the card:
// at least 190px, or 11.4vw + 16px on wide screens (where the image is drawn by width,
// 0.464 × width tall).
export function CoutureFinalCTA() {
  return (
    <section className="relative bg-[#0d3d1f] pt-24 md:pt-32 pb-[max(190px,calc(11.4vw+16px))] overflow-hidden">
      <Image
        src="/images/couture/final-cta-emerald-pattu.jpg"
        alt=""
        aria-hidden="true"
        fill
        quality={90}
        sizes="(max-width: 1279px) 1600px, 100vw"
        className="object-cover object-[center_bottom]"
      />

      <div className="container-editorial relative flex justify-center">
        <FadeUp className="w-full max-w-lg">
          <PaperCard rotate={-1} className="px-8 py-12 md:px-14 md:py-16 text-center">
            <h2 className="font-display text-4xl md:text-5xl text-scrapbook-forest mb-3">Ready to find your piece?</h2>
            <p className="font-display italic text-xl text-scrapbook-forest/70 mb-9">Your style is waiting.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <AnimatedCTA href="/discover" size="lg" withPin className="bg-scrapbook-rose text-scrapbook-forest hover:bg-scrapbook-rose/90">
                Explore Hruna
              </AnimatedCTA>
              <AnimatedCTA
                href="/become-a-designer"
                size="lg"
                variant="secondary"
                className="border-scrapbook-forest/30 text-scrapbook-forest hover:bg-scrapbook-forest/5"
              >
                Join as a Designer
              </AnimatedCTA>
            </div>
          </PaperCard>
        </FadeUp>
      </div>
    </section>
  );
}
