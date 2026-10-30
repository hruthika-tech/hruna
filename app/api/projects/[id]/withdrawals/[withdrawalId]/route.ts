/**
 * Approve or reject a pending withdrawal — only the OTHER participant (never the requester).
 * Approval makes the project 'withdrawn' (both parties have now agreed) and closes its request;
 * rejection records the decision (and optional reason) and leaves the project as it was. Enforced,
 * row-locked, by public.respond_project_withdrawal() (migration 20261023000002), so simultaneous
 * answers can't both succeed.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse, isPostgrestError } from "@/lib/supabase/errors";
import { mapWithdrawal, validateResponseReason } from "@/lib/projects/withdrawal";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string; withdrawalId: string } }) {
  try {
    await requireUser();
    const body = await request.json().catch(() => null);
    const decision = body?.decision;
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ status: "error", message: "Choose to approve or reject the withdrawal." }, { status: 400 });
    }
    const reason = validateResponseReason(body?.reason);
    if (!reason.ok) return NextResponse.json({ status: "error", message: reason.message }, { status: 400 });

    const supabase = createClient();
    // Belongs to this project? (RLS-scoped read; the function re-checks everything under lock.)
    const { data: row } = await supabase.from("project_withdrawals").select("project_id").eq("id", params.withdrawalId).maybeSingle();
    if (!row || row.project_id !== params.id) {
      return NextResponse.json({ status: "error", message: "Withdrawal request not found." }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("respond_project_withdrawal", {
      p_withdrawal_id: params.withdrawalId,
      p_approve: decision === "approve",
      p_reason: reason.value ?? undefined,
    });
    if (error) {
      if (isPostgrestError(error) && error.code === "P0001") {
        const status = /not found/i.test(error.message) ? 404 : /only this project|your own/i.test(error.message) ? 403 : 409;
        return NextResponse.json({ status: "error", message: error.message }, { status });
      }
      throw error;
    }
    return NextResponse.json({ status: "ok", withdrawal: mapWithdrawal(data) });
  } catch (err) {
    return errorResponse(err, "api.projects.withdrawals.respond");
  }
}
