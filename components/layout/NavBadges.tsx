"use client";

import Link from "next/link";
import { formatCount, unreadLabel } from "@/lib/badges/format";
import { cn } from "@/lib/utils";

// Unread-count badges for the navbars (Navbar.tsx, DesignerNavbar.tsx). The count pill is absolutely
// positioned over the icon, so it never changes the header's layout; screen readers get the count in
// the link's own label ("Messages, 5 unread") and the visual pill is hidden from them.

/** An icon link in the header with an optional unread count. */
export function BadgeIconLink({ href, label, count, children }: { href: string; label: string; count: number | null; children: React.ReactNode }) {
  const shown = formatCount(count);
  return (
    <Link href={href} aria-label={unreadLabel(label, count)} className="relative p-2.5 rounded-full hover:bg-ink/5 text-ink-variant transition-colors">
      {children}
      {shown && (
        <span
          aria-hidden="true"
          data-testid={`badge-${label.toLowerCase()}`}
          className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-white text-[10px] font-semibold leading-[17px] text-center tabular-nums ring-2 ring-surface pointer-events-none"
        >
          {shown}
        </span>
      )}
    </Link>
  );
}

/** Inline count for a row in the mobile navigation drawer. */
export function DrawerCount({ count }: { count: number | null }) {
  const shown = formatCount(count);
  if (!shown) return null;
  return (
    <span aria-hidden="true" className="ml-3 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-white text-xs font-semibold tabular-nums align-middle">
      {shown}
    </span>
  );
}

/** A dot on the mobile menu button when anything is unread. */
export function MenuDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span aria-hidden="true" className={cn("absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-surface")} />;
}

export { unreadLabel };
