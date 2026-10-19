"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";

// Secondary navigation for the landing header below md (Log In / Sign Up stay in the header bar
// itself). Same behaviour as the app Navbar's mobile menu: full-screen panel, page scroll locked
// while open, Escape or × closes. Portalled to <body> so the sticky header never becomes its
// containing block.
const LINKS = [
  { href: "/discover", label: "Discover designers" },
  { href: "/about", label: "About HRUNA" },
  { href: "/help", label: "Help" },
  { href: "/support", label: "Contact support" },
];

export function LandingMobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="md:hidden w-10 h-10 -mr-2 flex items-center justify-center text-scrapbook-forest shrink-0"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={22} />
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-50 bg-scrapbook-cream flex flex-col md:hidden animate-[fadeIn_0.15s_ease]"
          >
            <div className="flex items-center justify-between py-4 px-4 min-[360px]:px-6 border-b border-scrapbook-forest/10">
              <span className="font-display text-xl min-[360px]:text-2xl tracking-[0.15em] min-[390px]:tracking-[0.25em] text-scrapbook-forest">HRUNA</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="w-10 h-10 -mr-2 flex items-center justify-center text-scrapbook-forest">
                <X size={22} />
              </button>
            </div>
            <nav className="flex flex-col px-6 pt-2 overflow-y-auto">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="py-4 text-headline-sm text-scrapbook-forest border-b border-scrapbook-forest/10"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex gap-3 px-6 pt-8">
              <LinkButton href="/login" variant="secondary" className="flex-1 border-scrapbook-forest/30 text-scrapbook-forest hover:bg-scrapbook-forest/5">
                Log In
              </LinkButton>
              <LinkButton href="/create-account" className="flex-1 bg-scrapbook-forest text-scrapbook-cream hover:bg-scrapbook-forest/90">
                Sign Up
              </LinkButton>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
