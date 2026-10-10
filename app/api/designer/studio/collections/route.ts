/**
 * Collections CRUD (§28). No count limit — collections are an ordinary owner-scoped list. A new
 * collection requires a cover image: an upload the designer owns in studio-images (the url is
 * resolved from cover_image_file_id on read, never stored as data).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { isOwnStudioImage, mapCollection, resolveStudioImage } from "@/lib/designer/data";
import type { TablesInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ status: "error", message: "A collection name is required." }, { status: 400 });
    }
    const coverImageFileId = typeof body?.coverImageFileId === "string" ? body.coverImageFileId : "";
    if (!coverImageFileId) {
      return NextResponse.json({ status: "error", message: "Please upload a collection cover image." }, { status: 400 });
    }

    const supabase = createClient();
    if (!(await isOwnStudioImage(supabase, coverImageFileId, ctx.user.id))) {
      return NextResponse.json({ status: "error", message: "That cover image couldn't be used. Please upload it again." }, { status: 400 });
    }
    const insert: TablesInsert<"collections"> = {
      designer_id: ctx.designerId,
      name,
      category: typeof body?.category === "string" ? body.category : null,
      description: typeof body?.description === "string" ? body.description : null,
      cover_image_file_id: coverImageFileId,
    };
    const { data, error } = await supabase.from("collections").insert(insert).select().single();
    if (error) throw error;

    const cover = await resolveStudioImage(supabase, data.cover_image_file_id);
    return NextResponse.json({ status: "ok", collection: mapCollection(data, cover, []) });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.collections.create");
  }
}
