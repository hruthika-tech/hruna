import { ArrowDown } from "lucide-react";
import { ScrapbookBackground } from "@/components/landing/ScrapbookBackground";
import { AnimatedCTA } from "@/components/landing/AnimatedCTA";
import { HeroPhoto } from "@/components/landing/HeroPhoto";
import { Tape } from "@/components/landing/Tape";
import { StarDoodle, FlowerDoodle } from "@/components/landing/Doodles";

const WORDMARK = "HRUNA".split("");

// Section 01 — the scrapbook's opening page. Elegant, smooth entrance: paper background is just
// there (no fade needed, it's not a photo), the wordmark reveals letter-by-letter, supporting copy
// fades upward, the one real photograph slides into its pinned spot, CTA appears last.
export function Hero() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      <ScrapbookBackground variant="gingham" tornBottom />

      {/* Scattered decorative accents */}
      <StarDoodle className="hidden sm:block absolute top-28 left-[8%] text-scrapbook-rose/70 animate-[fadeIn_1s_ease-out_0.6s_both]" size={20} />
      <FlowerDoodle className="hidden sm:block absolute bottom-40 left-[14%] text-scrapbook-moss/70 animate-[fadeIn_1s_ease-out_0.9s_both]" size={26} />
      <StarDoodle className="hidden md:block absolute top-1/3 right-[6%] text-scrapbook-midnight/50 animate-[fadeIn_1s_ease-out_1.1s_both]" size={16} />

      <div className="container-editorial grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-12 items-center py-20">
        <div>
          <h1 className="font-display text-6xl sm:text-7xl md:text-8xl text-scrapbook-forest tracking-tight flex">
            {WORDMARK.map((letter, i) => (
              <span
                key={i}
                className="inline-block animate-[slideUp_0.6s_ease-out_both]"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                {letter}
              </span>
            ))}
          </h1>

          <p className="font-display italic text-2xl sm:text-3xl text-scrapbook-forest/80 mt-4 animate-[slideUp_0.6s_ease-out_0.55s_both]">
            Where your style finds its story.
          </p>

          <p className="text-ink-variant text-body-lg max-w-md mt-5 animate-[slideUp_0.6s_ease-out_0.7s_both]">
            HRUNA is where you discover independent designers and pieces that feel personal — not
            mass-produced, made for you.
          </p>

          <div className="flex flex-wrap items-center gap-5 mt-9 animate-[slideUp_0.6s_ease-out_0.9s_both]">
            <AnimatedCTA href="/discover" size="lg" withPin className="bg-scrapbook-rose text-scrapbook-forest hover:bg-scrapbook-rose/90">
              Explore Hruna
            </AnimatedCTA>
            <AnimatedCTA
              href="/discover"
              size="lg"
              variant="secondary"
              className="border-scrapbook-forest/30 text-scrapbook-forest hover:bg-scrapbook-forest/5"
            >
              Explore Designers
            </AnimatedCTA>
          </div>
        </div>

        <div className="relative flex justify-center md:justify-end animate-[slideUp_0.7s_ease-out_0.4s_both]">
          <div className="relative">
            <Tape rotate={6} className="absolute -top-4 left-10 z-10" />
            <HeroPhoto
              src="/images/stitch/couture-gown-atelier-crop.png"
              alt="A hand-painted couture gown sketch on an atelier desk"
              rotate={-3}
              className="w-64 sm:w-80"
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-2 text-scrapbook-forest/50">
        <span className="text-[11px] tracking-[0.25em]">SCROLL</span>
        <ArrowDown size={16} className="animate-[scrollCue_2.4s_ease-in-out_infinite]" />
      </div>
    </section>
  );
}
