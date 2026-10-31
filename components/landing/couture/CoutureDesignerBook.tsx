"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DesignerPage } from "@/components/landing/DesignerPage";
import type { Designer } from "@/types";

/** One designer card mounted in the book like a photograph (gold corners on all four sides). */
function MountedPhoto({ designer, rotate }: { designer: Designer; rotate: number }) {
  return (
    <div className="hc-book-card h-full" style={{ transform: `rotate(${rotate}deg)` }}>
      <div className="hc-photo h-full transition-transform duration-500 ease-out hover:-translate-y-1.5 hover:rotate-0">
        <span className="hc-corner-bl" aria-hidden="true" />
        <span className="hc-corner-br" aria-hidden="true" />
        <DesignerPage designer={designer} rotate={0} />
      </div>
    </div>
  );
}

// Homepage section 03 (couture experiment). Same heading, real designers and links as
// sections/DesignerBookSection.tsx + DesignerBook.tsx (including the empty state and the mobile
// swipe row). A luxury portfolio book on pink-and-burgundy textile: the spread opens from the
// spine as it scrolls in, then each designer card is laid onto the page like a mounted photograph.
export function CoutureDesignerBook({ designers }: { designers: Designer[] }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.from(".hc-book-heading > *", {
        y: 30,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: ".hc-book-heading", start: "top 80%" },
      });
      const tl = gsap.timeline({ scrollTrigger: { trigger: ".hc-book", start: "top 75%" } });
      tl.from(".hc-book", { scaleX: 0.08, opacity: 0, transformOrigin: "50% 50%", duration: 1.1, ease: "power3.inOut" }).from(
        ".hc-book-card",
        { y: 40, opacity: 0, rotate: (i: number) => (i % 2 === 0 ? -8 : 8), duration: 0.8, ease: "back.out(1.4)", stagger: 0.12 },
        "-=0.25"
      );
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={ref} className="hc-root hc-book-backdrop hc-grain relative overflow-hidden py-24 md:py-32" style={{ backgroundImage: "url(/images/couture/book-pink-textiles.jpg)" }}>
      <div className="container-editorial relative z-10">
        <div className="hc-book-heading text-center mb-14">
          <p className="text-label-md text-[#ead6a4] mb-3">THE HRUNA DESIGNER BOOK</p>
          <h2 className="font-display text-4xl md:text-5xl text-[#f7efdf]">Every page, a real studio.</h2>
        </div>

        {designers.length === 0 ? (
          <div className="hc-book max-w-md mx-auto text-center py-16 px-8 rounded-md">
            <p className="font-display text-2xl text-[#5c1526] mb-3">The Designer Book</p>
            <p className="text-ink-variant">New pages are being written — check back soon as designers join HRUNA.</p>
          </div>
        ) : (
          <div className="hc-book rounded-md px-5 py-8 md:px-12 md:py-14">
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-10">
              {designers.map((d, i) => (
                <MountedPhoto key={d.id} designer={d} rotate={i % 2 === 0 ? -1.5 : 1.5} />
              ))}
            </div>
            <div className="md:hidden flex gap-5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4 -mx-5 px-5 pt-2">
              {designers.map((d) => (
                <div key={d.id} className="snap-center shrink-0 w-[74vw]">
                  <MountedPhoto designer={d} rotate={0} />
                </div>
              ))}
            </div>
            <p className="md:hidden text-center text-xs text-[#5c1526]/70 mt-2">← swipe to browse →</p>
          </div>
        )}
      </div>
    </section>
  );
}
