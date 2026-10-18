/**
 * The signed-in user's own messaging blocks.
 *   GET   → who I've blocked (for Settings → Blocked users)
 *   POST  { conversationId } → block the OTHER participant of one of my conversations
 *
 * The blocked user is never taken from the client: it's derived from a conversation the caller is
 * really in (conversation_other_user), and user_blocks RLS only accepts rows with blocker_id =
 * auth.uid(). Blocking stops messages and new conversations both ways (enforced in the database);
 * nothing else — messages, projects, proposals, requests, roles — is touched.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/moderation/reports";
import { conversationOtherUser, isModerationUnavailable } from "@/lib/moderation/server";

export const dynamic = "force-dynamic";

const unavailable = () =>
  NextResponse.json({ status: "error", code: "moderation_not_ready", message: "Blocking isn't available yet. Please try again later." }, { status: 503 });

export async function GET() {
  try {
    await requireUser();
    const { data, error } = await createClient().rpc("my_blocked_users");
    if (error) {
      if (isModerationUnavailable(error)) return NextResponse.json({ status: "ok", available: false, blocked: [] });
      throw error;
    }
    return NextResponse.json({
      status: "ok",
      available: true,
      blocked: (data ?? []).map((b) => ({ userId: b.blocked_id, name: b.display_name, blockedAt: b.blocked_at })),
    });
  } catch (err) {
    return errorResponse(err, "api.blocks.list");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.conversationId)) {
      return NextResponse.json({ status: "error", message: "Choose a conversation." }, { status: 400 });
    }
    const supabase = createClient();
    let other: string | null;
    try {
      other = await conversationOtherUser(supabase, body.conversationId);
    } catch (err) {
      if (isModerationUnavailable(err)) return unavailable();
      throw err;
    }
    if (!other) return NextResponse.json({ status: "error", message: "Conversation not found." }, { status: 404 });

    const { error } = await supabase
      .from("user_blocks")
      .upsert({ blocker_id: ctx.user.id, blocked_id: other }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
    if (error) {
      if (isModerationUnavailable(error)) return unavailable();
      throw error;
    }
    return NextResponse.json({ status: "ok", blockState: "blocked_by_me" });
  } catch (err) {
    return errorResponse(err, "api.blocks.create");
  }
}
