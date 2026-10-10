/**
 * Optional designer profile creation — the backend foundation §7/§9 asks for. Creating this row
 * does NOT make the designer verified/approved: designer_verifications is auto-provisioned at
 * 'not_submitted' by the on_designer_profile_created trigger (supabase/migrations/20260829180013_rls.sql)
 * and only an admin can ever move it to 'approved' — verification stays a fully separate process,
 * never something this endpoint (or its caller) can grant itself.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotAdmin, requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import type { TablesInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const DESIGNER_TYPES = ["Designer", "Boutique", "Tailor"] as const;

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    // An admin account must never become a designer too (role separation — see assertNotAdmin).
    assertNotAdmin(ctx);
    const body = await request.json().catch(() => null);
    const studioName = typeof body?.studioName === "string" ? body.studioName.trim() : "";
    const type = DESIGNER_TYPES.includes(body?.type) ? body.type : "Designer";

    const supabase = createClient();
    // user_id always comes from the AUTHENTICATED session, never the request body — same
    // ownership rule RLS's designer_profiles_insert_self policy enforces independently.
    const insert: TablesInsert<"designer_profiles"> = {
      user_id: ctx.user.id,
      studio_name: studioName,
      type,
    };

    const { data, error } = await supabase
      .from("designer_profiles")
      .insert(insert)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ status: "ok", designerProfile: data });
  } catch (err) {
    return errorResponse(err, "api.profile.designer");
  }
}
