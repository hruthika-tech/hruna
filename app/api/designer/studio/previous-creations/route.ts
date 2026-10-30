/**
 * Previous Creations CRUD (§30). The existing frontend only ever shows one image per creation —
 * previous_creation_images is still a proper child table underneath (per its own migration
 * comment: "add more than one photo is a UI change later, not a schema migration"), so this route
 * accepts a single `imageFileId` and stores it as position 0, matching today's UI exactly without
 * foreclosing a future multi-image UI.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planRoomResponse } from "@/lib/subscriptions/designer-plans";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { areFilesOwnedInBucket } from "@/lib/supabase/storage";
import { mapPreviousCreation, resolvePreviousCreationImages } from "@/lib/designer/data";
import type { TablesInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const imageFileId = typeof body?.imageFileId === "string" ? body.imageFileId : "";
    if (!imageFileId) {
      return NextResponse.json({ status: "error", message: "An image is required." }, { status: 400 });
    }

    const supabase = createClient();
    // Designer plan: previous creations count toward the plan's limit. The database trigger enforces the same limit atomically.
    const noRoom = await planRoomResponse("previous_creations", supabase);
    if (noRoom) return noRoom;
    // The image(s) must be the caller's own uploads in the public studio-images bucket — checked
    // before any write, so a rejected request changes nothing.
    if (!(await areFilesOwnedInBucket(supabase, [imageFileId], ctx.user.id, "studioImages"))) {
      return NextResponse.json({ status: "error", message: "That image couldn't be used. Please upload it again." }, { status: 400 });
    }
    const insert: TablesInsert<"previous_creations"> = {
      designer_id: ctx.designerId,
      description: typeof body?.description === "string" ? body.description : null,
      year: typeof body?.year === "string" ? body.year : null,
    };
    const { data: created, error } = await supabase.from("previous_creations").insert(insert).select().single();
    if (error) throw error;

    const { error: imageError } = await supabase
      .from("previous_creation_images")
      .insert({ previous_creation_id: created.id, file_id: imageFileId, position: 0 });
    if (imageError) throw imageError;

    const images = await resolvePreviousCreationImages(supabase, created.id);
    return NextResponse.json({ status: "ok", creation: mapPreviousCreation(created, images[0] ?? "") });
  } catch (err) {
    return errorResponse(err, "api.designer.studio.previousCreations.create");
  }
}
