"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STEPS = [
  { num: "01", title: "Discover", copy: "Browse a curated world of independent designers, boutiques and tailors." },
  { num: "02", title: "Explore Designers", copy: "Step into their studios — real portfolios, real craft, real people." },
  { num: "03", title: "Find Your Piece", copy: "From ready-made pieces to a fully custom commission, made your way." },
  { num: "04", title: "Make It Yours", copy: "Share your vision — measurements, fabric, budget — in one private request." },
  { num: "05", title: "Bring It Home", copy: "Track every stage, from first sketch to the final fitting at your door." },
];

// Deterministic petal positions (no Math.random — server and client render the same markup).
const PETALS = [
  { left: "8%", delay: "0s", duration: "16s", drift: "80px" },
  { left: "22%", delay: "5s", duration: "19s", drift: "-60px" },
  { left: "38%", delay: "9s", duration: "17s", drift: "70px" },
  { left: "55%", delay: "2s", duration: "21s", drift: "-90px" },
  { left: "71%", delay: "7s", duration: "18s", drift: "60px" },
  { left: "86%", delay: "12s", duration: "20s", drift: "-70px" },
  { left: "47%", delay: "14s", duration: "22s", drift: "40px" },
];

const PETAL_ANGLES = [-72, -48, -24, 0, 24, 48, 72];

/** A lotus drawn in SVG: leaf pad, two rings of veined petals (each unfolds from a closed bud
 *  around its base — data-a is its open angle), gold heart with the step number centred on it. */
function Lotus({ num }: { num: string }) {
  return (
    <svg viewBox="-60 -70 120 100" className="hc-lotus w-36 h-[7.75rem] md:w-[10.5rem] md:h-36 overflow-visible drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" aria-hidden="true">
      <ellipse className="hc-lotus-leaf" cx="0" cy="14" rx="54" ry="13" fill="#3f6b3a" stroke="#a9c48a" strokeWidth="1" />
      <path className="hc-lotus-leaf" d="M-50 14 Q0 2 50 14" stroke="#a9c48a" strokeWidth="0.8" fill="none" />
      {PETAL_ANGLES.map((a) => (
        <g key={`o${a}`} transform={`rotate(${a})`}>
          <g className="hc-lotus-petal hc-lotus-petal--outer" data-a={a}>
            <path d="M0 6 C -13 -12, -10 -40, 0 -52 C 10 -40, 13 -12, 0 6 Z" fill="url(#hc-petal-outer)" stroke="#b9587a" strokeWidth="1" />
            <path d="M0 2 C -1 -16, -1 -32, 0 -46 M0 -8 C -4 -18, -5 -28, -4 -36 M0 -8 C 4 -18, 5 -28, 4 -36" stroke="#c9708a" strokeOpacity="0.55" strokeWidth="0.6" fill="none" />
          </g>
        </g>
      ))}
      {PETAL_ANGLES.slice(1, -1).map((a) => (
        <g key={`i${a}`} transform={`rotate(${a * 0.6})`}>
          <g className="hc-lotus-petal hc-lotus-petal--inner" data-a={a * 0.6}>
            <path d="M0 4 C -9 -10, -7 -30, 0 -40 C 7 -30, 9 -10, 0 4 Z" fill="url(#hc-petal-inner)" stroke="#d07a96" strokeWidth="0.8" />
            <path d="M0 0 C -1 -12, -1 -24, 0 -34" stroke="#d98aa0" strokeOpacity="0.6" strokeWidth="0.5" fill="none" />
          </g>
        </g>
      ))}
      <circle className="hc-lotus-heart" cx="0" cy="-2" r="11" fill="#d4ae5f" stroke="#f1dca2" strokeWidth="1" />
      <text x="0" y="-2" textAnchor="middle" dominantBaseline="central" className="hc-lotus-heart" fontSize="10" fontFamily="serif" fill="#13261a">
        {num}
      </text>
    </svg>
  );
}

