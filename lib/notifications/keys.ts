/**
 * The shape of a notification key ("proposal-<uuid>", "verification-approved-<ms>", …) — exactly what
 * lib/notifications/feed.ts produces. POST /api/notifications/read accepts nothing else — so no
 * "message-…" keys: chat messages aren't notifications (they're counted by the Messages icon).
 * Isomorphic (unit-tested by scripts/test-badges-unit.mjs).
 */
export const NOTIFICATION_KEY_RE = /^(proposal|update|completion|request|review|verification)-[A-Za-z0-9-]{1,180}$/;

export function isNotificationKey(value: unknown): value is string {
  return typeof value === "string" && NOTIFICATION_KEY_RE.test(value);
}
