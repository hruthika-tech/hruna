/**
 * Customer's own conversations — list (via the conversation_previews view, so last-message/unread
 * are always computed live from messages, never a stored column that could drift — see
 * supabase/migrations/20260829180008_messaging.sql) + get-or-create (used by "Message this
 * designer" buttons on a request/project page, mirroring the existing getOrCreateConversation
 * mock behavior).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminOwnedDesigner, requireCustomer } from "@/lib/supabase/authorization";
import { errorResponse, isPostgrestError } from "@/lib/supabase/errors";
import { getDesignerSummaries } from "@/lib/customer/data";
import { isMissingStartRule, startRuleUnavailable } from "@/lib/messaging/start-rules";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const ctx = await requireCustomer();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("conversation_previews")
      .select("*")
      .eq("customer_id", ctx.customerId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw error;

    const designers = await getDesignerSummaries(supabase, (data ?? []).map((c) => c.designer_id!).filter(Boolean));

    const conversations = (data ?? []).map((c) => ({
      id: c.id,
      customerId: c.customer_id,
      designerId: c.designer_id,
      lastMessage: c.last_message ?? "",
      lastTimestamp: c.last_message_at ?? "",
      unread: c.customer_unread_count ?? 0,
      // This account is on both sides (its own studio) — every message has its own user id as sender,
      // so the UI can explain why they all appear as "mine". New ones are refused (see POST).
      isSelf: !!ctx.designerId && c.designer_id === ctx.designerId,
      designer: c.designer_id ? designers.get(c.designer_id) : undefined,
    }));

    return NextResponse.json({ status: "ok", conversations });
  } catch (err) {
    return errorResponse(err, "api.conversations.list");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCustomer();
    const body = await request.json().catch(() => null);
    const designerId = typeof body?.designerId === "string" ? body.designerId : "";
    if (!designerId) {
      return NextResponse.json({ status: "error", message: "designerId is required." }, { status: 400 });
    }
    // An account that is both a customer and a designer must not open a conversation with ITSELF:
    // both sides would be the same user, so every message would look "sent by me" on both screens
    // and the studio would list its own owner as a customer. Compared by the caller's own verified
    // designer id (never client input).
    if (ctx.designerId && designerId === ctx.designerId) {
      return NextResponse.json({ status: "error", message: "You can't start a conversation with your own studio." }, { status: 400 });
    }
    if (!UUID_RE.test(designerId)) {
      return NextResponse.json({ status: "error", message: "designerId is required." }, { status: 400 });
    }
    if (await isAdminOwnedDesigner(designerId)) {
      return NextResponse.json({ status: "error", message: "Designer not found." }, { status: 404 });
    }

    const supabase = createClient();

    // An existing conversation with this designer is always reopened, whatever has changed since.
    const { data: existingFirst, error: lookupError } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", ctx.customerId)
      .eq("designer_id", designerId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existingFirst) return NextResponse.json({ status: "ok", conversationId: existingFirst.id });

    // Starting a NEW one follows the same rule the conversations insert policy enforces
    // (supabase/migrations/20261012000002_conversation_start_rules.sql): an approved designer, or
    // one this customer already works with — asked here only to give a clear answer instead of a
    // generic permission error.
    const { data: allowed, error: ruleError } = await supabase.rpc("can_start_conversation", {
      p_customer_id: ctx.customerId,
      p_designer_id: designerId,
    });
    if (ruleError && isMissingStartRule(ruleError)) return startRuleUnavailable("api.conversations.getOrCreate", ruleError);
    if (ruleError) throw ruleError;
    if (!allowed) {
      return NextResponse.json({ status: "error", message: "This designer isn't available for messages right now." }, { status: 403 });
    }

    const { data: created, error: insertError } = await supabase
      .from("conversations")
      .insert({ customer_id: ctx.customerId, designer_id: designerId })
      .select()
      .single();

    if (!insertError) {
      return NextResponse.json({ status: "ok", conversationId: created.id });
    }

    // unique(customer_id, designer_id) — created concurrently since the lookup above; return it.
    if (isPostgrestError(insertError) && insertError.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", ctx.customerId)
        .eq("designer_id", designerId)
        .single();
      if (fetchError) throw fetchError;
      return NextResponse.json({ status: "ok", conversationId: existing.id });
    }

    throw insertError;
  } catch (err) {
    return errorResponse(err, "api.conversations.getOrCreate");
  }
}
