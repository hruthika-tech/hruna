/**
 * Admin → one User Report.
 *   GET   details, both accounts (with links to their existing admin pages / suspend actions), how
 *         many reports the account has, and ONLY the messages the reporter chose as evidence.
 *   PATCH { status, decision } → record the review (reviewed_by = this admin, from the session) and
 *         write it to admin_audit_log. It never suspends anyone — that stays a separate, deliberate
 *         action on the account's own admin page.
 * requireAdmin(), plus user_reports RLS (admin-only update) and the protect-original trigger.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { isUuid, statusLabel, validateReview } from "@/lib/moderation/reports";
import { accountSummaries } from "@/lib/admin/reports";
import { logAdminAction } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    if (!isUuid(params.id)) return NextResponse.json({ status: "error", message: "Report not found." }, { status: 404 });
    const supabase = createClient();
    const { data: report, error } = await supabase.from("user_reports").select("*").eq("id", params.id).maybeSingle();
    if (error) throw error;
    if (!report) return NextResponse.json({ status: "error", message: "Report not found." }, { status: 404 });

    const people = await accountSummaries(supabase, [report.reporter_id ?? "", report.reported_id, report.reviewed_by ?? ""]);
    const [{ data: evidence }, { count: reportsAgainst }] = await Promise.all([
      report.conversation_id && report.message_ids.length
        ? supabase.from("messages").select("id, sender_id, text, created_at").eq("conversation_id", report.conversation_id).in("id", report.message_ids).order("created_at")
        : Promise.resolve({ data: [] as { id: string; sender_id: string; text: string; created_at: string }[] }),
      supabase.from("user_reports").select("id", { count: "exact", head: true }).eq("reported_id", report.reported_id),
    ]);

    return NextResponse.json({
      status: "ok",
      report: {
        id: report.id,
        reason: report.reason,
        description: report.description,
        status: report.status,
        decision: report.admin_decision,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        reviewedAt: report.reviewed_at,
        reviewedBy: report.reviewed_by ? people.get(report.reviewed_by)?.name ?? null : null,
        reporter: report.reporter_id ? people.get(report.reporter_id) ?? null : null,
        reported: people.get(report.reported_id) ?? null,
        reportsAgainstAccount: reportsAgainst ?? 0,
        evidence: (evidence ?? []).map((m) => ({
          id: m.id,
          text: m.text,
          timestamp: m.created_at,
          from: m.sender_id === report.reported_id ? "reported" : m.sender_id === report.reporter_id ? "reporter" : "other",
        })),
      },
    });
  } catch (err) {
    return errorResponse(err, "api.admin.reports.detail");
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAdmin();
    if (!isUuid(params.id)) return NextResponse.json({ status: "error", message: "Report not found." }, { status: 404 });
    const review = validateReview(await request.json().catch(() => null));
    if (!review.ok) return NextResponse.json({ status: "error", message: review.message }, { status: 400 });

    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_reports")
      .update({ status: review.value.status, admin_decision: review.value.decision, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", params.id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ status: "error", message: "Report not found." }, { status: 404 });

    await logAdminAction(supabase, ctx.user.id, {
      subjectType: "platform",
      subjectId: data.id,
      action: `User report marked ${statusLabel(data.status).toLowerCase()}`,
      reason: review.value.decision,
    });
    return NextResponse.json({ status: "ok", report: { id: data.id, status: data.status } });
  } catch (err) {
    return errorResponse(err, "api.admin.reports.update");
  }
}
