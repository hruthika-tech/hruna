/**
 * Dresses CRUD (§29). A dress belongs to one of the caller's own collections — verified explicitly
 * (not just left to the FK), so a designer can't attach a new dress to another designer's
 * collection id even though dresses.designer_id itself is always their own.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { areFilesOwnedInBucket } from "@/lib/supabase/storage";
import { mapDress, resolveDressImages } from "@/lib/designer/data";
import type { TablesInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const collectionId = typeof body?.collectionId === "string" ? body.collectionId : "";
    if (!name || !collectionId) {
      return NextResponse.json({ status: "error", message: "A name and a collection are required." }, { status: 400 });
    }
    const imageFileIds: string[] = Array.isArray(body?.imageFileIds)
      ? body.imageFileIds.filter((id: unknown): id is string => typeof id === "string")
      : [];

    const supabase = createClient();
    // The image(s) must be the caller's own uploads in the public studio-images bucket — checked
    // before any write, so a rejected request changes nothing.
    if (!(await areFilesOwnedInBucket(supabase, imageFileIds, ctx.user.id, "studioImages"))) {
      return NextResponse.json({ status: "error", message: "That image couldn't be used. Please upload it again." }, { status: 400 });
    }
    const { data: collection } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("designer_id", ctx.designerId)
      .maybeSingle();
    if (!collection) {
      return NextResponse.json({ status: "error", message: "That collection doesn't belong to you." }, { status: 403 });
    }

    const insert: TablesInsert<"dresses"> = {
      designer_id: ctx.designerId,
      collection_id: collectionId,
      name,
      description: typeof body?.description === "string" ? body.description : null,
      price: typeof body?.price === "number" ? body.price : 0,
      available: typeof body?.available === "boolean" ? body.available : true,
      fabric: typeof body?.fabric === "string" ? body.fabric : null,
    };
    const { data: created, error } = await supabase.from("dresses").insert(insert).select().single();
    if (error) throw error;

    if (imageFileIds.length > 0) {
      const rows = imageFileIds.map((file_id, position) => ({ dress_id: created.id, file_id, position }));
      const { error: imagesError } = await supabase.from("dress_images").insert(rows);
      if (imagesError) throw imagesError;
    }

    const images = await resolveDressImages(supabase, created.id);
    return NextResponse.json({ status: "ok", dress: mapDress(created, images) });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.dresses.create");
  }
}
