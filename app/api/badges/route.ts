/**
 * Unread counts for the navbar badges — the SIGNED-IN user's own, for one side of the app:
 *   ?side=customer  (components/layout/Navbar.tsx)    ?side=designer  (components/layout/DesignerNavbar.tsx)
 *
 * messages       incoming messages the user hasn't read yet, summed over their conversations on that
 *                side: conversation_previews.{customer,designer}_unread_count — messages from the OTHER
 *                participant newer than this side's last_read_at (opening a conversation updates it,
 *                app/api/conversations/[id]/messages). The view is security_invoker, so RLS limits it
 *                to the caller's own conversations.
 * notifications  items of that side's notification feed the user hasn't read (lib/notifications/feed.ts),
 *                or null when read tracking isn't available in this database — never a guessed number.
 *
 * Counts are absolute (not deltas), so overlapping refreshes can't double-count. `userId` lets the
 * client drop a response that belongs to an account it has since switched away from.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { customerFeed, designerFeed, readState } from "@/lib/notifications/feed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await requireUser();
    const side = new URL(request.url).searchParams.get("side");
    if (side !== "customer" && side !== "designer") {
      return NextResponse.json({ status: "error", message: "side must be customer or designer." }, { status: 400 });
    }
    const supabase = createClient();
    const sideId = side === "customer" ? ctx.customerId : ctx.designerId;
    if (!sideId) return NextResponse.json({ status: "ok", userId: ctx.user.id, side, messages: null, notifications: null });

    const [previews, feed] = await Promise.all([
      side === "customer"
        ? supabase.from("conversation_previews").select("customer_unread_count").eq("customer_id", sideId)
        : supabase.from("conversation_previews").select("designer_unread_count").eq("designer_id", sideId),
      side === "customer" ? customerFeed(supabase, { customerId: sideId }) : designerFeed(supabase, { designerId: sideId }),
    ]);
    if (previews.error) throw previews.error;
    const messages = (previews.data ?? []).reduce(
      (sum, row) => sum + Number((row as { customer_unread_count?: number | null; designer_unread_count?: number | null })[`${side}_unread_count`] ?? 0),
      0
    );
    const state = await readState(supabase, ctx.user.id, feed.map((i) => i.id));
    const notifications = state.available ? feed.filter((i) => !state.read.has(i.id)).length : null;

    return NextResponse.json({ status: "ok", userId: ctx.user.id, side, messages, notifications });
  } catch (err) {
    return errorResponse(err, "api.badges");
  }
}
