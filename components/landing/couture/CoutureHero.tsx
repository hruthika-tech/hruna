"use client";

import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { motion } from "framer-motion";
import { AnimatedCTA } from "@/components/landing/AnimatedCTA";

const WORDMARK = "HRUNA".split("");
const EASE = [0.22, 1, 0.36, 1] as const;

// Homepage section 01 (couture experiment). Same content and links as sections/Hero.tsx — the
// wordmark, tagline, intro copy, both "Explore" CTAs to /discover and the scroll cue — over a
// full-screen couture illustration. Cinematic reveal: two curtain panels part while the photo settles from
// a slow zoom; then the wordmark slides in letter by letter and the copy/CTAs fade up in sequence.
export function CoutureHero() {
  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 28 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: EASE, delay },
  });

  // Same markup on the server and the client (no hydration mismatch). For visitors who prefer
  // reduced motion, couture.css pins every .hc-motion element to its final state and hides the
  // curtains, so nothing moves and all content is visible immediately.
  return (
    <section className="relative min-h-[calc(100svh-72px)] flex items-center overflow-hidden bg-[#c27088]">
      {/* The photograph, untouched: a slow settle from 1.12x while the curtains open. */}
      <motion.div
        className="hc-motion absolute inset-0"
        initial={{ scale: 1.12 }}
        animate={{ scale: 1 }}
        transition={{ duration: 2.6, ease: EASE }}
      >
        <Image
          src="/images/couture/sketch-lotus-gowns.png"
          alt="Fashion illustration of five lotus-inspired couture gowns in blush, rose and ivory"
          fill
          priority
          // object-cover on a screen taller than the 3:2 artwork draws it wider than the viewport
          // (by height × 1.5), and the opening zoom adds 12% — ask for enough pixels to stay sharp.
          sizes="(max-aspect-ratio: 3/2) 170vh, 115vw"
          quality={90}
          className="object-cover object-[center_12%]"
        />
      </motion.div>

      {/* Legibility veil (warm, to suit the blush artwork) — deepest behind the copy, clear over the gowns. */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#2a0f16]/85 via-[#2a0f16]/50 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#2a0f16]/60 to-transparent" aria-hidden="true" />
      {/* Phones: the copy spans the full width (over the brightest gown), so an even veil keeps it readable. */}
      <div className="absolute inset-0 bg-[#2a0f16]/40 md:hidden" aria-hidden="true" />

      {/* Curtain reveal: two rose panels (pinks from the gowns) with gold edges part on load. */}
      {/* Hidden entirely for reduced motion (couture.css). */}
      <>
          <motion.div
            className="hc-curtain absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#a8506a] via-[#c97a8f] to-[#e2a9b6] border-r-2 border-[#d4ae5f] z-20"
            initial={{ x: 0 }}
            animate={{ x: "-101%" }}
            transition={{ duration: 1.4, ease: EASE, delay: 0.15 }}
            aria-hidden="true"
          />
          <motion.div
            className="hc-curtain absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#a8506a] via-[#c97a8f] to-[#e2a9b6] border-l-2 border-[#d4ae5f] z-20"
            initial={{ x: 0 }}
            animate={{ x: "101%" }}
            transition={{ duration: 1.4, ease: EASE, delay: 0.15 }}
            aria-hidden="true"
          />
      </>

      <div className="container-editorial relative z-10 py-20">
        <div className="max-w-xl">
          <h1 className="hc-hero-title font-display text-6xl sm:text-7xl md:text-8xl text-[#f7efdf] tracking-tight flex overflow-hidden pb-2">
            {WORDMARK.map((letter, i) => (
              <motion.span
                key={i}
                className="hc-motion inline-block"
                initial={{ x: -60, y: 20, opacity: 0, rotate: -6 }}
                animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 1.1 + i * 0.11 }}
              >
                {letter}
              </motion.span>
            ))}
          </h1>

          <motion.div
            className="hc-motion h-px w-40 bg-gradient-to-r from-[#d4ae5f] to-transparent mt-3"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, ease: EASE, delay: 1.7 }}
            style={{ transformOrigin: "left" }}
            aria-hidden="true"
          />

          <motion.p {...fadeUp(1.85)} className="hc-motion hc-hero-copy font-display italic text-2xl sm:text-3xl text-[#ead6a4] mt-5">
            Where your style finds its story.
          </motion.p>

          <motion.p {...fadeUp(2.05)} className="hc-motion hc-hero-copy text-[#f7efdf]/90 text-body-lg max-w-md mt-5">
            HRUNA is where you discover independent designers and pieces that feel personal — not
            mass-produced, made for you.
          </motion.p>

          <div className="flex flex-wrap items-center gap-5 mt-9">
            <motion.div {...fadeUp(2.3)} className="hc-motion">
              <AnimatedCTA href="/discover" size="lg" withPin className="bg-[#d4ae5f] text-[#13261a] hover:bg-[#ead6a4]">
                Explore Hruna
              </AnimatedCTA>
            </motion.div>
            <motion.div {...fadeUp(2.45)} className="hc-motion">
              <AnimatedCTA
                href="/discover"
                size="lg"
                variant="secondary"
                className="border-[#f7efdf]/60 text-[#f7efdf] hover:bg-[#f7efdf]/10"
              >
                Explore Designers
              </AnimatedCTA>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Positioned by the outer div; the motion is on the inner one so it can't override the centring transform. */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:block z-10">
        <motion.div {...fadeUp(2.8)} className="hc-motion flex flex-col items-center gap-2 text-[#f7efdf]/70">
          <span className="text-[11px] tracking-[0.25em]">SCROLL</span>
          <ArrowDown size={16} className="animate-[scrollCue_2.4s_ease-in-out_infinite]" />
        </motion.div>
      </div>
    </section>
  );
}
