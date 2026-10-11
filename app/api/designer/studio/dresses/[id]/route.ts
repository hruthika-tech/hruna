import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { areFilesOwnedInBucket } from "@/lib/supabase/storage";
import { mapDress, resolveDressImages } from "@/lib/designer/data";
import type { TablesUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);

    const patch: TablesUpdate<"dresses"> = { updated_at: new Date().toISOString() };
    if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body?.description === "string") patch.description = body.description;
    if (typeof body?.price === "number") patch.price = body.price;
    if (typeof body?.available === "boolean") patch.available = body.available;
    if (typeof body?.fabric === "string") patch.fabric = body.fabric;

    const supabase = createClient();
    // The image(s) must be the caller's own uploads in the public studio-images bucket — checked
    // before any write, so a rejected request changes nothing.
    if (Array.isArray(body?.imageFileIds) && !(await areFilesOwnedInBucket(supabase, body.imageFileIds.filter((id: unknown): id is string => typeof id === "string"), ctx.user.id, "studioImages"))) {
      return NextResponse.json({ status: "error", message: "That image couldn't be used. Please upload it again." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("dresses")
      .update(patch)
      .eq("id", params.id)
      .eq("designer_id", ctx.designerId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ status: "error", message: "Dress not found." }, { status: 404 });

    if (Array.isArray(body?.imageFileIds)) {
      const imageFileIds: string[] = body.imageFileIds.filter((id: unknown): id is string => typeof id === "string");
      await supabase.from("dress_images").delete().eq("dress_id", params.id);
      if (imageFileIds.length > 0) {
        const rows = imageFileIds.map((file_id, position) => ({ dress_id: params.id, file_id, position }));
        const { error: insertError } = await supabase.from("dress_images").insert(rows);
        if (insertError) throw insertError;
      }
    }

    const images = await resolveDressImages(supabase, params.id);
    return NextResponse.json({ status: "ok", dress: mapDress(data, images) });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.dresses.update");
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();
    const { error, count } = await supabase
      .from("dresses")
      .delete({ count: "exact" })
      .eq("id", params.id)
      .eq("designer_id", ctx.designerId);
    if (error) throw error;
    if (!count) return NextResponse.json({ status: "error", message: "Dress not found." }, { status: 404 });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.dresses.delete");
  }
}
