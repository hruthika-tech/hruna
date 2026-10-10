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

export const dynamic = "force-dynamic";

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
    if (await isAdminOwnedDesigner(designerId)) {
      return NextResponse.json({ status: "error", message: "Designer not found." }, { status: 404 });
    }

    const supabase = createClient();
    const { data: created, error: insertError } = await supabase
      .from("conversations")
      .insert({ customer_id: ctx.customerId, designer_id: designerId })
      .select()
      .single();

    if (!insertError) {
      return NextResponse.json({ status: "ok", conversationId: created.id });
    }

    // unique(customer_id, designer_id) — the conversation already exists; fetch and return it
    // instead of treating "already have a conversation with this designer" as a failure.
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
