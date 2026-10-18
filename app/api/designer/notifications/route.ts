/**
 * Designer activity/notifications feed — built on request from the designer's own verification,
 * projects, reviews and the open requests they can act on, through their regular (RLS-scoped) client.
 * See lib/notifications/feed.ts (shared with the navbar unread badge). Each item carries `read` from
 * public.notification_reads (own rows only); without that table `readTracking` is false.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { designerFeed, readState } from "@/lib/notifications/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();
    const items = await designerFeed(supabase, { designerId: ctx.designerId });
    const state = await readState(supabase, ctx.user.id, items.map((i) => i.id));
    return NextResponse.json({
      status: "ok",
      readTracking: state.available,
      notifications: items.map((i) => ({ ...i, read: state.available ? state.read.has(i.id) : false })),
    });
  } catch (err) {
    return errorResponse(err, "api.designer.notifications.list");
  }
}
