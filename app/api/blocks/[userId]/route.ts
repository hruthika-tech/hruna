/**
 * Unblock — removes the caller's OWN block of `userId` (user_blocks RLS: blocker_id = auth.uid(), so
 * nobody can remove someone else's block). Messaging only resumes where the normal rules still allow
 * it: an existing conversation can be used again, and new ones still go through can_start_conversation.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/moderation/reports";
import { isModerationUnavailable } from "@/lib/moderation/server";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: { userId: string } }) {
  try {
    const ctx = await requireUser();
    if (!isUuid(params.userId)) return NextResponse.json({ status: "error", message: "Unknown user." }, { status: 400 });
    const { data, error } = await createClient()
      .from("user_blocks")
      .delete()
      .eq("blocker_id", ctx.user.id)
      .eq("blocked_id", params.userId)
      .select("blocked_id");
    if (error) {
      if (isModerationUnavailable(error)) return NextResponse.json({ status: "error", message: "Blocking isn't available yet." }, { status: 503 });
      throw error;
    }
    if (!data || data.length === 0) return NextResponse.json({ status: "error", message: "You haven't blocked this person." }, { status: 404 });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.blocks.delete");
  }
}
