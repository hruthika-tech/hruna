/**
 * Studio Highlights CRUD (§26). Max 3 per designer, enforced here at the application layer —
 * matching both the existing frontend's own limit and studio_highlights' own table comment
 * ("Max 3 per designer — enforced at the application layer, not the DB"). Position is assigned as
 * the next free slot (never reused), so the unique(designer_id, position) constraint is always
 * satisfied without needing to renumber existing rows on delete.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { areFilesOwnedInBucket } from "@/lib/supabase/storage";
import { mapHighlight, resolveStudioImage } from "@/lib/designer/data";
import type { TablesInsert } from "@/lib/supabase/types";

const MAX_HIGHLIGHTS = 3;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";
    const caption = typeof body?.caption === "string" ? body.caption : "";
    if (!fileId) {
      return NextResponse.json({ status: "error", message: "An image is required." }, { status: 400 });
    }

    const supabase = createClient();
    // The image(s) must be the caller's own uploads in the public studio-images bucket — checked
    // before any write, so a rejected request changes nothing.
    if (!(await areFilesOwnedInBucket(supabase, [fileId], ctx.user.id, "studioImages"))) {
      return NextResponse.json({ status: "error", message: "That image couldn't be used. Please upload it again." }, { status: 400 });
    }
    const { data: existing, error: countError } = await supabase
      .from("studio_highlights")
      .select("position")
      .eq("designer_id", ctx.designerId)
      .order("position", { ascending: false })
      .limit(1);
    if (countError) throw countError;

    const { count } = await supabase
      .from("studio_highlights")
      .select("id", { count: "exact", head: true })
      .eq("designer_id", ctx.designerId);
    if ((count ?? 0) >= MAX_HIGHLIGHTS) {
      return NextResponse.json(
        { status: "error", message: `You can only have up to ${MAX_HIGHLIGHTS} highlights.` },
        { status: 400 }
      );
    }

    const nextPosition = existing.length > 0 ? existing[0].position + 1 : 0;
    const insert: TablesInsert<"studio_highlights"> = {
      designer_id: ctx.designerId,
      file_id: fileId,
      caption,
      position: nextPosition,
    };
    const { data, error } = await supabase.from("studio_highlights").insert(insert).select().single();
    if (error) throw error;

    const image = await resolveStudioImage(supabase, data.file_id);
    return NextResponse.json({ status: "ok", highlight: mapHighlight(data, image) });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.highlights.create");
  }
}
