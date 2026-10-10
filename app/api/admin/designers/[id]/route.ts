/**
 * Full designer review bundle (§4) — profile, onboarding, verification, credentials, portfolio
 * items (with signed URLs, admin-privileged — see lib/admin/data.ts's
 * resolvePortfolioItemImageAsAdmin), and this designer's own admin_audit_log history.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import {
  mapVerification,
  mapOnboarding,
  mapPortfolioItem,
  mapCredential,
  resolvePortfolioItemImageAsAdmin,
  getDesignerEmailVerifiedAsAdmin,
  getDesignerSummaries,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const supabase = createClient();

    const [
      { data: onboarding },
      { data: verification },
      { data: credentials },
      { data: portfolioItems },
      { data: auditLog },
    ] = await Promise.all([
      supabase.from("designer_onboarding").select("*").eq("designer_id", params.id).maybeSingle(),
      supabase.from("designer_verifications").select("*").eq("designer_id", params.id).maybeSingle(),
      supabase.from("designer_credentials").select("*").eq("designer_id", params.id).order("created_at", { ascending: true }),
      supabase.from("designer_portfolio_items").select("*").eq("designer_id", params.id).order("created_at", { ascending: true }),
      supabase.from("admin_audit_log").select("*").eq("subject_type", "designer").eq("subject_id", params.id).order("created_at", { ascending: false }),
    ]);

    if (!onboarding || !verification) {
      return NextResponse.json({ status: "error", message: "Designer not found." }, { status: 404 });
    }

    const designers = await getDesignerSummaries(supabase, [params.id]);
    const designer = designers.get(params.id);
    if (!designer) {
      return NextResponse.json({ status: "error", message: "Designer not found." }, { status: 404 });
    }

    const [items, emailVerified] = await Promise.all([
      Promise.all(
        (portfolioItems ?? []).map(async (p) => mapPortfolioItem(p, await resolvePortfolioItemImageAsAdmin(supabase, p.file_id)))
      ),
      getDesignerEmailVerifiedAsAdmin(supabase, params.id),
    ]);

    // admin_id is a users.id — resolve display names for the audit log's "by <admin>" line.
    const adminIds = [...new Set((auditLog ?? []).map((a) => a.admin_id))];
    const { data: adminUsers } = adminIds.length
      ? await supabase.from("users").select("id, display_name, email").in("id", adminIds)
      : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
    const adminNameById = new Map((adminUsers ?? []).map((u) => [u.id, u.display_name || u.email || "Admin"]));

    return NextResponse.json({
      status: "ok",
      designer,
      onboarding: { ...mapOnboarding(onboarding, emailVerified), portfolioItems: items, credentials: (credentials ?? []).map(mapCredential) },
      verification: mapVerification(verification),
      auditLog: (auditLog ?? []).map((a) => ({
        id: a.id,
        action: a.action,
        reason: a.reason ?? undefined,
        adminName: adminNameById.get(a.admin_id) ?? "Admin",
        timestamp: a.created_at,
      })),
    });
  } catch (err) {
    return errorResponse(err, "api.admin.designers.detail");
  }
}
