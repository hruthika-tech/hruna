/**
 * Request a mutual withdrawal of a project (customer or the assigned designer). The decision is made
 * by the OTHER participant via ./[withdrawalId]. All rules — participant only, non-empty reason, one
 * pending request at a time, completed/withdrawn projects ineligible — are enforced by
 * public.request_project_withdrawal() (migration 20261023000002), which locks the project row; this
 * route only validates the reason early and turns the function's refusals into clear responses.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse, isPostgrestError } from "@/lib/supabase/errors";
import { mapWithdrawal, validateWithdrawalReason } from "@/lib/projects/withdrawal";
import { isMissingSchemaObject } from "@/lib/supabase/schema-readiness";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const body = await request.json().catch(() => null);
    const reason = validateWithdrawalReason(body?.reason);
    if (!reason.ok) return NextResponse.json({ status: "error", message: reason.message }, { status: 400 });

    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_project_withdrawal", { p_project_id: params.id, p_reason: reason.value });
    if (error) {
      if (isMissingSchemaObject(error)) {
        return NextResponse.json(
          { status: "error", code: "withdrawals_not_ready", message: "Withdrawing from a project isn't available yet. Please try again later." },
          { status: 503 }
        );
      }
      // Two requests at the same instant: the one-pending-per-project unique index refused the second.
      if (isPostgrestError(error) && error.code === "23505") {
        return NextResponse.json({ status: "error", message: "A withdrawal request is already waiting for a response on this project." }, { status: 409 });
      }
      if (isPostgrestError(error) && error.code === "P0001") {
        const status = /not found/i.test(error.message) ? 404 : /only this project/i.test(error.message) ? 403 : 409;
        return NextResponse.json({ status: "error", message: error.message }, { status });
      }
      throw error;
    }
    return NextResponse.json({ status: "ok", withdrawal: mapWithdrawal(data) });
  } catch (err) {
    return errorResponse(err, "api.projects.withdrawals.request");
  }
}
