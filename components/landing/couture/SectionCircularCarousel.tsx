"use client";

import dynamic from "next/dynamic";

// The React Bits CircularCarousel (components/react-bits/CircularCarousel.jsx) — a 3D CSS cylinder
// that needs the browser to measure itself, so it renders client-side only.
const CircularCarousel = dynamic(() => import("@/components/react-bits/CircularCarousel"), { ssr: false });

/** High-quality copies through Next's optimiser: 1080 px wide at quality 90 stays crisp on 3× phone
 *  screens (the front card is at most ~330 css px wide) while weighing a fraction of the originals. */
const hd = (src: string) => `/_next/image?url=${encodeURIComponent(src)}&w=1080&q=90`;

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
].map(({ file, title, alt }) => ({ src: hd(`/images/couture/carousel/${file}`), alt, title, subtitle: "HRUNA couture" }));

// Homepage transition band after the Journey: the CircularCarousel of couture illustrations, set
// up as the React Bits usage example except for the card shape — aspectRatio is the illustrations'
// own 1357 × 1600 portrait proportion, so each drawing is shown whole instead of cropped square.
// Same green-to-burgundy band background as before. On phones the stage is drawn 1.7× the screen
// width (centred, the band clips the sides) so the front cards are large rather than shrunk to fit
// the whole ring into a narrow screen.
export function SectionCircularCarousel() {
  return (
    <div className="relative overflow-hidden" style={{ background: "linear-gradient(180deg, #1e3a28, #5c1526)" }}>
      <div className="relative h-[480px] w-[170vw] -ml-[35vw] md:h-[560px] md:w-full md:ml-0">
        <CircularCarousel
          items={ITEMS}
          preset="cylinder"
          intro="rise"
          cardWidth={220}
          aspectRatio={1357 / 1600}
          speed={14}
          captions={false}
          gap={25}
          tilt={-5}
          curve={1}
          perspective={2500}
          autoplay="drift"
          interval={3}
          direction="left"
          momentum={0.6}
          snap
          pauseOnHover
          focusOnClick
          draggable
          parallax={0.3}
          stretch={0.5}
          fadeColor="#000000"
          depthFade={0.55}
          innerShade={0.6}
          cornerRadius={12}
          // Optional in the component; TypeScript infers them as required from the .jsx signature.
          onChange={undefined}
          onItemClick={undefined}
          className={undefined}
          style={undefined}
        />
      </div>
    </div>
  );
}