// Homepage section 02 (couture experiment). Same steps and copy as sections/Journey.tsx. Emerald
// textured backdrop with the lotus artwork along both edges and drifting petals; each stage's lotus
// blooms (petals grow from the base, outer ring then inner) as that stage scrolls into view.
export function CoutureJourney() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // Everything is already drawn fully open and visible.
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.from(".hc-journey-heading > *", {
        y: 30,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: ".hc-journey-heading", start: "top 80%" },
      });
      gsap.fromTo(
        ".hc-journey-spine",
        { scaleY: 0 },
        { scaleY: 1, ease: "none", transformOrigin: "top", scrollTrigger: { trigger: ".hc-journey-steps", start: "top 75%", end: "bottom 60%", scrub: true } }
      );
      gsap.utils.toArray<HTMLElement>(".hc-journey-step").forEach((step) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: step, start: "top 78%" } });
        const unfold = (el: Element) => -Number((el as HTMLElement).dataset.a ?? 0);
        tl.from(step.querySelectorAll(".hc-lotus-leaf"), { scaleX: 0, opacity: 0, svgOrigin: "0 14", duration: 0.7, ease: "power2.out" })
          .from(
            step.querySelectorAll(".hc-lotus-petal--outer"),
            { rotation: (_i: number, el: Element) => unfold(el), scale: 0.35, opacity: 0, svgOrigin: "0 6", duration: 1.6, ease: "power3.out", stagger: { each: 0.07, from: "center" } },
            "-=0.35"
          )
          .from(
            step.querySelectorAll(".hc-lotus-petal--inner"),
            { rotation: (_i: number, el: Element) => unfold(el), scale: 0.35, opacity: 0, svgOrigin: "0 4", duration: 1.4, ease: "power3.out", stagger: { each: 0.07, from: "center" } },
            "-=1.25"
          )
          .from(step.querySelectorAll(".hc-lotus-heart"), { scale: 0, opacity: 0, svgOrigin: "0 -2", duration: 0.6, ease: "power2.out" }, "-=0.7")
          .from(step.querySelectorAll(".hc-journey-card"), { y: 34, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.9");
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={ref} className="hc-root hc-journey relative overflow-clip py-24 md:py-32">
      {/* Green silk backdrop. The photo is landscape and the section is tall, so instead of scaling it
          up to cover the whole section (soft, stretched) a viewport-sized layer stays pinned while
          the journey scrolls over it — the weave is shown at its natural resolution on every screen.
          (overflow-clip, not overflow-hidden, so the sticky layer can stick.) */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
          <Image src="/images/couture/journey-green-silk.png" alt="" fill quality={90} sizes="100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,20,12,0.15),rgba(8,20,12,0.55))]" />
        </div>
      </div>
      {/* Shared gradients for every lotus on the page. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="hc-petal-outer" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#f7d9e1" />
            <stop offset="100%" stopColor="#d9849c" />
          </linearGradient>
          <linearGradient id="hc-petal-inner" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fff1f4" />
            <stop offset="100%" stopColor="#e9a6b8" />
          </linearGradient>
        </defs>
      </svg>


      {PETALS.map((p, i) => (
        <span
          key={i}
          className="hc-petal"
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, ["--hc-drift" as string]: p.drift }}
          aria-hidden="true"
        />
      ))}

      <div className="container-editorial relative z-10">
        <div className="hc-journey-heading text-center mb-16 md:mb-20">
          <p className="text-label-md text-[#ead6a4] mb-3">THE HRUNA JOURNEY</p>
          <h2 className="font-display text-4xl md:text-5xl text-[#f7efdf]">Your journey through Hruna</h2>
        </div>

        <div className="hc-journey-steps relative max-w-3xl mx-auto">
          <div
            className="hc-journey-spine absolute left-[4.5rem] md:left-1/2 top-4 bottom-4 w-px bg-gradient-to-b from-[#d4ae5f]/0 via-[#d4ae5f] to-[#d4ae5f]/0 md:-translate-x-1/2"
            aria-hidden="true"
          />
          <ol className="relative flex flex-col gap-14 md:gap-20">
            {STEPS.map((step, i) => {
              const flip = i % 2 === 1;
              return (
                <li key={step.num} className="hc-journey-step relative grid grid-cols-[9rem_1fr] md:grid-cols-[1fr_10.5rem_1fr] items-center gap-x-3 md:gap-x-8">
                  <div className={`flex justify-center md:col-start-2 md:row-start-1`}>
                    <Lotus num={step.num} />
                  </div>
                  <div
                    className={`hc-journey-card rounded-md border border-[#d4ae5f]/40 bg-[#13261a]/55 backdrop-blur-sm px-5 py-4 md:row-start-1 ${
                      flip ? "md:col-start-3 md:text-left" : "md:col-start-1 md:text-right"
                    }`}
                  >
                    <h3 className="text-headline-sm text-[#f7efdf]">{step.title}</h3>
                    <p className="text-[#f7efdf]/80 text-body-md mt-2">{step.copy}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
