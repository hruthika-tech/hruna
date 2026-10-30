/**
 * The signed-in designer's plan.
 *   GET  → the three plans, the designer's current plan, limits, usage and trial eligibility.
 *   POST { action: "start_trial" } → starts the one-time 14-day Designer Pro trial.
 *
 * Everything is scoped to the caller's own session (requireDesigner(); the database functions read
 * current_designer_id()). The trial needs no payment details, creates no payment and can't charge
 * anything on expiry — public.start_designer_pro_trial() enforces eligibility (approved designer,
 * plans switched on, never trialled, no active paid plan) atomically.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { getMyEntitlements, listDesignerPlans } from "@/lib/subscriptions/designer-plans";
import { TRIAL_DAYS, isPlansNotReadyError, trialNotEligibleReason } from "@/lib/subscriptions/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireDesigner();
    const supabase = createClient();
    const [entitlements, plans] = await Promise.all([getMyEntitlements(supabase), listDesignerPlans(supabase)]);
    const trialEligible =
      entitlements.enforced && entitlements.approved && !entitlements.trial_used && entitlements.plan_key === "designer_free";
    return NextResponse.json({
      status: "ok",
      plansActive: entitlements.enforced,
      plans,
      current: {
        planKey: entitlements.plan_key,
        isTrial: entitlements.is_trial,
        endsAt: entitlements.ends_at,
      },
      limits: entitlements.limits,
      usage: entitlements.usage,
      monthStart: entitlements.month_start,
      trial: { days: TRIAL_DAYS, eligible: trialEligible, used: entitlements.trial_used },
    });
  } catch (err) {
    return errorResponse(err, "api.designer.plan");
  }
}

export async function POST(request: Request) {
  try {
    await requireDesigner();
    const body = await request.json().catch(() => null);
    if (body?.action !== "start_trial") {
      return NextResponse.json({ status: "error", message: "action must be 'start_trial'." }, { status: 400 });
    }
    const supabase = createClient() as unknown as SupabaseClient;
    const { data, error } = await supabase.rpc("start_designer_pro_trial");
    if (error) {
      const reason = trialNotEligibleReason(error) ?? (isPlansNotReadyError(error) ? "Plans are not available yet." : null);
      if (reason) return NextResponse.json({ status: "error", code: "trial_not_eligible", message: reason }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ status: "ok", trial: { planKey: data.plan_key, endsAt: data.ends_at } });
  } catch (err) {
    return errorResponse(err, "api.designer.plan.trial");
  }
}
