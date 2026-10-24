import Image from "next/image";
import { LinkButton } from "@/components/ui/Button";
import { Footer } from "@/components/layout/Footer";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Become a Designer",
  description: "Designers, boutiques and tailors: bring your atelier to HRUNA. Set up verification and your studio, and start receiving fashion requests from customers.",
  path: "/become-a-designer",
});

export default function BecomeADesignerPage() {
  return (
    <div>
      <section className="relative h-[60vh] min-h-[420px]">
        <Image
          src="/images/stitch/dress-form-draping.png"
          alt="A dress form sketch draped in flowing blush and gold fabric, atelier study"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-ink/50 flex items-center">
          <div className="container-editorial">
            <p className="text-white/80 text-label-md mb-4 tracking-[0.25em]">FOR DESIGNERS, BOUTIQUES & TAILORS</p>
            <h1 className="text-white text-display-lg-mobile md:text-display-lg max-w-2xl">
              Bring your atelier to HRUNA.
            </h1>
          </div>
        </div>
      </section>
      <section className="container-editorial py-section-gap text-center">
        <p className="text-ink-variant max-w-lg mx-auto mb-8">
          Ready to bring your atelier to HRUNA? Create your account to set up verification, your studio, and start
          receiving fashion requests from customers.
        </p>
        <LinkButton href="/create-account" size="lg">Join the Waitlist</LinkButton>
      </section>
      <Footer />
    </div>
  );
}
