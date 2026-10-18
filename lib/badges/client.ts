"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Navbar unread counts (GET /api/badges). Realtime isn't enabled for these tables, so counts are
 * refreshed: on mount and every navigation, when the tab regains focus / becomes visible, right after
 * something is read (refreshBadges()), and every 30 s while the tab is visible — never while hidden.
 * Only one request is in flight at a time (a refresh asked for meanwhile runs once afterwards), and the
 * counts are absolute, so overlapping refreshes can't double-count. Until a real count arrives — and
 * after an error or sign-out — nothing is shown (null), never a guessed number.
 */

export type BadgeSide = "customer" | "designer";
export interface UnreadCounts {
  messages: number | null;
  notifications: number | null;
}

const EVENT = "hruna:badges-refresh";
const INTERVAL_MS = 30_000;
const EMPTY: UnreadCounts = { messages: null, notifications: null };

/** Ask every badge on the page to refresh now (call after reading a conversation or notification). */
export function refreshBadges() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** Saves one notification as read for the signed-in user, then refreshes the badges. */
export async function saveNotificationRead(key: string): Promise<void> {
  await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: [key] }),
  }).catch(() => undefined);
  refreshBadges();
}

export { formatCount, unreadLabel } from "./format";

export function useUnreadCounts(side: BadgeSide): UnreadCounts {
  const pathname = usePathname();
  const [counts, setCounts] = useState<UnreadCounts>(EMPTY);
  const inFlight = useRef(false);
  const again = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const res = await fetch(`/api/badges?side=${side}`, { cache: "no-store" });
      if (!alive.current) return;
      if (res.status === 401 || res.status === 403) {
        setCounts(EMPTY); // signed out / not this side: show nothing
        return;
      }
      if (!res.ok) return; // transient error: keep the last real counts, don't invent new ones
      const data = await res.json();
      if (!alive.current || data.side !== side) return;
      setCounts({
        messages: typeof data.messages === "number" ? data.messages : null,
        notifications: typeof data.notifications === "number" ? data.notifications : null,
      });
    } catch {
      // network hiccup — keep the last real counts
    } finally {
      inFlight.current = false;
      if (again.current && alive.current) {
        again.current = false;
        void load();
      }
    }
  }, [side]);

  // Every navigation (and the first render).
  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(() => {
    alive.current = true;
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onRefresh = () => void load();
    window.addEventListener("focus", onRefresh);
    window.addEventListener(EVENT, onRefresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, INTERVAL_MS);
    return () => {
      alive.current = false;
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(EVENT, onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [load]);

  return counts;
}
