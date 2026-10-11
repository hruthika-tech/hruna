/**
 * Meet the Designer entries CRUD (§27). Max 2 per designer, application-layer limit — same
 * reasoning/pattern as app/api/designer/studio/highlights/route.ts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { areFilesOwnedInBucket } from "@/lib/supabase/storage";
import { mapMeetEntry, resolveStudioImage } from "@/lib/designer/data";
import type { TablesInsert } from "@/lib/supabase/types";

const MAX_MEET_ENTRIES = 2;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";
    const description = typeof body?.description === "string" ? body.description : "";
    if (!fileId) {
      return NextResponse.json({ status: "error", message: "An image is required." }, { status: 400 });
    }

    const supabase = createClient();
    // The image(s) must be the caller's own uploads in the public studio-images bucket — checked
    // before any write, so a rejected request changes nothing.
    if (!(await areFilesOwnedInBucket(supabase, [fileId], ctx.user.id, "studioImages"))) {
      return NextResponse.json({ status: "error", message: "That image couldn't be used. Please upload it again." }, { status: 400 });
    }
    const { count } = await supabase
      .from("meet_the_designer_entries")
      .select("id", { count: "exact", head: true })
      .eq("designer_id", ctx.designerId);
    if ((count ?? 0) >= MAX_MEET_ENTRIES) {
      return NextResponse.json(
        { status: "error", message: `You can only have up to ${MAX_MEET_ENTRIES} entries.` },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("meet_the_designer_entries")
      .select("position")
      .eq("designer_id", ctx.designerId)
      .order("position", { ascending: false })
      .limit(1);
    if (existingError) throw existingError;

    const insert: TablesInsert<"meet_the_designer_entries"> = {
      designer_id: ctx.designerId,
      file_id: fileId,
      description,
      position: existing.length > 0 ? existing[0].position + 1 : 0,
    };
    const { data, error } = await supabase.from("meet_the_designer_entries").insert(insert).select().single();
    if (error) throw error;

    const image = await resolveStudioImage(supabase, data.file_id);
    return NextResponse.json({ status: "ok", entry: mapMeetEntry(data, image) });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.meetEntries.create");
  }
}
