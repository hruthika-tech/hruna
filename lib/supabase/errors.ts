/**
 * Consistent Supabase error handling — the pattern every future API route/Server Action should
 * follow: log the REAL error server-side (for debugging), return a safe, generic AppError to
 * whatever's calling (never the raw Postgrest/Auth/Storage error, which can contain constraint
 * names, column names, or other schema internals a client has no business seeing).
 *
 * Not wired into any business endpoint yet in this phase (there are none) — this establishes the
 * pattern for when Phase 3+ starts adding real ones.
 */

import { NextResponse } from "next/server";
import type { AuthError, PostgrestError, StorageApiError } from "@supabase/supabase-js";
import { isProjectLockedDbError } from "@/lib/projects/progress-lock";
import { projectLockedResponse } from "@/lib/projects/progress-lock-server";
import { PLAN_LIMIT_CODE, isDuplicateProposalError, parsePlanLimitError, planLimitMessage } from "@/lib/subscriptions/plans";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Thrown by lib/supabase/authorization.ts's requireX() helpers. Distinct from AppError: this is
 * expected control flow (no session / wrong role), not an unexpected failure — so errorResponse()
 * below skips the console.error logging AppError gets and trusts the message as already
 * user-facing-safe (these helpers never echo back anything from the database).
 */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
    // Optional machine-readable reason (e.g. "customer_profile_required") so a page can offer the
    // right next step instead of matching on message text. Included in the JSON response.
    public readonly code?: string
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function isPostgrestError(error: unknown): error is PostgrestError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error && "details" in error;
}

function isAuthError(error: unknown): error is AuthError {
  return typeof error === "object" && error !== null && "status" in error && "message" in error && "name" in error && (error as { name: unknown }).name === "AuthApiError";
}

function isStorageError(error: unknown): error is StorageApiError {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "StorageApiError";
}

/**
 * Normalizes any Supabase (Postgrest/Auth/Storage) error, or anything else thrown, into a safe
 * AppError. `context` is a short label (e.g. "requests.create") used only in the server-side log
 * line, to make it findable — it's never included in the returned message.
 */
export function toAppError(error: unknown, context: string): AppError {
  // Always log the full, real error server-side — this is the one place detail is allowed.
  console.error(`[supabase:${context}]`, error);

  if (isPostgrestError(error)) {
    // 42501 = insufficient_privilege (an RLS policy rejected the request) — the one Postgrest
    // error worth a distinct, still-safe message; everything else collapses to one generic line
    // rather than echoing Postgres's own wording back to the client.
    if (error.code === "42501" || error.code === "PGRST301") {
      return new AppError("You don't have permission to do that.", error);
    }
    if (error.code === "23505") {
      return new AppError("That already exists.", error);
    }
    return new AppError("Something went wrong while accessing the database.", error);
  }

  if (isAuthError(error)) {
    if (error.status === 429) {
      return new AppError("Too many attempts. Please wait a moment and try again.", error);
    }
    return new AppError("Something went wrong with authentication. Please try signing in again.", error);
  }

  if (isStorageError(error)) {
    return new AppError("Something went wrong with that file. Please try again.", error);
  }

  if (error instanceof Error) {
    // A plain JS error thrown by our own code (e.g. config.ts's requireEnv, or the storage
    // helpers' own throws) — message is already app-authored and safe to surface as-is.
    return new AppError(error.message, error);
  }

  return new AppError("Something went wrong. Please try again.", error);
}

/**
 * The one place every new Route Handler in this phase turns a caught error into a response —
 * follows the same "log the real thing server-side, return a safe message" rule as toAppError(),
 * and additionally maps AuthorizationError to the right HTTP status (401/403) instead of a
 * generic 500. Use this instead of hand-rolling try/catch → NextResponse.json in each route.
 */
export function errorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { status: "error", message: error.message, ...(error.code ? { code: error.code } : {}) },
      { status: error.status }
    );
  }
  // A write that reached a project whose completion the customer has approved — the database's
  // progress-history lock rejected it. Expected, not a failure: a clear 409 with a code.
  if (isProjectLockedDbError(error)) return projectLockedResponse();
  // A designer plan limit enforced by the database (supabase/migrations/20261029000001_*): a clear
  // 403 with the limit, never a generic 500. Also the always-on one-proposal-per-request rule.
  const planLimit = parsePlanLimitError(error);
  if (planLimit) {
    return NextResponse.json(
      { status: "error", code: PLAN_LIMIT_CODE, ...planLimit, message: planLimitMessage(planLimit.resource, planLimit.limit, planLimit.planKey) },
      { status: 403 }
    );
  }
  if (isDuplicateProposalError(error)) {
    return NextResponse.json({ status: "error", code: "duplicate_proposal", message: "You've already sent a proposal for this request." }, { status: 409 });
  }
  const appError = toAppError(error, context);
  // A real 429 from Supabase Auth (e.g. its email-send rate limit) is worth preserving as-is —
  // the client can tell "back off and retry" apart from a hard failure. Every other Auth/Postgrest/
  // Storage error, and anything else, still collapses to a generic 500 as before.
  const status = isAuthError(error) && error.status === 429 ? 429 : 500;
  return NextResponse.json({ status: "error", message: appError.message }, { status });
}
