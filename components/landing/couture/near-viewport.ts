import { useEffect, useState, type RefObject } from "react";

// Shared by the homepage's heavy client-only bands (the circular carousel and the morph slider):
// mount them as they approach the viewport, and request images sized to what the screen shows.

/** Next's default optimiser widths (next.config.js sets no custom deviceSizes/imageSizes). */
const OPTIMISER_WIDTHS = [256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

/** Smallest optimiser width covering `cssPx` CSS pixels at this screen's density, capped at `max`.
 *  Browser-only (reads devicePixelRatio). */
export function optimiserWidthFor(cssPx: number, max: number): number {
  const needed = Math.ceil(cssPx * (window.devicePixelRatio || 1));
  return OPTIMISER_WIDTHS.find((w) => w >= needed && w <= max) ?? max;
}

/** True once `ref`'s element comes within `margin` of the viewport; stays true after that. */
export function useNearViewport(ref: RefObject<Element>, margin = "600px 0px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}
