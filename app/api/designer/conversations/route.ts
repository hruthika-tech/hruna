/**
 * Designer's own conversations — list + get-or-create. Exact designer-side mirror of
 * app/api/conversations/route.ts (§20/§19) — same conversation_previews view, scoped by
 * designer_id instead of customer_id, embedding a customer summary instead of a designer one.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse, isPostgrestError } from "@/lib/supabase/errors";
import { getCustomerSummaries } from "@/lib/designer/data";
import { isMissingStartRule, startRuleUnavailable } from "@/lib/messaging/start-rules";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("conversation_previews")
      .select("*")
      .eq("designer_id", ctx.designerId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw error;

    const customers = await getCustomerSummaries(supabase, (data ?? []).map((c) => c.customer_id!).filter(Boolean));

    const conversations = (data ?? []).map((c) => ({
      id: c.id,
      customerId: c.customer_id,
      designerId: c.designer_id,
      lastMessage: c.last_message ?? "",
      lastTimestamp: c.last_message_at ?? "",
      unread: c.designer_unread_count ?? 0,
      // See app/api/conversations/route.ts — the account is on both sides of this conversation.
      isSelf: !!ctx.customerId && c.customer_id === ctx.customerId,
      customer: c.customer_id ? customers.get(c.customer_id) : undefined,
    }));

    return NextResponse.json({ status: "ok", conversations });
  } catch (err) {
    return errorResponse(err, "api.designer.conversations.list");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const customerId = typeof body?.customerId === "string" ? body.customerId : "";
    if (!customerId) {
      return NextResponse.json({ status: "error", message: "customerId is required." }, { status: 400 });
    }
    // Same rule as the customer side (app/api/conversations/route.ts): never a conversation between
    // an account's own designer and customer profiles. Compared by the caller's own verified ids.
    if (ctx.customerId && customerId === ctx.customerId) {
      return NextResponse.json({ status: "error", message: "You can't start a conversation with your own customer profile." }, { status: 400 });
    }

    if (!UUID_RE.test(customerId)) {
      return NextResponse.json({ status: "error", message: "customerId is required." }, { status: 400 });
    }

    const supabase = createClient();

    // An existing conversation with this customer is always reopened.
    const { data: existingFirst, error: lookupError } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", customerId)
      .eq("designer_id", ctx.designerId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existingFirst) return NextResponse.json({ status: "ok", conversationId: existingFirst.id });

    // Starting a NEW one needs a real relationship — the same rule the conversations insert policy
    // enforces (supabase/migrations/20261012000002_conversation_start_rules.sql): a shared project,
    // a proposal from this designer, or an open request directed at them / public while approved.
    const { data: allowed, error: ruleError } = await supabase.rpc("can_start_conversation", {
      p_customer_id: customerId,
      p_designer_id: ctx.designerId,
    });
    if (ruleError && isMissingStartRule(ruleError)) return startRuleUnavailable("api.designer.conversations.getOrCreate", ruleError);
    if (ruleError) throw ruleError;
    if (!allowed) {
      return NextResponse.json(
        { status: "error", message: "You can message a customer once they have an open request you can respond to, you've sent them a proposal, or you share a project." },
        { status: 403 }
      );
    }

    const { data: created, error: insertError } = await supabase
      .from("conversations")
      .insert({ customer_id: customerId, designer_id: ctx.designerId })
      .select()
      .single();

    if (!insertError) {
      return NextResponse.json({ status: "ok", conversationId: created.id });
    }

    if (isPostgrestError(insertError) && insertError.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .eq("designer_id", ctx.designerId)
        .single();
      if (fetchError) throw fetchError;
      return NextResponse.json({ status: "ok", conversationId: existing.id });
    }

    throw insertError;
  } catch (err) {
    return errorResponse(err, "api.designer.conversations.getOrCreate");
  }
}
