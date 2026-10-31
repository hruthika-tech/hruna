import { PaperCard } from "@/components/landing/PaperCard";
import { Tape } from "@/components/landing/Tape";
import { CountUp } from "@/components/landing/CountUp";
import { FadeUp, Stagger, StaggerItem } from "@/components/landing/Motion";
import { ScissorsDoodle, ThreadDoodle, FlowerDoodle, StarDoodle } from "@/components/landing/Doodles";

const IDEAS = [
  { icon: ScissorsDoodle, title: "Independent Designers", copy: "Discover the people behind the clothes.", rotate: -2 },
  { icon: ThreadDoodle, title: "Made With Intention", copy: "Find pieces with personality.", rotate: 2 },
  { icon: FlowerDoodle, title: "Your Style", copy: "Discover something that actually feels like you.", rotate: 1.5 },
  { icon: StarDoodle, title: "Creative Community", copy: "A place where designers and fashion lovers meet.", rotate: -1.5 },
];

// Homepage "Why HRUNA" (couture experiment). Same content, cards, stats and animations as
// sections/WhyHruna.tsx, on a gradient that joins the two sections around it: the Moodboard's
// burgundy (#731419, sampled from its artwork) at the top to the final CTA saree's emerald
// (#032d0c, sampled from its top edge) at the bottom — through deep wine and forest so the
// middle doesn't turn muddy. Text that sits directly on the gradient is ivory/gold for contrast;
// the cream cards are unchanged.
export function CoutureWhyHruna({ stats }: { stats: { designers: number; pieces: number } }) {
  return (
    <section
      className="relative py-20 md:py-28 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #731419 0%, #4a0e16 30%, #1f1210 52%, #08240f 75%, #032d0c 100%)" }}
    >
      <div className="container-editorial relative">
        <div className="text-center mb-14">
          <p className="text-label-md text-[#ead6a4] mb-3">WHY HRUNA</p>
          <h2 className="font-display text-4xl md:text-5xl text-[#f7efdf]">More than a marketplace.</h2>
        </div>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-10 max-w-3xl mx-auto" stagger={0.12}>
          {IDEAS.map(({ icon: Icon, title, copy, rotate }, i) => (
            <StaggerItem key={title} className={i % 2 === 1 ? "sm:mt-8" : ""}>
              <PaperCard rotate={rotate} className="relative p-6">
                {i === 0 && <Tape rotate={-8} className="absolute -top-3 left-6 z-10" />}
                <Icon size={26} className="text-scrapbook-rose mb-4" />
                <h3 className="font-display text-xl text-scrapbook-forest mb-1.5">{title}</h3>
                <p className="text-ink-variant text-sm">{copy}</p>
              </PaperCard>
            </StaggerItem>
          ))}
        </Stagger>

        {(stats.designers > 0 || stats.pieces > 0) && (
          <FadeUp className="flex flex-wrap justify-center gap-16 mt-20 text-center">
            <div>
              <p className="font-display text-5xl text-[#f7efdf]">
                <CountUp value={stats.designers} />+
              </p>
              <p className="text-label-md text-[#ead6a4] mt-2">INDEPENDENT DESIGNERS</p>
            </div>
            <div>
              <p className="font-display text-5xl text-[#f7efdf]">
                <CountUp value={stats.pieces} />+
              </p>
              <p className="text-label-md text-[#ead6a4] mt-2">REAL PIECES, MADE WITH CARE</p>
            </div>
          </FadeUp>
        )}
      </div>
    </section>
  );
}
