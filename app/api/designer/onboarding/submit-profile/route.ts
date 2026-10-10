/**
 * The final "Submit for Verification" action. Only ever results in 'pending' — never 'approved'
 * (only an admin, Phase 6, can approve). Readiness check mirrors the existing mock's own rule
 * exactly. Also connects the studio-identity fields the designer just entered into the SAME
 * designer_profiles row Manage Studio already edits (no duplicate studio object) — matching the
 * existing mock's submitProfileForVerification behavior precisely.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { emailConfirmed } from "@/lib/designer/data";
import type { TablesUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();

    // Account-level email verification (Supabase Auth's signup confirmation link) — the same
    // requirement as customer signup, and separate from the identity/portfolio/admin review below.
    if (!emailConfirmed(ctx.user)) {
      return NextResponse.json(
        { status: "error", message: "Please verify your email address using the link we sent you before submitting." },
        { status: 403 }
      );
    }

    const [{ data: onboarding }, { count: itemCount }, { data: verification }] = await Promise.all([
      supabase.from("designer_onboarding").select("*").eq("designer_id", ctx.designerId).single(),
      supabase.from("designer_portfolio_items").select("id", { count: "exact", head: true }).eq("designer_id", ctx.designerId),
      supabase.from("designer_verifications").select("identity_status").eq("designer_id", ctx.designerId).single(),
    ]);

    const ready =
      !!onboarding &&
      onboarding.roles.length > 0 &&
      (itemCount ?? 0) >= 3 &&
      onboarding.portfolio_ownership_accepted &&
      (onboarding.studio_name ?? "").trim().length > 0 &&
      verification?.identity_status !== "not_started";

    if (!ready) {
      return NextResponse.json(
        { status: "error", message: "Complete your professional profile, portfolio, and studio sections before submitting." },
        { status: 400 }
      );
    }

    // designer_verifications is admin-write-only by RLS — a plain .update() here was silently
    // blocked (0 rows affected, no thrown error), which is exactly how this previously shipped
    // broken: this route returned a false "ok" while never actually submitting anyone for review.
    // submit_designer_profile_for_verification() (see its own migration comment) re-verifies this
    // same readiness rule server-side before writing.
    const { error: verificationError } = await supabase.rpc("submit_designer_profile_for_verification");
    if (verificationError) throw verificationError;

    const studioPatch: TablesUpdate<"designer_profiles"> = {};
    if (onboarding!.studio_name) studioPatch.studio_name = onboarding!.studio_name;
    if (onboarding!.city) studioPatch.city = onboarding!.city;
    if (onboarding!.area) studioPatch.atelier_location = onboarding!.area;
    if (onboarding!.about_studio) studioPatch.story = onboarding!.about_studio;
    if (onboarding!.experience_description) studioPatch.bio = onboarding!.experience_description;
    if (Object.keys(studioPatch).length > 0) {
      const { error: profileError } = await supabase.from("designer_profiles").update(studioPatch).eq("id", ctx.designerId);
      if (profileError) throw profileError;
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.designer.onboarding.submitProfile");
  }
}
