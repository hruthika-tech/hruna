"use client";

import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { motion } from "framer-motion";
import { AnimatedCTA } from "@/components/landing/AnimatedCTA";

const WORDMARK = "HRUNA".split("");
const EASE = [0.22, 1, 0.36, 1] as const;

/** A small gold lotus pin holding the photograph to the fabric. */
function LotusPin() {
  return (
    <svg viewBox="-20 -18 40 30" className="h-9 w-12 drop-shadow-[0_3px_3px_rgba(40,10,20,0.45)]" aria-hidden="true">
      <defs>
        <linearGradient id="hc-pin-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4dd9c" />
          <stop offset="55%" stopColor="#d4ae5f" />
          <stop offset="100%" stopColor="#9c7630" />
        </linearGradient>
      </defs>
      {[-60, -30, 0, 30, 60].map((a) => (
        <path key={a} d="M0 4 C -5 -3, -4 -11, 0 -16 C 4 -11, 5 -3, 0 4 Z" transform={`rotate(${a} 0 4)`} fill="url(#hc-pin-gold)" stroke="#8a6526" strokeWidth="0.6" />
      ))}
      <circle cx="0" cy="3" r="3.2" fill="#f7e7b4" stroke="#8a6526" strokeWidth="0.6" />
    </svg>
  );
}

// Homepage section 01 (couture experiment). Same content and links as sections/Hero.tsx — the
// wordmark, tagline, intro copy, both "Explore" CTAs to /discover and the scroll cue — on a pink
// embroidered fabric, with the five-gown illustration pinned to it like a moodboard photograph.
// Desktop: copy on the left, photograph on the right. Phones: copy and buttons first, the
// photograph below them (DOM order), never overlapping.
// Motion: the wordmark slides in letter by letter, the copy fades up, the buttons follow with a
// stagger, and the photograph slides in from the right as it settles to its tilt, then floats very
// gently (couture.css .hc-float). Reduced motion: couture.css pins every .hc-motion element in place.
export function CoutureHero() {
  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: EASE, delay },
  });

  return (
    <section className="relative md:min-h-[calc(100svh-72px)] flex items-center overflow-hidden bg-[#b8687c]">
      {/* The embroidered fabric. Desktop: one photo covering the section (drawn at or below its
          native size). Phones: a seamless mirrored tile at native sharpness (couture.css). */}
      <Image
        src="/images/couture/hero-pink-embroidery.png"
        alt=""
        aria-hidden="true"
        fill
        priority
        quality={90}
        sizes="(max-width: 767px) 1px, 100vw"
        className="hidden md:block object-cover object-center"
      />
      <div className="hc-m-hero-bg md:hidden" aria-hidden="true" />

      {/* Readability: a soft wine veil, deepest behind the copy. */}
      <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-[#3a1220]/75 via-[#3a1220]/35 to-[#3a1220]/5" aria-hidden="true" />
      <div className="md:hidden absolute inset-0 bg-gradient-to-b from-[#3a1220]/70 via-[#3a1220]/45 to-[#3a1220]/25" aria-hidden="true" />

      <div className="container-editorial relative z-10 grid grid-cols-1 md:grid-cols-[0.95fr_1.05fr] items-center gap-12 md:gap-10 py-14 md:py-20">
        <div className="max-w-xl">
          <h1 className="hc-hero-title font-display text-6xl sm:text-7xl md:text-8xl text-[#f7efdf] tracking-tight flex overflow-hidden pb-2">
            {WORDMARK.map((letter, i) => (
              <motion.span
                key={i}
                className="hc-motion inline-block"
                initial={{ x: -60, y: 20, opacity: 0, rotate: -6 }}
                animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.15 + i * 0.1 }}
              >
                {letter}
              </motion.span>
            ))}
          </h1>

          <motion.div
            className="hc-motion h-px w-40 bg-gradient-to-r from-[#d4ae5f] to-transparent mt-3"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, ease: EASE, delay: 0.75 }}
            style={{ transformOrigin: "left" }}
            aria-hidden="true"
          />

          <motion.p {...fadeUp(0.85)} className="hc-motion hc-hero-copy font-display italic text-2xl sm:text-3xl text-[#f6dfa6] mt-5">
            Where your style finds its story.
          </motion.p>

          <motion.p {...fadeUp(1.0)} className="hc-motion hc-hero-copy text-[#fbf3e6] text-body-lg max-w-md mt-5">
            HRUNA is where you discover independent designers and pieces that feel personal — not
            mass-produced, made for you.
          </motion.p>

          <div className="flex flex-wrap items-center gap-5 mt-9">
            <motion.div {...fadeUp(1.2)} className="hc-motion">
              <AnimatedCTA href="/discover" size="lg" withPin className="bg-[#d4ae5f] text-[#13261a] hover:bg-[#ead6a4]">
                Explore Hruna
              </AnimatedCTA>
            </motion.div>
            <motion.div {...fadeUp(1.35)} className="hc-motion">
              <AnimatedCTA
                href="/discover"
                size="lg"
                variant="secondary"
                className="border-[#f7efdf]/70 text-[#f7efdf] hover:bg-[#f7efdf]/10"
              >
                Explore Designers
              </AnimatedCTA>
            </motion.div>
          </div>
        </div>

        {/* The pinned photograph: slides in from the right while settling to its tilt. */}
        <motion.div
          className="hc-motion relative mx-auto w-full max-w-[34rem] md:max-w-none px-1 md:px-0"
          initial={{ opacity: 0, x: 90, rotate: 7 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: 1.3, ease: EASE, delay: 0.55 }}
        >
          <div className="hc-float">
            <div className="hc-pinned-photo relative rotate-[2.5deg]">
              <div className="absolute left-1/2 -top-5 z-20 -translate-x-1/2">
                <LotusPin />
              </div>
              <div className="hc-paper p-[3.2%] pb-[7%]">
                <div className="relative aspect-[3/2] w-full overflow-hidden">
                  <Image
                    src="/images/couture/sketch-lotus-gowns.png"
                    alt="Fashion illustration of five lotus-inspired couture gowns in blush, rose and ivory"
                    fill
                    priority
                    quality={90}
                    sizes="(max-width: 767px) 92vw, 52vw"
                    className="object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Positioned by the outer div; the motion is on the inner one so it can't override the centring transform. */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:block z-10">
        <motion.div {...fadeUp(1.8)} className="hc-motion flex flex-col items-center gap-2 text-[#f7efdf]/75">
          <span className="text-[11px] tracking-[0.25em]">SCROLL</span>
          <ArrowDown size={16} className="animate-[scrollCue_2.4s_ease-in-out_infinite]" />
        </motion.div>
      </div>
    </section>
  );
}
