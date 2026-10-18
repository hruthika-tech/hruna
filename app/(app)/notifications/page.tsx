"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { saveNotificationRead } from "@/lib/badges/client";

// Chat messages are not notifications — they're counted by the Messages icon (lib/notifications/feed.ts).
type NotificationType = "proposal" | "completion" | "progress";

interface Notification {
  id: string;
  type: NotificationType;
  text: string;
  href: string;
  timestamp: string;
  read?: boolean;
}

const ICONS: Record<NotificationType, any> = {
  proposal: Sparkles,
  completion: CheckCircle2,
  progress: Bell,
};

// Real data (Phase 9 fix) — this page used to render a hardcoded local array of fake events
// (mock designer names, links to mock ids like "/requests/req-1" that don't exist in the real
// app). Now reads a real, timestamp-sorted feed built from this customer's own requests/
// proposals/messages/projects (see app/api/notifications). Opening an item marks just that item
// read; it's saved per user (public.notification_reads) and the navbar badge updates. Opening this
// page doesn't mark anything. Without read tracking in the database, read state lasts for the visit.
export default function NotificationsPage() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/notifications");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Couldn't load notifications.");
        setNotifications(data.notifications);
        setReadIds(new Set((data.notifications as Notification[]).filter((n) => n.read).map((n) => n.id)));
        setTracked(data.readTracking === true);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  const markRead = (id: string) => {
    if (readIds.has(id)) return;
    setReadIds((prev) => new Set(prev).add(id));
    if (tracked) void saveNotificationRead(id);
  };

  return (
    <div className="container-narrow py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">NOTIFICATIONS</p>
      <h1 className="text-headline-md mb-8">Stay updated</h1>

      {status === "loading" ? (
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading…
        </div>
      ) : status === "error" ? (
        <div className="text-center py-24">
          <p className="text-ink-variant text-sm">Couldn't load your notifications. Please try again.</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-24">
          <Bell className="mx-auto text-outline mb-4" size={32} />
          <p className="text-ink-variant text-sm">You're all caught up.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {notifications.map((n) => {
            const Icon = ICONS[n.type];
            const read = readIds.has(n.id);
            return (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => markRead(n.id)}
                className={cn(
                  "flex items-start gap-4 py-5 border-b border-outline-variant transition-colors hover:bg-surface-low -mx-2 px-2 rounded",
                  !read && "bg-primary-container/20"
                )}
              >
                <div className="w-9 h-9 rounded-full bg-primary-container text-primary flex items-center justify-center shrink-0">
                  <Icon size={16} />
                </div>
                <div className="flex-1">
                  <p className={cn("text-sm", !read ? "text-ink font-medium" : "text-ink-variant")}>{n.text}</p>
                  <p className="text-xs text-outline mt-1">{timeAgo(n.timestamp)}</p>
                </div>
                {!read && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
