/**
 * Designer's own proposals — list + create (§12/§13/§15). `designer_id` always comes from
 * requireApprovedDesigner()'s session-derived id — Designer A can never submit a proposal
 * "pretending to be" Designer B, and never as a non-approved designer (proposals_insert_own RLS
 * would additionally block this even without the explicit check here, since a non-approved
 * designer generally can't even SEE an eligible request to propose on in the first place — see
 * app/api/designer/feed/route.ts's comment — but requireApprovedDesigner() gives a clear, honest
 * error instead of a generic RLS 42501 for the case where they somehow have a request id).
 * Creating a proposal never touches fashion_requests' content — the original customer request is
 * untouched (only its status may move submitted → proposal_received, below). A request that is no
 * longer open (the customer accepted a proposal) refuses new proposals with a clear 409.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { mapProposal, mapRequest, resolveRequestImages } from "@/lib/designer/data";
import type { TablesInsert } from "@/lib/supabase/types";
import { isRequestOpenForProposals, REQUEST_CLOSED_MESSAGE } from "@/lib/requests/lifecycle";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireApprovedDesigner();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .eq("designer_id", ctx.designerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const requestIds = (data ?? []).map((p) => p.request_id);
    const requestsResult = requestIds.length
      ? await supabase.from("fashion_requests").select("*").in("id", requestIds)
      : null;
    const requestById = new Map((requestsResult?.data ?? []).map((r) => [r.id, r]));

    const proposals = await Promise.all(
      (data ?? []).map(async (p) => {
        const request = requestById.get(p.request_id);
        return {
          ...mapProposal(p),
          request: request ? mapRequest(request, await resolveRequestImages(supabase, request.id)) : undefined,
        };
      })
    );

    return NextResponse.json({ status: "ok", proposals });
  } catch (err) {
    return errorResponse(err, "api.designer.proposals.list");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApprovedDesigner();
    const body = await request.json().catch(() => null);

    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const price = typeof body?.price === "number" ? body.price : NaN;
    const estimatedDays = typeof body?.estimatedDays === "number" ? body.estimatedDays : null;
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (!requestId || !Number.isFinite(price) || price < 0 || !description) {
      return NextResponse.json(
        { status: "error", message: "A request, a price, and a description are required." },
        { status: 400 }
      );
    }

    const supabase = createClient();
    // Read with the designer's own client (RLS): a request they can't see falls through to the insert,
    // which RLS refuses as before. A visible but closed request gets a clear answer instead of a stray
    // pending proposal that could never be accepted.
    const { data: target, error: targetError } = await supabase.from("fashion_requests").select("status").eq("id", requestId).maybeSingle();
    if (targetError) throw targetError;
    if (target && !isRequestOpenForProposals(target.status)) {
      return NextResponse.json({ status: "error", code: "request_closed", message: REQUEST_CLOSED_MESSAGE }, { status: 409 });
    }

    const insert: TablesInsert<"proposals"> = {
      request_id: requestId,
      designer_id: ctx.designerId,
      price,
      estimated_days: estimatedDays,
      description,
      notes: typeof body?.notes === "string" ? body.notes : null,
    };

    const { data, error } = await supabase.from("proposals").insert(insert).select().single();
    // The customer accepted another proposal between the check above and this insert: the database
    // (guard_proposal_insert_open_request, serialised with accept_proposal) refused it — same answer.
    if (error && error.code === "P0001" && error.message.startsWith("request_closed")) {
      return NextResponse.json({ status: "error", code: "request_closed", message: REQUEST_CLOSED_MESSAGE }, { status: 409 });
    }
    if (error) throw error;

    // Moves the request submitted -> proposal_received (a real status this project's own schema
    // already has, that nothing previously ever set — see this RPC's migration comment). A
    // failure here is logged, never fails the request: the proposal itself already saved
    // successfully, which is the part that actually matters to the designer.
    const { error: statusError } = await supabase.rpc("mark_request_proposal_received", { p_request_id: requestId });
    if (statusError) console.error("[designer.proposals.create] mark_request_proposal_received failed", statusError);

    return NextResponse.json({ status: "ok", proposal: mapProposal(data) });
  } catch (err) {
    return errorResponse(err, "api.designer.proposals.create");
  }
}
