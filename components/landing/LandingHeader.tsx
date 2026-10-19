import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { AnimatedCTA } from "./AnimatedCTA";
import { LandingMobileMenu } from "./LandingMobileMenu";

// The landing page's own header (separate from the shared authenticated-app Navbar/DesignerNavbar).
// Simplified for the v4 scrapbook redesign: the hero is now a light cream/gingham paper background
// rather than a dark full-bleed photo, so the header no longer needs to float transparently over
// it or swap colors on scroll — it's just a plain sticky cream bar.
//
// Log In and Sign Up are always visible, at every width (phones included); Sign Up goes to the
// existing registration (/create-account → email confirmation → /choose-role customer/designer),
// Log In to the existing /login. The bar is just the logo (left) and these buttons (right); below md,
// secondary links (incl. Discover) live in the hamburger menu. On the narrowest phones (320px) the
// header uses a slightly smaller gutter and logo tracking so the logo, both buttons and the menu fit
// on one line.
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 bg-scrapbook-cream border-b border-scrapbook-forest/10">
      <div className="container-editorial px-4 min-[360px]:px-6 md:px-20 flex items-center justify-between gap-2 py-4 md:py-5">
        <Link href="/" className="font-display text-xl min-[360px]:text-2xl tracking-[0.15em] min-[390px]:tracking-[0.25em] text-scrapbook-forest shrink-0">
          HRUNA
        </Link>

        <div className="flex items-center gap-1.5 min-[360px]:gap-2 md:gap-3">
          <LinkButton
            href="/login"
            variant="secondary"
            size="sm"
            className="h-10 px-3 min-[360px]:px-4 md:px-5 border-scrapbook-forest/30 text-scrapbook-forest hover:bg-scrapbook-forest/5"
          >
            Log In
          </LinkButton>
          {/* Phones: a plain compact button; md+: the existing magnetic CTA styling. */}
          <LinkButton href="/create-account" size="sm" className="md:hidden h-10 px-3 min-[360px]:px-4 bg-scrapbook-forest text-scrapbook-cream hover:bg-scrapbook-forest/90">
            Sign Up
          </LinkButton>
          <div className="hidden md:block">
            <AnimatedCTA href="/create-account" size="md" className="bg-scrapbook-forest text-scrapbook-cream hover:bg-scrapbook-forest/90 group">
              Sign Up
              <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
            </AnimatedCTA>
          </div>
          <LandingMobileMenu />
        </div>
      </div>
    </header>
  );
}
