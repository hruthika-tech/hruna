/**
 * Platform payment/subscription configuration (§14) — payment_settings is a singleton row
 * (`id boolean primary key default true check (id)`); payment_settings_admin_update RLS is
 * admin-only. Never turns anything ON as a side effect of an unrelated field's update — every
 * field is independently optional in the patch, matching the existing UI's separate toggles.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { logAdminAction } from "@/lib/admin/audit";
import type { TablesUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAdmin();
    const body = await request.json().catch(() => null);

    const patch: TablesUpdate<"payment_settings"> = { updated_at: new Date().toISOString() };
    const changes: string[] = [];
    if (typeof body?.paymentSystemEnabled === "boolean") {
      patch.payment_system_enabled = body.paymentSystemEnabled;
      changes.push(`payment system ${body.paymentSystemEnabled ? "enabled" : "disabled"}`);
    }
    // Customers use HRUNA for free. The legacy switch can only be turned off (it has no effect
    // either way — customer pages are never gated and customer checkout is refused).
    if (body?.customerSubscriptionsEnabled === true) {
      return NextResponse.json({ status: "error", message: "Customers use HRUNA for free — customer subscriptions can't be switched on." }, { status: 400 });
    }
    if (typeof body?.customerSubscriptionsEnabled === "boolean") {
      patch.customer_subscriptions_enabled = body.customerSubscriptionsEnabled;
      changes.push(`customer subscriptions ${body.customerSubscriptionsEnabled ? "enabled" : "disabled"}`);
    }
    if (typeof body?.designerSubscriptionsEnabled === "boolean") {
      patch.designer_subscriptions_enabled = body.designerSubscriptionsEnabled;
      changes.push(`designer subscriptions ${body.designerSubscriptionsEnabled ? "enabled" : "disabled"}`);
    }
    if (typeof body?.currency === "string" && body.currency) {
      patch.currency = body.currency;
      changes.push(`currency set to ${body.currency}`);
    }

    if (changes.length === 0) {
      return NextResponse.json({ status: "error", message: "Nothing to update." }, { status: 400 });
    }

    const supabase = createClient();
    const { error } = await supabase.from("payment_settings").update(patch).eq("id", true);
    if (error) throw error;

    await logAdminAction(supabase, ctx.user.id, { subjectType: "platform", action: `Changed platform settings: ${changes.join(", ")}` });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.admin.settings.payment");
  }
}
