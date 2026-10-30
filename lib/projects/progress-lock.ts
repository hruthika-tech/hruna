// The progress-history lock: once the customer approves a project's completion (the existing
// confirm-completion workflow sets projects.status = "completed"), its progress updates can no
// longer be added, edited or deleted — by anyone, on any path. The database enforces this
// (supabase/migrations/20261021000001_lock_completed_project_progress.sql); the API routes check
// it first so the response is a clear 409 (lib/projects/progress-lock-server.ts), and the pages use
// isProgressLocked() to hide the controls. Pure — safe to import from client and server code.

export const PROJECT_LOCKED_CODE = "project_locked";
export const PROJECT_LOCKED_MESSAGE =
  "This project has ended (completed or withdrawn), so its progress history is final and can no longer be changed.";

/** The single rule: a project is locked once it has ended — completion approved by the customer
 *  (status "completed") or a withdrawal agreed by both participants (status "withdrawn"). */
export function isProgressLocked(status: string | null | undefined): boolean {
  return status === "completed" || status === "withdrawn";
}

/** The error the database raises when a write hits a locked project (SQLSTATE 42501 + message prefix). */
export function isProjectLockedDbError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "42501" && typeof message === "string" && message.startsWith("project_progress_locked");
}
