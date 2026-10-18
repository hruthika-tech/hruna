/**
 * Which side of the thread a message bubble belongs on, for whoever is viewing it. Shared by the
 * customer (/messages) and designer (/designer/messages) inboxes so both apply the exact same rule.
 *
 * Ownership is decided ONLY by comparing the message's stored sender_id with the signed-in user's
 * own auth id (GET /api/auth/session → userId) — never from message text, role labels, or the
 * recipient. Until the viewer's id is known, nothing is treated as "mine".
 */
export type MessageSide = "right" | "left";

export function messageSide(senderId: string | null | undefined, viewerUserId: string | null | undefined): MessageSide {
  return !!viewerUserId && !!senderId && senderId === viewerUserId ? "right" : "left";
}
