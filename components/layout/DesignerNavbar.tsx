"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, MessageCircle, Menu, X } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useUnreadCounts } from "@/lib/badges/client";
import { BadgeIconLink, DrawerCount, MenuDot, unreadLabel } from "./NavBadges";

const navLinks = [
  { href: "/designer/home", label: "Home" },
  { href: "/designer/discover-requests", label: "Discover" },
  { href: "/designer/requests", label: "Requests" },
  { href: "/designer/projects", label: "Projects" },
  { href: "/designer/studio", label: "My Studio" },
  { href: "/designer/analytics", label: "Analytics" },
];

// name/avatar are the signed-in designer's real identity (Phase 7 fix — this used to always show
// the seeded mock designer), resolved server-side by app/(designer)/layout.tsx and passed down.
export function DesignerNavbar({ name, avatar }: { name: string; avatar: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const displayName = name || "Your Profile";
  const avatarUrl = avatar;
  // This designer's own unread counts (null = unknown/none → no badge).
  const unread = useUnreadCounts("designer");
  const anyUnread = (unread.messages ?? 0) + (unread.notifications ?? 0) > 0;

  // Lock the page behind the mobile menu — otherwise the underlying content stays scrollable
  // while the overlay is open. Restored on close/unmount so this never leaks into a stuck state.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Escape closes the menu, same as the visible × button.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
    <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-md border-b border-primary/10">
      <div className="container-editorial flex items-center justify-between h-20">
        <div className="flex items-center gap-10">
          <Link href="/designer/home" className="font-display text-2xl tracking-wide text-ink flex items-center gap-2">
            HRUNA <Badge tone="primary" className="text-[10px]">STUDIO</Badge>
          </Link>
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm transition-colors",
                  pathname?.startsWith(link.href) ? "text-ink font-medium" : "text-ink-variant hover:text-ink"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <BadgeIconLink href="/designer/notifications" label="Notifications" count={unread.notifications}>
            <Bell size={19} />
          </BadgeIconLink>
          <BadgeIconLink href="/designer/messages" label="Messages" count={unread.messages}>
            <MessageCircle size={19} />
          </BadgeIconLink>
          <Link href="/designer/profile" className="ml-2" aria-label="Profile">
            <Avatar src={avatarUrl} alt={displayName} size={38} />
          </Link>
        </div>

        <button
          className="relative lg:hidden p-2 text-ink-variant"
          aria-label={anyUnread ? "Open menu, you have unread items" : "Open menu"}
          onClick={() => setOpen(true)}
        >
          <Menu size={22} />
          <MenuDot show={anyUnread} />
        </button>
      </div>
    </header>

    {/* Sibling of <header>, not a descendant — see Navbar.tsx's comment: the header's
        backdrop-blur-md (backdrop-filter) makes it a containing block for `position: fixed`
        descendants, which broke this overlay's sizing/positioning. */}
    {open && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        className="fixed inset-0 z-50 bg-surface flex flex-col lg:hidden animate-[fadeIn_0.15s_ease]"
      >
        <div className="flex items-center justify-between h-20 container-editorial">
          <span className="font-display text-2xl">HRUNA</span>
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="p-3 -mr-3 text-ink-variant">
            <X size={22} />
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-6 pt-4 overflow-y-auto">
          {[
            ...navLinks,
            { href: "/designer/reviews", label: "Reviews" },
            { href: "/designer-subscription", label: "Plan & billing" },
            { href: "/designer/messages", label: "Messages", count: unread.messages },
            { href: "/designer/notifications", label: "Notifications", count: unread.notifications },
            { href: "/designer/profile", label: "Profile & Settings" },
          ].map((link) => {
            const count = "count" in link ? link.count ?? null : null;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-label={unreadLabel(link.label, count)}
                className="py-4 text-headline-sm border-b border-outline-variant"
              >
                {link.label}
                <DrawerCount count={count} />
              </Link>
            );
          })}
        </nav>
      </div>
    )}
    </>
  );
}
