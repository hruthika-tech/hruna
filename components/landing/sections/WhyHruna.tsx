import { ScrapbookSection } from "@/components/landing/ScrapbookSection";
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

// Section 05 — an editorial collage of why HRUNA exists, plus real platform stats.
export function WhyHruna({ stats }: { stats: { designers: number; pieces: number } }) {
  return (
    <ScrapbookSection variant="cream" tornTop tornBottom>
      <div className="text-center mb-14">
        <p className="text-label-md text-scrapbook-moss mb-3">WHY HRUNA</p>
        <h2 className="font-display text-4xl md:text-5xl text-scrapbook-forest">More than a marketplace.</h2>
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
            <p className="font-display text-5xl text-scrapbook-forest">
              <CountUp value={stats.designers} />+
            </p>
            <p className="text-label-md text-scrapbook-moss mt-2">INDEPENDENT DESIGNERS</p>
          </div>
          <div>
            <p className="font-display text-5xl text-scrapbook-forest">
              <CountUp value={stats.pieces} />+
            </p>
            <p className="text-label-md text-scrapbook-moss mt-2">REAL PIECES, MADE WITH CARE</p>
          </div>
        </FadeUp>
      )}
    </ScrapbookSection>
  );
}
