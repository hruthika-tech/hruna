/**
 * User reports — reasons, statuses and input validation shared by the report form, the API and the
 * admin review. Isomorphic, no side effects (unit-tested by scripts/test-moderation-unit.mjs).
 * The database enforces the same rules again (supabase/migrations/20261020000001_user_blocks_and_reports.sql).
 */

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or abuse" },
  { value: "scam", label: "Scam or fraud" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "impersonation", label: "Impersonation or fake profile" },
  { value: "other", label: "Other" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REPORT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under review" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number]["value"];

export const MAX_REPORT_DESCRIPTION = 2000;
export const MAX_REPORT_EVIDENCE = 20;
export const MAX_ADMIN_DECISION = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

const has = (list: readonly { value: string }[], value: unknown) => typeof value === "string" && list.some((r) => r.value === value);
export const isReportReason = (value: unknown): value is ReportReason => has(REPORT_REASONS, value);
export const isReportStatus = (value: unknown): value is ReportStatus => has(REPORT_STATUSES, value);
export const reasonLabel = (value: string) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
export const statusLabel = (value: string) => REPORT_STATUSES.find((s) => s.value === value)?.label ?? value;

export interface ReportInput {
  reason: ReportReason;
  description: string | null;
  messageIds: string[];
}

/** Validates a report submission. Returns the cleaned input, or a message saying what's wrong. */
export function validateReportInput(body: unknown): { ok: true; value: ReportInput } | { ok: false; message: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isReportReason(b.reason)) return { ok: false, message: "Choose a reason for the report." };
  let description: string | null = null;
  if (b.description !== undefined && b.description !== null) {
    if (typeof b.description !== "string") return { ok: false, message: "The description must be text." };
    const trimmed = b.description.trim();
    if (trimmed.length > MAX_REPORT_DESCRIPTION) return { ok: false, message: `Keep the description under ${MAX_REPORT_DESCRIPTION} characters.` };
    description = trimmed || null;
  }
  let messageIds: string[] = [];
  if (b.messageIds !== undefined && b.messageIds !== null) {
    if (!Array.isArray(b.messageIds) || !b.messageIds.every(isUuid)) return { ok: false, message: "The selected messages couldn't be used." };
    messageIds = [...new Set(b.messageIds as string[])];
    if (messageIds.length > MAX_REPORT_EVIDENCE) return { ok: false, message: `Select at most ${MAX_REPORT_EVIDENCE} messages.` };
  }
  return { ok: true, value: { reason: b.reason, description, messageIds } };
}

/** Validates an admin's review. Returns the cleaned input, or a message saying what's wrong. */
export function validateReview(body: unknown): { ok: true; value: { status: ReportStatus; decision: string | null } } | { ok: false; message: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isReportStatus(b.status)) return { ok: false, message: "Choose a valid status." };
  let decision: string | null = null;
  if (b.decision !== undefined && b.decision !== null) {
    if (typeof b.decision !== "string") return { ok: false, message: "The decision must be text." };
    const trimmed = b.decision.trim();
    if (trimmed.length > MAX_ADMIN_DECISION) return { ok: false, message: `Keep the decision under ${MAX_ADMIN_DECISION} characters.` };
    decision = trimmed || null;
  }
  if ((b.status === "resolved" || b.status === "dismissed") && !decision) {
    return { ok: false, message: "Record the moderation decision before resolving or dismissing a report." };
  }
  return { ok: true, value: { status: b.status, decision } };
}

/** What the chat shows for a conversation's block state (never says WHO blocked whom to the blocked side). */
export type ChatBlockState = "none" | "blocked_by_me" | "unavailable";
export function chatBlockState(dbState: string | null | undefined): ChatBlockState {
  if (dbState === "blocked_by_me") return "blocked_by_me";
  if (dbState === "blocked_me") return "unavailable";
  return "none";
}
