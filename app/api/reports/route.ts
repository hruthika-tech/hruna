/**
 * Report the other participant of one of my conversations.
 *   POST { conversationId, reason, description?, messageIds? }
 * The conversation is stored as evidence only when messages were selected; otherwise the report
 * names the user and reason alone.
 *
 * The reported user is derived from the caller's own conversation (never a client-supplied user id),
 * so reporting yourself or a stranger isn't possible. Evidence is only what the reporter selected, and
 * every message must belong to that conversation — checked here and again by the user_reports insert
 * policy (user_report_evidence_ok). The report starts as 'pending'; nothing is suspended or restricted.
 * The reported user can never read it (RLS), so the reporter's identity isn't exposed to them.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse, isPostgrestError } from "@/lib/supabase/errors";
import { isUuid, validateReportInput } from "@/lib/moderation/reports";
import { conversationOtherUser, isModerationUnavailable } from "@/lib/moderation/server";

export const dynamic = "force-dynamic";

const notReady = () =>
  NextResponse.json({ status: "error", code: "moderation_not_ready", message: "Reporting isn't available yet. Please try again later." }, { status: 503 });

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.conversationId)) return NextResponse.json({ status: "error", message: "Choose a conversation to report from." }, { status: 400 });
    const input = validateReportInput(body);
    if (!input.ok) return NextResponse.json({ status: "error", message: input.message }, { status: 400 });

    const supabase = createClient();
    let reportedId: string | null;
    try {
      reportedId = await conversationOtherUser(supabase, body.conversationId);
    } catch (err) {
      if (isModerationUnavailable(err)) return notReady();
      throw err;
    }
    if (!reportedId) return NextResponse.json({ status: "error", message: "Conversation not found." }, { status: 404 });
    if (reportedId === ctx.user.id) return NextResponse.json({ status: "error", message: "You can't report yourself." }, { status: 400 });

    if (input.value.messageIds.length > 0) {
      const { data: found, error: lookupError } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", body.conversationId)
        .in("id", input.value.messageIds);
      if (lookupError) throw lookupError;
      if ((found ?? []).length !== input.value.messageIds.length) {
        return NextResponse.json({ status: "error", message: "Some of the selected messages aren't from this conversation." }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from("user_reports")
      .insert({
        reporter_id: ctx.user.id,
        reported_id: reportedId,
        reason: input.value.reason,
        description: input.value.description,
        // The conversation is referenced only when the reporter chose to include messages from it.
        conversation_id: input.value.messageIds.length > 0 ? body.conversationId : null,
        message_ids: input.value.messageIds,
      })
      .select("id")
      .single();
    if (error) {
      if (isModerationUnavailable(error)) return notReady();
      // The insert policy refused it (e.g. evidence that doesn't belong to the caller's conversation).
      if (isPostgrestError(error) && error.code === "42501") {
        return NextResponse.json({ status: "error", message: "This report couldn't be filed with that evidence." }, { status: 400 });
      }
      throw error;
    }
    return NextResponse.json({ status: "ok", reportId: data.id });
  } catch (err) {
    return errorResponse(err, "api.reports.create");
  }
}
