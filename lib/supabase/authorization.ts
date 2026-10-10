import "server-only";

/**
 * Authorization foundation — "what is this authenticated user allowed to do", kept deliberately
 * separate from lib/supabase/auth.ts's getCurrentUser() ("who is this user"), per this phase's
 * brief (§12). Every one of these helpers resolves role/permission state by calling the exact same
 * SECURITY DEFINER SQL functions the RLS policies themselves call — current_customer_id(),
 * current_designer_id(), is_admin(), is_approved_designer() (see
 * supabase/migrations/20260829180013_rls.sql) — via supabase.rpc(). That means there is only ONE
 * definition of "is this user an admin" / "is this user an approved designer" in the whole system;
 * this file never re-derives that logic in TypeScript, so it can't drift from what RLS actually
 * enforces.
 *
 * Every helper that resolves the CALLER's own role uses lib/supabase/server.ts's request-scoped,
 * cookie-authenticated client — never lib/supabase/admin.ts. That's deliberate: resolving "who is
 * this user and what can they do" must happen AS that user, through RLS, not through a
 * service-role bypass (§18). The single exception is getAdminOwnedDesignerIds() at the bottom,
 * which answers a read-only question about OTHER users that RLS hides (see its comment).
 *
 * Route Handlers / Server Actions / Server Components call requireX() and let AuthorizationError
 * propagate to lib/supabase/errors.ts's errorResponse(), which maps it to a 401/403 — so no
 * individual route re-implements "is this user allowed to do this" from scratch (§12).
 */

import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";
import { createAdminClient } from "./admin";
import { AuthorizationError } from "./errors";
import type { Enums } from "./types";

export interface AuthContext {
  user: User;
  isAdmin: boolean;
  /** The user's own customer_profiles.id, or null if they have no customer profile. */
  customerId: string | null;
  /** The user's own designer_profiles.id, or null if they have no designer profile. */
  designerId: string | null;
  /** True only when designerId exists AND designer_verifications.overall_status = 'approved'. */
  isApprovedDesigner: boolean;
  /** Full verification state (not_submitted/pending/approved/rejected/suspended), or null if the
   *  user has no designer profile at all — lets callers give a specific reason, not just "no". */
  designerOverallStatus: Enums<"designer_overall_status"> | null;
}

/**
 * Resolves the full auth/authorization context for the CURRENT request's session — or null if
 * nobody is signed in. Never throws for "not signed in"; that's an expected, common case, not a
 * failure (same convention as lib/supabase/auth.ts's getCurrentUser()).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [adminResult, customerResult, designerResult, approvedResult] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.rpc("current_customer_id"),
    supabase.rpc("current_designer_id"),
    supabase.rpc("is_approved_designer"),
  ]);

  const designerId = designerResult.data ?? null;

  let designerOverallStatus: Enums<"designer_overall_status"> | null = null;
  if (designerId) {
    // Only queried when the user actually has a designer profile — the common case (customers,
    // or users mid-signup with neither profile yet) never pays for this extra round trip.
    const { data } = await supabase
      .from("designer_verifications")
      .select("overall_status")
      .eq("designer_id", designerId)
      .maybeSingle();
    designerOverallStatus = data?.overall_status ?? null;
  }

  return {
    user,
    isAdmin: adminResult.data ?? false,
    customerId: customerResult.data ?? null,
    designerId,
    isApprovedDesigner: approvedResult.data ?? false,
    designerOverallStatus,
  };
}

/** Throws 401 if nobody is signed in. This is the "AUTHENTICATED" tier from the route-protection
 *  brief (§14) — a valid Supabase session, nothing about role yet. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new AuthorizationError("You must be signed in to do that.", 401);
  }
  return ctx;
}

/**
 * ADMIN is a separate role, never combined with CUSTOMER or DESIGNER. An admin account acts only
 * through the admin area (requireAdmin + its own routes), so even if an admin user somehow has a
 * customer_profiles/designer_profiles row (e.g. created before this guard existed), the customer/
 * designer feature routes refuse it instead of letting the admin act as — and edit — that profile.
 */
export const ADMIN_ROLE_SEPARATION_MESSAGE =
  "Admin accounts can't use customer or designer features. Please use a separate account for that.";

export function assertNotAdmin(ctx: AuthContext): void {
  if (ctx.isAdmin) throw new AuthorizationError(ADMIN_ROLE_SEPARATION_MESSAGE, 403);
}

/** Throws 401/403 unless the signed-in user has a customer profile (and is not an admin). */
export async function requireCustomer(): Promise<AuthContext & { customerId: string }> {
  const ctx = await requireUser();
  assertNotAdmin(ctx);
  if (!ctx.customerId) {
    throw new AuthorizationError("A customer profile is required for this action.", 403);
  }
  return ctx as AuthContext & { customerId: string };
}

/** Throws 401/403 unless the signed-in user has a designer profile (any verification state) and
 *  is not an admin. */
export async function requireDesigner(): Promise<AuthContext & { designerId: string }> {
  const ctx = await requireUser();
  assertNotAdmin(ctx);
  if (!ctx.designerId) {
    throw new AuthorizationError("A designer profile is required for this action.", 403);
  }
  return ctx as AuthContext & { designerId: string };
}

/**
 * Throws 401/403 unless the signed-in user is a designer AND designer_verifications.overall_status
 * = 'approved'. A pending, rejected, or suspended designer profile is not enough — per §13, only
 * APPROVED designers get permissions that require verified status (e.g. the public request feed).
 */
export async function requireApprovedDesigner(): Promise<AuthContext & { designerId: string }> {
  const ctx = await requireDesigner();
  if (!ctx.isApprovedDesigner) {
    const status = ctx.designerOverallStatus;
    const reason =
      status === "suspended"
        ? "Your designer account is currently suspended."
        : status === "rejected"
          ? "Your designer verification was not approved."
          : "Your designer verification is still pending approval.";
    throw new AuthorizationError(reason, 403);
  }
  return ctx;
}

/** Throws 401/403 unless the signed-in user's public.users.is_admin flag is true. Trusted DB
 *  state only — never a client-supplied header, cookie value, or request field (§11, §21). */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.isAdmin) {
    throw new AuthorizationError("Admin access is required.", 403);
  }
  return ctx;
}

/**
 * Of the given designer_profiles ids, the ones owned by an ADMIN account. An admin is never also a
 * public designer (see assertNotAdmin), so these profiles — e.g. one an admin created accidentally
 * before that rule existed — must never be shown or reachable on any public surface: the Studio
 * page, Discover/Home listings, dress/collection detail, saved items, conversations, requests.
 *
 * The one helper here that uses the service-role client, deliberately: it answers a question about
 * OTHER users' role that users_select_self_or_admin RLS hides from a customer/anonymous caller.
 * It reads only users.is_admin (the same column is_admin() checks) and returns nothing but ids.
 */
export async function getAdminOwnedDesignerIds(designerIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(designerIds)].filter(Boolean);
  if (ids.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from("designer_profiles")
    .select("id, users!inner(is_admin)")
    .in("id", ids)
    .eq("users.is_admin", true);
  if (error) throw error;
  return new Set((data ?? []).map((d) => d.id));
}

export async function isAdminOwnedDesigner(designerId: string): Promise<boolean> {
  return (await getAdminOwnedDesignerIds([designerId])).has(designerId);
}
