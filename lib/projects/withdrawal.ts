// Mutual project withdrawal (supabase/migrations/20261023000002): one participant requests it with a
// reason, the OTHER approves (→ project 'withdrawn', request closed) or rejects (project unchanged).
// The database functions are the authority; this module only validates input early and describes the
// state for the pages. Isomorphic, no side effects.

export type WithdrawalRole = "customer" | "designer";
export type WithdrawalStatus = "pending" | "approved" | "rejected" | "closed";

export interface WithdrawalItem {
  id: string;
  requestedByRole: WithdrawalRole;
  reason: string;
  status: WithdrawalStatus;
  responseReason: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export const WITHDRAWAL_REASON_MAX = 1000;
/** Project statuses that can still be withdrawn (completed / withdrawn / cancelled are final). */
export const WITHDRAWABLE_PROJECT_STATUSES = ["active", "awaiting_confirmation", "on_hold"] as const;

export function isProjectWithdrawable(status: string | null | undefined): boolean {
  return (WITHDRAWABLE_PROJECT_STATUSES as readonly string[]).includes(status ?? "");
}

export function validateWithdrawalReason(reason: unknown): { ok: true; value: string } | { ok: false; message: string } {
  const value = typeof reason === "string" ? reason.trim() : "";
  if (!value) return { ok: false, message: "Please give a reason for the withdrawal." };
  if (value.length > WITHDRAWAL_REASON_MAX) return { ok: false, message: `Please keep the reason under ${WITHDRAWAL_REASON_MAX} characters.` };
  return { ok: true, value };
}

export function validateResponseReason(reason: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  if (reason === undefined || reason === null) return { ok: true, value: null };
  if (typeof reason !== "string") return { ok: false, message: "The reason must be text." };
  const value = reason.trim();
  if (value.length > WITHDRAWAL_REASON_MAX) return { ok: false, message: `Please keep the reason under ${WITHDRAWAL_REASON_MAX} characters.` };
  return { ok: true, value: value || null };
}

/** What the signed-in participant can do about the pending withdrawal, if any. */
export function withdrawalViewState(withdrawals: WithdrawalItem[], viewerRole: WithdrawalRole | null, projectStatus: string) {
  const pending = withdrawals.find((w) => w.status === "pending") ?? null;
  return {
    pending,
    mineIsPending: !!pending && pending.requestedByRole === viewerRole,
    canRespond: !!pending && !!viewerRole && pending.requestedByRole !== viewerRole && isProjectWithdrawable(projectStatus),
    canRequest: !pending && !!viewerRole && isProjectWithdrawable(projectStatus),
    approved: withdrawals.find((w) => w.status === "approved") ?? null,
  };
}

export function mapWithdrawal(row: {
  id: string;
  requested_by_role: string;
  reason: string;
  status: string;
  response_reason: string | null;
  created_at: string;
  responded_at: string | null;
}): WithdrawalItem {
  return {
    id: row.id,
    requestedByRole: row.requested_by_role as WithdrawalRole,
    reason: row.reason,
    status: row.status as WithdrawalStatus,
    responseReason: row.response_reason,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}
