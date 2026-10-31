"use client";

import dynamic from "next/dynamic";

// The React Bits FlexCarousel (components/react-bits/FlexCarousel.jsx) is WebGL2, so it only
// renders in the browser; until it loads, the band shows its own background (no layout shift).
const FlexCarousel = dynamic(() => import("@/components/react-bits/FlexCarousel"), { ssr: false });

/** Serve the illustrations through Next's image optimiser (same-origin, so WebGL can use them). */
const optimised = (src: string) => `/_next/image?url=${encodeURIComponent(src)}&w=1200&q=80`;

const ITEMS = [
  { file: "01-sheer-kasavu-lehenga.jpg", title: "Sheer Kasavu Lehenga", alt: "Illustration of a blue corset gown with a sheer gold-motif Kasavu lehenga, temple jewellery and mojri flats" },
  { file: "02-banaras-maxi-bodycon.jpg", title: "Banaras Maxi Bodycon", alt: "Illustration of a crimson Banarasi silk maxi dress with a corset waist and gold zari work" },
  { file: "03-vibrant-fur-coat.jpg", title: "Vibrant Long Fur Coat", alt: "Illustration of a rainbow faux-fur coat over a denim tube top and cargo skirt with chunky boots" },
  { file: "04-runway-fusion-gown.jpg", title: "Runway Fusion Gown", alt: "Illustration of a black and gold ruffled fusion gown with a crimson saree drape" },
  { file: "05-denim-feather-puff.jpg", title: "Washed Denim, Feather & Puff", alt: "Illustration of a washed denim corset gown with feather trims and tiered ruffles" },
  { file: "06-banarasi-brocade-jumpsuit.jpg", title: "Banarasi Brocade", alt: "Illustration of a burgundy Banarasi brocade flared jumpsuit with a velvet corset and beret" },
  { file: "07-vogue-chic-tiered-gown.jpg", title: "Vogue-Chic Full-Length Dress", alt: "Illustration of a purple and black tiered gown with jewelled bodice and pink and grey puff sleeves" },
  { file: "08-sculptural-puff-dress.jpg", title: "Sculptural Dress", alt: "Illustration of a black sculptural asymmetric dress with one pink and one black puff sleeve" },
  { file: "09-heart-print-dress.jpg", title: "Heart-Print Dress", alt: "Illustration of a green runway-inspired draped dress with a tiny heart print" },
  { file: "10-polka-dot-dress.jpg", title: "Polka Dot Dress", alt: "Illustration of a white strapless polka dot dress with a red scarf and red bag" },
].map(({ file, title, alt }) => ({ src: optimised(`/images/couture/carousel/${file}`), alt, title }));

// Homepage transition band after the Journey section: the FlexCarousel of couture illustrations,
// configured exactly as the React Bits usage example. Same gradient as the band it replaces, so it
// still joins the emerald Journey to the burgundy Designer Book; captions read in ivory.
export function SectionFlexCarousel() {
  return (
    <div className="relative text-[#f7efdf]" style={{ background: "linear-gradient(180deg, #1e3a28, #5c1526)" }}>
      <div style={{ width: "100%", height: "560px", position: "relative" }}>
        <FlexCarousel
          items={ITEMS}
          preset="liquid"
          intro="rise"
          cardHeight={0.5}
          gap={12}
          squeeze={0.2}
          focusOnClick
          captions
          fit="natural"
          radius={0}
          lensWidth={0.74}
          lensHeight={1.18}
          tilt={62}
          roundness={1}
          bend={0.34}
          reach={0.38}
          curl="twist"
          dispersion={0.45}
          liquid={0}
          followCursor={false}
          autoplay={false}
          interval={4}
          captureWheel
          // Optional in the component; TypeScript infers them as required from the .jsx signature.
          onChange={undefined}
          onSelect={undefined}
          style={undefined}
        />
      </div>
    </div>
  );
}
