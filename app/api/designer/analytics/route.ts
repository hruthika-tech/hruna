/**
 * The signed-in designer's own analytics. GET ?range=7|30|90 (days, ending today in IST).
 *
 * Ownership is enforced twice: requireDesigner() here (401 signed out, 403 customer/admin), and in
 * the database — public.designer_analytics() takes no designer id and reads current_designer_id()
 * from this request's own session, so it can only ever return the caller's numbers. Aggregates only.
 * Without ?range the plan's default (30 days, or the longest it allows) is used; a range beyond the
 * plan is a 403 plan_limit.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { isMissingSchemaObject } from "@/lib/supabase/schema-readiness";
import { getAnalyticsEntitlement } from "@/lib/analytics/plans";
import { getMyEntitlements, planLimitResponse } from "@/lib/subscriptions/designer-plans";
import { isRangeDays, resolveRange } from "@/lib/analytics/ranges";
import { buildAnalyticsView, type RawAnalytics } from "@/lib/analytics/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireDesigner();
    // The designer's plan decides the ranges (lib/analytics/plans.ts); designer_analytics() enforces
    // the same limits again in the database.
    const entitlements = await getMyEntitlements();
    const entitlement = getAnalyticsEntitlement(entitlements);

    const param = new URL(request.url).searchParams.get("range");
    const fallback = entitlement.ranges.includes(30) ? 30 : entitlement.ranges[entitlement.ranges.length - 1];
    const requested = param === null ? fallback : Number(param);
    if (!isRangeDays(requested)) {
      return NextResponse.json({ status: "error", message: "range must be one of 7, 30, 90 days." }, { status: 400 });
    }
    if (!entitlement.ranges.includes(requested)) {
      return planLimitResponse("analytics_days", Math.max(...entitlement.ranges), entitlements.plan_key);
    }
    const range = resolveRange(requested);

    // Untyped until types/supabase.ts is regenerated with designer_analytics().
    const supabase = createClient() as unknown as SupabaseClient;
    const { data, error } = await supabase.rpc("designer_analytics", { p_start: range.start, p_end: range.end });
    if (error) {
      // Database without the analytics migrations yet: a clear "not ready" answer, not a failure.
      if (isMissingSchemaObject(error)) {
        return NextResponse.json(
          { status: "error", code: "analytics_not_ready", message: "Studio analytics are being set up and will appear here soon." },
          { status: 503 }
        );
      }
      throw error;
    }

    return NextResponse.json({ status: "ok", analytics: buildAnalyticsView(data as RawAnalytics, entitlement) });
  } catch (err) {
    return errorResponse(err, "api.designer.analytics");
  }
}
