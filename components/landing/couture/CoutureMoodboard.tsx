"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Moodboard } from "@/components/landing/Moodboard";
import { LookbookStrip } from "@/components/landing/LookbookStrip";
import type { Dress, Designer } from "@/types";

/** Gold ornamental corner (paisley-like flourish), rotated into each corner of the frame. */
function GoldKnot({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`hc-gold-knot ${className}`} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M2 2 H18 M2 2 V18" />
      <path d="M6 6 C 14 6, 18 10, 18 18 C 10 18, 6 14, 6 6 Z" fill="currentColor" fillOpacity="0.25" />
      <circle cx="22" cy="22" r="3" fill="currentColor" />
      <path d="M22 26 C 22 32, 28 36, 34 36 M26 22 C 32 22, 36 28, 36 34" />
    </svg>
  );
}

/** A small lotus sprig for the frame's botanical accents. */
function LotusSprig({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 80 90" className={className} aria-hidden="true">
      <path d="M40 88 C 40 70, 36 58, 40 44" stroke="#8fae6e" strokeWidth="2" fill="none" />
      <ellipse cx="22" cy="74" rx="16" ry="6" fill="#4f7a43" transform="rotate(-18 22 74)" />
      {[-50, -25, 0, 25, 50].map((a) => (
        <path
          key={a}
          d="M40 44 C 31 33, 33 16, 40 8 C 47 16, 49 33, 40 44 Z"
          transform={`rotate(${a} 40 44)`}
          fill="#e9a6b8"
          stroke="#c9708a"
          strokeWidth="0.8"
        />
      ))}
      <circle cx="40" cy="40" r="4" fill="#d4ae5f" />
    </svg>
  );
}

// Homepage section 04 (couture experiment). Same heading, real dresses, cards and lookbook strip
// as sections/MoodboardSection.tsx. Burgundy invitation backdrop inside a double gold frame with
// ornamental corners and lotus sprigs; the pinned pieces arrive like an editorial collage (staggered
// drop-in with a slight turn) and drift gently at different speeds as the page scrolls.
export function CoutureMoodboard({ dresses, designersById }: { dresses: Dress[]; designersById: Map<string, Designer> }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.from(".hc-mood-heading > *", {
        y: 30,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: ".hc-mood-heading", start: "top 80%" },
      });
      gsap.from(".hc-gold-frame", { opacity: 0, scale: 0.97, duration: 1, ease: "power2.out", scrollTrigger: { trigger: ".hc-gold-frame", start: "top 80%" } });
      // Each pinned piece is a direct child of the Moodboard's flex row.
      const cards = gsap.utils.toArray<HTMLElement>(".hc-mood-collage > div > *");
      gsap.from(cards, {
        y: 60,
        opacity: 0,
        rotate: (i: number) => (i % 2 === 0 ? -10 : 10),
        scale: 0.92,
        duration: 0.9,
        ease: "back.out(1.3)",
        stagger: 0.08,
        scrollTrigger: { trigger: ".hc-mood-collage", start: "top 78%" },
      });
      cards.forEach((card, i) => {
        gsap.to(card, {
          yPercent: i % 3 === 0 ? -8 : i % 3 === 1 ? 6 : -3,
          ease: "none",
          scrollTrigger: { trigger: ".hc-mood-collage", start: "top bottom", end: "bottom top", scrub: true },
        });
      });
      gsap.from(".hc-mood-lookbook", { y: 40, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".hc-mood-lookbook", start: "top 85%" } });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={ref} className="hc-root relative overflow-clip bg-[#7a1622] py-24 md:py-32">
      {/* Burgundy backdrop with the gold saree drapes, shown as-is (no tint). A screen-sized layer
          with object-cover stays pinned while the moodboard scrolls over it: a screen has nearly the
          same 16:9 shape as the artwork, so the drapes at both sides and the bottom stay in view at
          near-native sharpness however tall the section grows (covering the whole section instead
          would enlarge the photo and crop the sides away). overflow-clip, not overflow-hidden, so
          the sticky layer can stick. */}
      {/* Phones: damask tile over the whole section, the saree drapes along the bottom (couture.css). */}
      <div className="hc-m-mood-bg md:hidden" aria-hidden="true" />
      <div className="absolute inset-0 hidden md:block" aria-hidden="true">
        <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
          <Image
            src="/images/couture/moodboard-burgundy-saree.png"
            alt=""
            fill
            quality={90}
            sizes="(max-aspect-ratio: 16/9) 180vh, 100vw"
            className="object-cover object-[center_bottom]"
          />
        </div>
      </div>
      <div className="container-editorial relative z-10">
        <div className="hc-gold-frame rounded-sm px-4 py-14 sm:px-8 md:px-14 md:py-20">
          <GoldKnot className="-top-1 -left-1" />
          <GoldKnot className="-top-1 -right-1 rotate-90" />
          <GoldKnot className="-bottom-1 -right-1 rotate-180" />
          <GoldKnot className="-bottom-1 -left-1 -rotate-90" />
          <LotusSprig className="hidden md:block absolute -left-8 bottom-16 w-20 h-24" />
          <LotusSprig className="hidden md:block absolute -right-8 top-24 w-16 h-20 -scale-x-100" />

          <div className="hc-mood-heading text-center mb-14">
            <p className="text-label-md text-[#ead6a4] mb-3">THE HRUNA MOODBOARD</p>
            <h2 className="font-display text-4xl md:text-5xl text-[#f7efdf] leading-tight">
              Find your mood.
              <br />
              Then find your dress.
            </h2>
          </div>

          {dresses.length === 0 ? (
            <div className="max-w-md mx-auto text-center py-16">
              <p className="font-display text-2xl text-[#f7efdf] mb-3">The Moodboard</p>
              <p className="text-[#f7efdf]/80">New pieces are being pinned up — check back soon.</p>
            </div>
          ) : (
            <div className="hc-mood-collage">
              <Moodboard dresses={dresses} designersById={designersById} />
            </div>
          )}

          {dresses.length >= 3 && (
            <div className="hc-mood-lookbook mt-20">
              <p className="text-label-md text-[#ead6a4] mb-4 text-center">EXPLORE LOOKS</p>
              <div className="ring-1 ring-[#d4ae5f]/60 rounded-md">
                <LookbookStrip dresses={dresses} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
