/**
 * Subscriptions & Payments admin bundle (§13/§16) — payment_settings + subscription_plans + ALL
 * user_subscriptions + ALL payments, with user summaries. Every table here already grants admin
 * full read via RLS (payment_settings_select_public is public anyway; the other three have
 * explicit "user_id = auth.uid() OR is_admin()" / admin-only clauses). No payment gateway is
 * connected — `payments` will genuinely be empty until one exists, and the response reflects that
 * plainly rather than fabricating rows.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { mapSubscriptionPlan, mapUserSubscription, mapPayment } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createClient();

    const [{ data: settings }, { data: plans }, { data: subs }, { data: payments }] = await Promise.all([
      supabase.from("payment_settings").select("*").eq("id", true).single(),
      supabase.from("subscription_plans").select("*").order("role", { ascending: true }),
      supabase.from("user_subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
    ]);

    const userIds = [...new Set([...(subs ?? []).map((s) => s.user_id), ...(payments ?? []).map((p) => p.user_id)])];
    const { data: users } = userIds.length
      ? await supabase.from("users").select("id, display_name, email").in("id", userIds)
      : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
    const { data: customerRows } = userIds.length
      ? await supabase.from("customer_profiles").select("user_id").in("user_id", userIds)
      : { data: [] as { user_id: string }[] };
    const customerUserIds = new Set((customerRows ?? []).map((c) => c.user_id));
    const nameById = new Map((users ?? []).map((u) => [u.id, u.display_name || u.email || u.id]));

    const userSummary = (userId: string) => ({
      name: nameById.get(userId) ?? userId,
      type: customerUserIds.has(userId) ? ("Customer" as const) : ("Designer" as const),
    });

    // Designer plans (Free / Plus / Pro, ordered by tier) vs retired plans kept only for history
    // (the old single customer and designer plans) — the latter are read-only.
    const mappedPlans = (plans ?? []).map(mapSubscriptionPlan);
    const designerPlans = mappedPlans.filter((p) => !p.legacy).sort((a, b) => (a.tierRank ?? 0) - (b.tierRank ?? 0));
    const legacyPlans = mappedPlans.filter((p) => p.legacy);
    const planById = new Map(mappedPlans.map((p) => [p.id, p]));

    return NextResponse.json({
      status: "ok",
      plansReady: designerPlans.length > 0,
      designerPlans,
      legacyPlans,
      settings: settings
        ? {
            paymentSystemEnabled: settings.payment_system_enabled,
            customerSubscriptionsEnabled: settings.customer_subscriptions_enabled,
            designerSubscriptionsEnabled: settings.designer_subscriptions_enabled,
            currency: settings.currency,
            updatedAt: settings.updated_at,
          }
        : null,
      plans: mappedPlans,
      subscriptions: (subs ?? []).map((s) => ({ ...mapUserSubscription(s), user: userSummary(s.user_id) })),
      payments: (payments ?? []).map((p) => {
        const plan = p.plan_id ? planById.get(p.plan_id) : undefined;
        return { ...mapPayment(p), user: userSummary(p.user_id), planName: plan?.name ?? null, planRole: plan?.role ?? null, planLegacy: plan?.legacy ?? null };
      }),
    });
  } catch (err) {
    return errorResponse(err, "api.admin.subscriptions.get");
  }
}
