import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { areFilesOwnedInBucket } from "@/lib/supabase/storage";
import { mapPreviousCreation, resolvePreviousCreationImages } from "@/lib/designer/data";
import type { TablesUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);

    const patch: TablesUpdate<"previous_creations"> = { updated_at: new Date().toISOString() };
    if (typeof body?.description === "string") patch.description = body.description;
    if (typeof body?.year === "string") patch.year = body.year;

    const supabase = createClient();
    // The image(s) must be the caller's own uploads in the public studio-images bucket — checked
    // before any write, so a rejected request changes nothing.
    if (typeof body?.imageFileId === "string" && !(await areFilesOwnedInBucket(supabase, [body.imageFileId], ctx.user.id, "studioImages"))) {
      return NextResponse.json({ status: "error", message: "That image couldn't be used. Please upload it again." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("previous_creations")
      .update(patch)
      .eq("id", params.id)
      .eq("designer_id", ctx.designerId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ status: "error", message: "Creation not found." }, { status: 404 });

    if (typeof body?.imageFileId === "string") {
      await supabase.from("previous_creation_images").delete().eq("previous_creation_id", params.id);
      const { error: imageError } = await supabase
        .from("previous_creation_images")
        .insert({ previous_creation_id: params.id, file_id: body.imageFileId, position: 0 });
      if (imageError) throw imageError;
    }

    const images = await resolvePreviousCreationImages(supabase, params.id);
    return NextResponse.json({ status: "ok", creation: mapPreviousCreation(data, images[0] ?? "") });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.previousCreations.update");
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();
    const { error, count } = await supabase
      .from("previous_creations")
      .delete({ count: "exact" })
      .eq("id", params.id)
      .eq("designer_id", ctx.designerId);
    if (error) throw error;
    if (!count) return NextResponse.json({ status: "error", message: "Creation not found." }, { status: 404 });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.previousCreations.delete");
  }
}
