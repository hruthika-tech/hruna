/**
 * Pure formatting for the navbar unread badges (isomorphic, no side effects — unit-tested by
 * scripts/test-badges-unit.mjs).
 */

/** Badge text: "99+" above 99; nothing (null) for 0, negative, missing or unknown counts. */
export function formatCount(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}

/** Accessible name for a navbar item: "Messages, 5 unread" — or just "Messages" when nothing is unread. */
export function unreadLabel(label: string, count: number | null | undefined): string {
  const shown = formatCount(count);
  if (!shown) return label;
  return `${label}, ${shown === "99+" ? "more than 99" : shown} unread`;
}
