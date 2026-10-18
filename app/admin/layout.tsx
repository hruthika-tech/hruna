"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const adminNavLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/verification", label: "Verification Queue" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/subscriptions", label: "Subscriptions & Payments" },
  { href: "/admin/disputes", label: "Reports & Disputes" },
  { href: "/admin/reports", label: "User Reports" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/settings", label: "Admin Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <Link href="/admin" className="flex items-center gap-2 font-display text-lg shrink-0">
            <ShieldCheck size={18} /> HRUNA Admin
          </Link>
          <nav className="hidden lg:flex items-center gap-5 overflow-x-auto no-scrollbar">
            {adminNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm whitespace-nowrap transition-colors",
                  pathname === link.href ? "text-white font-medium" : "text-white/50 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-xs text-white/40 hidden xl:block shrink-0">
            Actions here are real and audited.
          </p>
          <button
            className="lg:hidden p-2 text-white/70"
            aria-label="Open admin menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 bg-ink flex flex-col lg:hidden">
          <div className="flex items-center justify-between h-16 px-6 border-b border-white/10">
            <span className="flex items-center gap-2 font-display text-lg"><ShieldCheck size={18} /> HRUNA Admin</span>
            <button aria-label="Close admin menu" onClick={() => setOpen(false)} className="p-2 text-white/70">
              <X size={20} />
            </button>
          </div>
          <nav className="flex flex-col px-6 pt-2">
            {adminNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "py-4 text-lg border-b border-white/10",
                  pathname === link.href ? "text-white font-medium" : "text-white/60"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-xs text-white/40 px-6 pt-6">Actions here are real and audited.</p>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
