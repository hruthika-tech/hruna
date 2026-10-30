/**
 * Designer plan editing (Free / Designer Plus / Designer Pro) — admin only.
 *
 * requireAdmin() here, and subscription_plans_admin_write RLS in the database, so no browser user
 * other than an admin session can change a plan. Every field is validated server-side
 * (lib/subscriptions/plans.ts validatePlanEdit):
 *   - name, price (₹, 2 decimals; Free is always ₹0 — also a database constraint; paid plans > ₹0),
 *     description, features, active (Free can't be switched off);
 *   - limits: dress listings, collections, previous creations, proposals per calendar month —
 *     whole numbers or null (= unlimited, the same convention the database triggers use) — and
 *     analytics history (7/30/90 days) + comparison. These are the very columns the limit triggers,
 *     designer_effective_plan() and my_designer_entitlements() read, so an edit takes effect at once.
 * Plan keys, tiers, currency (INR) and the fixed studio limits (3 highlights / 2 Meet the Designer
 * entries) can't be changed. Retired plans (no plan_key — the old single customer and designer
 * plans) are history and read-only; their payments and subscriptions stay as they are.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { logAdminAction } from "@/lib/admin/audit";
import { mapSubscriptionPlan } from "@/lib/admin/data";
import { isUuid } from "@/lib/moderation/reports";
import { isDesignerPlanKey, validatePlanEdit } from "@/lib/subscriptions/plans";

export const dynamic = "force-dynamic";

const LIMIT_COLUMNS: Record<string, string> = {
  dresses: "max_dresses",
  collections: "max_collections",
  previous_creations: "max_previous_creations",
  proposals_per_month: "max_proposals_per_month",
  analytics_max_days: "analytics_max_days",
  analytics_comparison: "analytics_comparison",
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAdmin();
    if (!isUuid(params.id)) return NextResponse.json({ status: "error", message: "Plan not found." }, { status: 404 });
    const body = await request.json().catch(() => null);

    // Untyped until types/supabase.ts includes the plan columns.
    const supabase = createClient() as unknown as SupabaseClient;
    const { data: current, error: readError } = await supabase.from("subscription_plans").select("*").eq("id", params.id).maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ status: "error", message: "Plan not found." }, { status: 404 });
    if (!isDesignerPlanKey(current.plan_key)) {
      return NextResponse.json(
        { status: "error", code: "legacy_plan", message: "Retired plans are kept for payment history and can't be edited." },
        { status: 409 }
      );
    }

    const checked = validatePlanEdit(body, current.plan_key);
    if (!checked.ok) return NextResponse.json({ status: "error", message: checked.message }, { status: 400 });
    const edit = checked.value;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const changes: string[] = [];
    if (edit.name !== undefined) { patch.name = edit.name; changes.push(`name "${edit.name}"`); }
    if (edit.price !== undefined) { patch.price = edit.price; changes.push(`price ${current.price} → ${edit.price}`); }
    if (edit.description !== undefined) { patch.description = edit.description; changes.push("description"); }
    if (edit.features !== undefined) { patch.features = edit.features; changes.push("features"); }
    if (edit.isActive !== undefined) { patch.is_active = edit.isActive; changes.push(edit.isActive ? "activated" : "deactivated"); }
    for (const [key, value] of Object.entries(edit.limits ?? {})) {
      patch[LIMIT_COLUMNS[key]] = value;
      changes.push(`${key} → ${value === null ? "unlimited" : value}`);
    }

    const { data, error } = await supabase.from("subscription_plans").update(patch).eq("id", params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ status: "error", message: "Plan not found." }, { status: 404 });

    await logAdminAction(createClient(), ctx.user.id, {
      subjectType: "platform",
      subjectId: params.id,
      action: `Updated designer plan "${data.name}": ${changes.join(", ")}`,
    });
    return NextResponse.json({ status: "ok", plan: mapSubscriptionPlan(data) });
  } catch (err) {
    return errorResponse(err, "api.admin.subscriptions.plans.update");
  }
}
