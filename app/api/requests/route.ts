/**
 * Customer's own fashion requests — list + create. The customer_id on every row always comes
 * from the authenticated session's own customer profile (requireCustomer()), never a client-
 * supplied field, and fashion_requests_select's RLS policy independently guarantees a customer can
 * only ever read their own rows here regardless.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminOwnedDesigner, requireCustomer } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { areFilesOwnedInBucket } from "@/lib/supabase/storage";
import { mapRequest, resolveRequestImages } from "@/lib/customer/data";
import type { TablesInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireCustomer();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("fashion_requests")
      .select("*")
      .eq("customer_id", ctx.customerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const requests = await Promise.all(
      (data ?? []).map(async (row) => mapRequest(row, await resolveRequestImages(supabase, row.id)))
    );

    return NextResponse.json({ status: "ok", requests });
  } catch (err) {
    return errorResponse(err, "api.requests.list");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCustomer();
    const body = await request.json().catch(() => null);

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (!title || !category || !description) {
      return NextResponse.json(
        { status: "error", message: "Title, category, and description are required." },
        { status: 400 }
      );
    }
    if (typeof body?.preferredDesignerId === "string" && (await isAdminOwnedDesigner(body.preferredDesignerId))) {
      return NextResponse.json({ status: "error", message: "Designer not found." }, { status: 404 });
    }

    const imageFileIds: string[] = Array.isArray(body?.imageFileIds)
      ? [...new Set(body.imageFileIds.filter((id: unknown): id is string => typeof id === "string"))] as string[]
      : [];

    const supabase = createClient();
    // Every image must be the caller's own upload in request-images — checked BEFORE anything is
    // created, so one bad id rejects the whole request (no request, no image links). request_images'
    // RLS only checks the parent request, not the file, so this is the gate that stops a customer
    // linking (and thereby gaining read access to) someone else's private file. One generic message
    // for every failure — it never says whether a foreign file exists.
    if (!(await areFilesOwnedInBucket(supabase, imageFileIds, ctx.user.id, "requestImages"))) {
      return NextResponse.json(
        { status: "error", message: "One or more images couldn't be used. Please upload them again." },
        { status: 400 }
      );
    }

    const insert: TablesInsert<"fashion_requests"> = {
      customer_id: ctx.customerId,
      title,
      category,
      occasion: typeof body?.occasion === "string" ? body.occasion : null,
      gender: typeof body?.gender === "string" ? body.gender : null,
      size: typeof body?.size === "string" ? body.size : null,
      measurements: body?.measurements && typeof body.measurements === "object" ? body.measurements : {},
      description,
      fabric_preference: typeof body?.fabricPreference === "string" ? body.fabricPreference : null,
      budget_min: typeof body?.budgetMin === "number" ? body.budgetMin : null,
      budget_max: typeof body?.budgetMax === "number" ? body.budgetMax : null,
      location: typeof body?.location === "string" ? body.location : null,
      due_date: typeof body?.dueDate === "string" && body.dueDate ? body.dueDate : null,
      additional_preferences: typeof body?.additionalPreferences === "string" ? body.additionalPreferences : null,
      // preferred_designer_id determines public/private visibility (a generated column) — the
      // fashion_requests_preferred_designer_approved trigger (20260829180007_...sql) independently
      // rejects this if the id doesn't belong to a currently-approved designer, so an attempt to
      // direct a request at an unapproved designer fails at the database layer, not just here.
      preferred_designer_id: typeof body?.preferredDesignerId === "string" ? body.preferredDesignerId : null,
      // A single-step submission form, matching the existing frontend's one-shot "Submit Request"
      // action — there is no separate draft-then-submit step in the UI, so this is the request's
      // real initial status, not a skipped workflow state.
      status: "submitted",
    };

    const { data: created, error: insertError } = await supabase
      .from("fashion_requests")
      .insert(insert)
      .select()
      .single();
    if (insertError) throw insertError;

    if (imageFileIds.length > 0) {
      const rows = imageFileIds.map((file_id, position) => ({
        request_id: created.id,
        file_id,
        position,
      }));
      const { error: imagesError } = await supabase.from("request_images").insert(rows);
      if (imagesError) throw imagesError;
    }

    const images = await resolveRequestImages(supabase, created.id);
    return NextResponse.json({ status: "ok", request: mapRequest(created, images) });
  } catch (err) {
    return errorResponse(err, "api.requests.create");
  }
}
