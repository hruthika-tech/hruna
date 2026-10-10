/**
 * Designer onboarding draft (§3). designer_onboarding/designer_portfolio_items/
 * designer_credentials/designer_verifications are the existing Phase 1 tables this whole flow
 * writes to — no new table. designer_onboarding + designer_verifications are auto-provisioned
 * ('not_submitted' / blank) the moment a designer_profiles row is created
 * (on_designer_profile_created trigger, supabase/migrations/20260829180013_rls.sql), so this
 * route assumes that row already exists — the frontend calls POST /api/profile/designer (Phase 3)
 * first if it doesn't. Saving draft fields here never touches designer_verifications — completing
 * onboarding does NOT approve the designer (§3); only the submit-* actions below move verification
 * state forward, and only ever to a non-approved state.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { emailConfirmed, mapOnboarding, mapPortfolioItem, mapCredential, mapVerification, resolvePortfolioItemImage } from "@/lib/designer/data";
import type { TablesUpdate } from "@/lib/supabase/types";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function loadBundle(supabase: ReturnType<typeof createClient>, designerId: string, user: User) {
  const [{ data: onboarding }, { data: portfolioItems }, { data: credentials }, { data: verification }] = await Promise.all([
    supabase.from("designer_onboarding").select("*").eq("designer_id", designerId).single(),
    supabase.from("designer_portfolio_items").select("*").eq("designer_id", designerId).order("created_at", { ascending: true }),
    supabase.from("designer_credentials").select("*").eq("designer_id", designerId).order("created_at", { ascending: true }),
    supabase.from("designer_verifications").select("*").eq("designer_id", designerId).single(),
  ]);

  const items = await Promise.all(
    (portfolioItems ?? []).map(async (p) => mapPortfolioItem(p, await resolvePortfolioItemImage(supabase, p.file_id)))
  );

  return {
    onboarding: onboarding ? { ...mapOnboarding(onboarding, emailConfirmed(user)), portfolioItems: items, credentials: (credentials ?? []).map(mapCredential) } : null,
    verification: verification ? mapVerification(verification) : null,
  };
}

export async function GET() {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();
    const bundle = await loadBundle(supabase, ctx.designerId, ctx.user);
    return NextResponse.json({ status: "ok", ...bundle });
  } catch (err) {
    return errorResponse(err, "api.designer.onboarding.get");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const supabase = createClient();

    const patch: TablesUpdate<"designer_onboarding"> = { updated_at: new Date().toISOString() };
    const stringFields: (keyof TablesUpdate<"designer_onboarding">)[] = [
      "phone", "experience_level", "learning_background", "experience_description",
      "date_of_birth", "studio_name", "city", "area", "address", "about_studio",
      "instagram_url", "website_url", "working_model", "other_role_description",
    ];
    const bodyKeyByColumn: Record<string, string> = {
      phone: "phone", experience_level: "experienceLevel", learning_background: "learningBackground",
      experience_description: "experienceDescription", date_of_birth: "dateOfBirth", studio_name: "studioName",
      city: "city", area: "area", address: "address", about_studio: "aboutStudio",
      instagram_url: "instagramUrl", website_url: "websiteUrl", working_model: "workingModel",
      other_role_description: "otherRoleDescription",
    };
    for (const column of stringFields) {
      const bodyKey = bodyKeyByColumn[column as string];
      if (typeof body?.[bodyKey] === "string") (patch as Record<string, unknown>)[column as string] = body[bodyKey];
    }
    if (Array.isArray(body?.roles)) patch.roles = body.roles;
    if (Array.isArray(body?.specializationCategories)) patch.specialization_categories = body.specializationCategories;
    if (Array.isArray(body?.specializationCrafts)) patch.specialization_crafts = body.specializationCrafts;
    if (Array.isArray(body?.serviceLocations)) patch.service_locations = body.serviceLocations;
    if (typeof body?.portfolioOwnershipAccepted === "boolean") patch.portfolio_ownership_accepted = body.portfolioOwnershipAccepted;
    // No phoneVerified/emailVerified input is accepted: phone is an optional, unverified contact
    // detail in V1 (no SMS verification), and email status comes only from Supabase Auth.

    const { error } = await supabase.from("designer_onboarding").update(patch).eq("designer_id", ctx.designerId);
    if (error) throw error;

    const bundle = await loadBundle(supabase, ctx.designerId, ctx.user);
    return NextResponse.json({ status: "ok", ...bundle });
  } catch (err) {
    return errorResponse(err, "api.designer.onboarding.patch");
  }
}
