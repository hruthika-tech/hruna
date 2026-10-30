import "server-only";

// Server-side designer plan entitlements. The database is the authority (plan rows, limit
// triggers, public.my_designer_entitlements()); routes use this module to (1) give a clear 403
// before attempting a write that would exceed the plan, and (2) read the plan for features such as
// analytics ranges. The trigger still runs on every insert, so a race between two requests can't
// slip past the pre-check.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  PLANS_NOT_READY_ENTITLEMENTS,
  isPlansNotReadyError,
  PLAN_LIMIT_CODE,
  hasRoomFor,
  planLimitMessage,
  type DesignerEntitlements,
  type DesignerPlanKey,
  type LimitedResource,
} from "./plans";

// Untyped until types/supabase.ts is regenerated with the plan columns and functions.
const untyped = (client: ReturnType<typeof createClient>) => client as unknown as SupabaseClient;

/** The signed-in designer's own plan, limits and usage (raises 42501 for non-designers). On a
 *  database without the plan migrations, the pre-plans behaviour: nothing restricted. */
export async function getMyEntitlements(client: ReturnType<typeof createClient> = createClient()): Promise<DesignerEntitlements> {
  const { data, error } = await untyped(client).rpc("my_designer_entitlements");
  if (error) {
    if (isPlansNotReadyError(error)) return PLANS_NOT_READY_ENTITLEMENTS;
    throw error;
  }
  return data as DesignerEntitlements;
}

/** Whether the designer-plan migrations are on this database. */
export const plansReady = (ent: DesignerEntitlements) => ent !== PLANS_NOT_READY_ENTITLEMENTS;

export function planLimitResponse(resource: LimitedResource, limit: number, planKey: DesignerPlanKey | null) {
  return NextResponse.json(
    { status: "error", code: PLAN_LIMIT_CODE, resource, limit, planKey, message: planLimitMessage(resource, limit, planKey) },
    { status: 403 }
  );
}

/** 403 response if the designer's plan has no room for one more `resource`, else null. */
export async function planRoomResponse(
  resource: Exclude<LimitedResource, "analytics_days">,
  client: ReturnType<typeof createClient> = createClient()
): Promise<NextResponse | null> {
  const ent = await getMyEntitlements(client);
  if (hasRoomFor(ent, resource)) return null;
  return planLimitResponse(resource, ent.limits[resource] as number, ent.plan_key);
}

export interface DesignerPlanRow {
  planKey: DesignerPlanKey;
  name: string;
  price: number;
  currency: string;
  billingInterval: string;
  description: string;
  features: string[];
  limits: DesignerEntitlements["limits"];
}

/** The three designer plans, cheapest first (public data). */
export async function listDesignerPlans(client: ReturnType<typeof createClient> = createClient()): Promise<DesignerPlanRow[]> {
  const { data, error } = await untyped(client)
    .from("subscription_plans")
    .select("*")
    .eq("role", "designer")
    .eq("is_active", true)
    .not("plan_key", "is", null)
    .order("tier_rank", { ascending: true });
  if (error) {
    if (isPlansNotReadyError(error)) return [];
    throw error;
  }
  return (data ?? []).map((p: Record<string, any>) => ({
    planKey: p.plan_key,
    name: p.name,
    price: Number(p.price),
    currency: p.currency,
    billingInterval: p.billing_interval,
    description: p.description ?? "",
    features: p.features ?? [],
    limits: {
      dresses: p.max_dresses,
      collections: p.max_collections,
      previous_creations: p.max_previous_creations,
      highlights: p.max_highlights,
      meet_entries: p.max_meet_entries,
      proposals_per_month: p.max_proposals_per_month,
      analytics_max_days: p.analytics_max_days,
      analytics_comparison: p.analytics_comparison,
    },
  }));
}
