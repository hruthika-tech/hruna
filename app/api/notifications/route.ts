/**
 * Customer activity/notifications feed. There is no notifications table: the feed is built on request
 * from the signed-in customer's own requests/proposals/projects (never chat messages) through their regular
 * (RLS-scoped) client — see lib/notifications/feed.ts, shared with the navbar unread badge.
 *
 * Each item carries `read`, from public.notification_reads (the customer's own rows only). If that
 * table isn't in this database yet, `readTracking` is false and every item reads as unread, exactly as
 * before (the page then keeps read state for the visit only, and the navbar shows no count).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { customerFeed, readState } from "@/lib/notifications/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireCustomer();
    const supabase = createClient();
    const items = await customerFeed(supabase, { customerId: ctx.customerId });
    const state = await readState(supabase, ctx.user.id, items.map((i) => i.id));
    return NextResponse.json({
      status: "ok",
      readTracking: state.available,
      notifications: items.map((i) => ({ ...i, read: state.available ? state.read.has(i.id) : false })),
    });
  } catch (err) {
    return errorResponse(err, "api.notifications.list");
  }
}
