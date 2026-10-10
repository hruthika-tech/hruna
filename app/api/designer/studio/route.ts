/**
 * Studio-level business info + banner (§25, the "Studio Info" tab + "Edit Banner" on Manage
 * Studio) — distinct from the designer's personal profile (app/api/designer/profile/route.ts).
 * GET returns the same public bundle as app/api/studio/[id]/route.ts, using the caller's own id —
 * one bundle shape, reused by both the public page and this owner's management page. PATCH is
 * scoped to the caller's own designer_profiles row; never accepts rating/review_count/type or any
 * admin/derived field.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { getStudioBundle } from "@/lib/designer/studio-bundle";
import { isOwnStudioImage } from "@/lib/designer/data";
import type { TablesUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();
    const bundle = await getStudioBundle(supabase, ctx.designerId);
    if (!bundle) {
      return NextResponse.json({ status: "error", message: "Studio not found." }, { status: 404 });
    }
    return NextResponse.json({ status: "ok", ...bundle });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.get");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);

    const patch: TablesUpdate<"designer_profiles"> = {};
    if (typeof body?.studioName === "string" && body.studioName.trim()) patch.studio_name = body.studioName.trim();
    if (typeof body?.bio === "string") patch.bio = body.bio;
    if (typeof body?.story === "string") {
      // "About the Studio" — shown on the public Studio page; can be edited but not blanked out.
      if (!body.story.trim()) {
        return NextResponse.json({ status: "error", message: "About Studio can't be empty." }, { status: 400 });
      }
      patch.story = body.story.trim();
    }
    if (typeof body?.contactEmail === "string") patch.contact_email = body.contactEmail;
    if (typeof body?.openingHours === "string") patch.opening_hours = body.openingHours;
    if (typeof body?.atelierLocation === "string") patch.atelier_location = body.atelierLocation;
    if (typeof body?.instagramUrl === "string") patch.instagram_url = body.instagramUrl;
    if (typeof body?.websiteUrl === "string") patch.website_url = body.websiteUrl;
    if (typeof body?.city === "string") patch.city = body.city;
    if (typeof body?.country === "string") patch.country = body.country;
    if (body && "experienceYears" in body) {
      // designer_profiles.experience_years is an int with a >= 0 check — reject anything else here
      // with a clear message instead of letting the database turn it into a 500.
      if (!Number.isSafeInteger(body.experienceYears) || body.experienceYears < 0) {
        return NextResponse.json({ status: "error", message: "Years of experience must be a whole number (0 or more)." }, { status: 400 });
      }
      patch.experience_years = body.experienceYears;
    }
    if (typeof body?.startingPrice === "number") patch.starting_price = body.startingPrice;
    if (Array.isArray(body?.specializations)) patch.specializations = body.specializations;
    if (body && "bannerFileId" in body) {
      patch.banner_file_id = typeof body.bannerFileId === "string" ? body.bannerFileId : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ status: "error", message: "Nothing to update." }, { status: 400 });
    }

    const supabase = createClient();
    if (patch.banner_file_id && !(await isOwnStudioImage(supabase, patch.banner_file_id, ctx.user.id))) {
      return NextResponse.json({ status: "error", message: "That banner image couldn't be used. Please upload it again." }, { status: 400 });
    }
    // .select() so a write RLS silently filtered out (0 rows, no error) surfaces as a failure
    // instead of a false "saved" — the client then keeps showing the previous saved banner/text.
    const { data: updated, error } = await supabase.from("designer_profiles").update(patch).eq("id", ctx.designerId).select("id");
    if (error) throw error;
    if (!updated?.length) {
      return NextResponse.json({ status: "error", message: "Your changes couldn't be saved. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.patch");
  }
}
