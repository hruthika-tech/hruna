/**
 * Admin → User Reports list. requireAdmin(), and user_reports RLS independently limits reading every
 * report to is_admin(). ?status=pending|under_review|resolved|dismissed filters; default: all.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { isReportStatus } from "@/lib/moderation/reports";
import { isModerationUnavailable } from "@/lib/moderation/server";
import { accountSummaries } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status");
    if (status && !isReportStatus(status)) return NextResponse.json({ status: "error", message: "Unknown status filter." }, { status: 400 });
    const supabase = createClient();
    let query = supabase.from("user_reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (isReportStatus(status)) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      if (isModerationUnavailable(error)) return NextResponse.json({ status: "ok", available: false, reports: [] });
      throw error;
    }
    const people = await accountSummaries(supabase, (data ?? []).flatMap((r) => [r.reporter_id ?? "", r.reported_id]));
    return NextResponse.json({
      status: "ok",
      available: true,
      reports: (data ?? []).map((r) => ({
        id: r.id,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        evidenceCount: r.message_ids.length,
        reporter: r.reporter_id ? people.get(r.reporter_id) ?? null : null,
        reported: people.get(r.reported_id) ?? null,
      })),
    });
  } catch (err) {
    return errorResponse(err, "api.admin.reports.list");
  }
}
