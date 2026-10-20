/**
 * The Discover Requests swipe feed (§5 of the Phase 5 brief — explicitly critical). This is
 * deliberately NOT `SELECT * FROM fashion_requests` (§44): it's gated by requireApprovedDesigner()
 * (server-side, not just a frontend check) AND by fashion_requests_select's own RLS, which for a
 * non-preferred row only ever returns it to a designer for whom is_approved_designer() is true —
 * two independent layers landing on the same restriction, neither trusting the other alone.
 *
 * "Open, public, not yet interacted with or proposed on BY THIS DESIGNER". Open = submitted OR
 * proposal_received (lib/requests/lifecycle.ts): another designer's proposal moves the request to
 * proposal_received, which must not hide it from everyone else while the customer is still choosing
 * — only the customer's acceptance closes it. Interactions and proposals are filtered per designer.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { mapRequest, resolveRequestImages } from "@/lib/designer/data";
import { OPEN_REQUEST_STATUSES } from "@/lib/requests/lifecycle";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireApprovedDesigner();
    const supabase = createClient();

    const [{ data: requests, error }, { data: interactions }, { data: ownProposals }] = await Promise.all([
      supabase
        .from("fashion_requests")
        .select("*")
        .in("status", [...OPEN_REQUEST_STATUSES])
        .is("preferred_designer_id", null)
        .order("created_at", { ascending: false }),
      supabase.from("designer_request_interactions").select("request_id").eq("designer_id", ctx.designerId),
      supabase.from("proposals").select("request_id").eq("designer_id", ctx.designerId),
    ]);
    if (error) throw error;

    const handledIds = new Set([...(interactions ?? []), ...(ownProposals ?? [])].map((i) => i.request_id));
    const feed = (requests ?? []).filter((r) => !handledIds.has(r.id));

    const mapped = await Promise.all(
      feed.map(async (row) => mapRequest(row, await resolveRequestImages(supabase, row.id)))
    );

    return NextResponse.json({ status: "ok", requests: mapped });
  } catch (err) {
    return errorResponse(err, "api.designer.feed");
  }
}
