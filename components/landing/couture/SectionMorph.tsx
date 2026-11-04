"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";
import { optimiserWidthFor, useNearViewport } from "./near-viewport";

// The React Bits MorphSlider (components/react-bits/MorphSlider.jsx) is WebGL, so it only renders
// in the browser; until it loads, the band shows its own backdrop colour (no layout shift).
const MorphSlider = dynamic(() => import("@/components/react-bits/MorphSlider"), { ssr: false });

type Transition = "melt" | "ripple" | "shear" | "swirl";

/** Serve the large source artwork through Next's image optimiser (same-origin, so WebGL can use it),
 *  at the frame's on-screen width (at most ~992 css px) for this screen's density, up to 1920. */
const optimised = (src: string, width: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;

// A transition band between two homepage sections: a framed MorphSlider of the couture sketches.
// Captions are off (the band adds imagery, not new copy); the gradient joins the colour of the
// section above to the one below.
export function SectionMorph({
  images,
  transition,
  from,
  to,
  label,
}: {
  images: string[];
  transition: Transition;
  from: string;
  to: string;
  label: string;
}) {
  // The slider (and its textures) mounts only as the band nears the viewport.
  const frameRef = useRef<HTMLDivElement>(null);
  const near = useNearViewport(frameRef);
  // caption "" = no caption (MorphSlider only renders truthy captions).
  const items = useMemo(() => {
    if (!near) return null;
    const width = optimiserWidthFor(Math.min(window.innerWidth, 1024), 1920);
    return images.map((src) => ({ image: optimised(src, width), caption: "" }));
  }, [images, near]);
  return (
    <div className="hc-morph-band relative py-12 md:py-16" style={{ background: `linear-gradient(180deg, ${from}, ${to})` }} aria-label={label} role="region">
      <div className="container-editorial">
        <div ref={frameRef} className="relative mx-auto h-[46vw] max-h-[560px] min-h-[220px] w-full max-w-5xl rounded-[18px] bg-[#13131a]">
          {items && <MorphSlider
            items={items}
            transition={transition}
            autoplay
            autoplayDelay={4.5}
            duration={1.3}
            radius={18}
            overlayColor="#0e1638"
            showCaptions={false}
          />}
        </div>
      </div>
    </div>
  );
}
