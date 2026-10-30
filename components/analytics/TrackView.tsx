"use client";

import { useEffect } from "react";

// Reports one view of a public studio or dress page to /api/analytics/view. Renders nothing.
// Sent at most once per page per browser tab load (the module-level set survives React Strict
// Mode's double-run of effects); the server additionally counts each visitor once per page per
// day, so reloads and repeat visits that day don't inflate the numbers.
const sent = new Set<string>();

export function TrackView({ type, id }: { type: "studio" | "dress"; id: string }) {
  useEffect(() => {
    const key = `${type}:${id}`;
    if (sent.has(key)) return;
    sent.add(key);
    fetch("/api/analytics/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  }, [type, id]);
  return null;
}
