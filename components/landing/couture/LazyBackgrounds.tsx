"use client";

import { useEffect } from "react";

// The homepage's below-the-fold CSS backdrops (see the end of couture.css). Each one's image is
// switched on with .hc-bg-on once its section is within ~1.5 screens of the viewport, and only after
// the window's load event, so the hero image (the phone LCP) gets the network to itself first.
// Elements that are display:none at this breakpoint never intersect, so they never download.
const SELECTOR = ".hc-m-journey-bg, .hc-m-mood-bg, .hc-m-cta-bg, .hc-book-backdrop, .hc-footer";

export function LazyBackgrounds() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(SELECTOR));
    const on = (el: Element) => el.classList.add("hc-bg-on");
    if (!("IntersectionObserver" in window)) {
      elements.forEach(on);
      return;
    }
    let io: IntersectionObserver | undefined;
    const start = () => {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            on(entry.target);
            io?.unobserve(entry.target);
          }
        },
        { rootMargin: "1200px 0px" }
      );
      elements.forEach((el) => io?.observe(el));
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      io?.disconnect();
    };
  }, []);
  return null;
}
