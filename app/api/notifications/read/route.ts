/**
 * Marks notifications read for the SIGNED-IN user (customer or designer feed). Writes go through the
 * user's own client, so public.notification_reads' RLS only ever accepts rows for auth.uid(). Keys must
 * have the exact shape the feeds produce (lib/notifications/feed.ts); at most 50 per call; repeating a
 * key is harmless. `saved: false` means read state isn't available in this database yet.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { markRead } from "@/lib/notifications/feed";
import { isNotificationKey } from "@/lib/notifications/keys";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const body = await request.json().catch(() => null);
    const keys: unknown = body?.keys;
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > 50 || !keys.every(isNotificationKey)) {
      return NextResponse.json({ status: "error", message: "Invalid notification keys." }, { status: 400 });
    }
    const saved = await markRead(createClient(), ctx.user.id, [...new Set(keys as string[])]);
    return NextResponse.json({ status: "ok", saved });
  } catch (err) {
    return errorResponse(err, "api.notifications.read");
  }
}
