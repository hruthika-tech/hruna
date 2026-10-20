/**
 * Edit/delete a single progress update — designer-authored-content only (§22: "every update
 * should remain a historical record" — editing corrects THIS update's own text/images, it never
 * lets one update overwrite another, and deleting removes exactly one row). RLS
 * (project_updates_modify_author / project_updates_delete_author) independently requires
 * author_id = the caller's own designer id — this route derives that id from the session the same
 * way, never from the URL/body.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { mapProjectUpdate, resolveProjectUpdateImages } from "@/lib/customer/data";
import type { TablesUpdate } from "@/lib/supabase/types";
import { lockedProjectResponse } from "@/lib/projects/progress-lock-server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string; updateId: string } }) {
  try {
    const ctx = await requireApprovedDesigner();
    const body = await request.json().catch(() => null);

    const patch: TablesUpdate<"project_updates"> = {};
    if (typeof body?.stage === "string") patch.stage = body.stage as TablesUpdate<"project_updates">["stage"];
    if (typeof body?.note === "string") patch.note = body.note.trim();

    const supabase = createClient();
    // Customer-approved completion locks the progress history (the database enforces it too).
    const locked = await lockedProjectResponse(supabase, params.id);
    if (locked) return locked;

    const { data: updated, error } = await supabase
      .from("project_updates")
      .update(patch)
      .eq("id", params.updateId)
      .eq("project_id", params.id)
      .eq("author_id", ctx.designerId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      return NextResponse.json({ status: "error", message: "Update not found." }, { status: 404 });
    }

    if (Array.isArray(body?.imageFileIds)) {
      const imageFileIds: string[] = body.imageFileIds.filter((id: unknown): id is string => typeof id === "string");
      await supabase.from("project_update_images").delete().eq("update_id", params.updateId);
      if (imageFileIds.length > 0) {
        const rows = imageFileIds.map((file_id, position) => ({ update_id: params.updateId, file_id, position }));
        const { error: insertError } = await supabase.from("project_update_images").insert(rows);
        if (insertError) throw insertError;
      }
    }

    const images = await resolveProjectUpdateImages(supabase, params.updateId);
    return NextResponse.json({ status: "ok", update: mapProjectUpdate(updated, images) });
  } catch (err) {
    return errorResponse(err, "api.projects.updates.edit");
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string; updateId: string } }) {
  try {
    const ctx = await requireApprovedDesigner();
    const supabase = createClient();
    const locked = await lockedProjectResponse(supabase, params.id);
    if (locked) return locked;

    const { error, count } = await supabase
      .from("project_updates")
      .delete({ count: "exact" })
      .eq("id", params.updateId)
      .eq("project_id", params.id)
      .eq("author_id", ctx.designerId);
    if (error) throw error;
    if (!count) {
      return NextResponse.json({ status: "error", message: "Update not found." }, { status: 404 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.projects.updates.delete");
  }
}
