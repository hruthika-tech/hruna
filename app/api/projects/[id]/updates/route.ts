/**
 * Project/dress progress updates. GET is shared by both sides (project_updates_select RLS scopes
 * it to actual project participants/admin — customer or designer, this route doesn't distinguish).
 * POST is the Phase 5 designer write side (§21) — Phase 4 deliberately left this to "the designer
 * will later be responsible for creating these updates." `author_id` always comes from
 * requireApprovedDesigner()'s session, never the client, and project_updates_insert_designer RLS
 * independently requires the designer to actually be this project's own designer.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireApprovedDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { mapProjectUpdate, resolveProjectUpdateImages } from "@/lib/customer/data";
import type { TablesInsert } from "@/lib/supabase/types";
import { lockedProjectResponse } from "@/lib/projects/progress-lock-server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("project_updates")
      .select("*")
      .eq("project_id", params.id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const updates = await Promise.all(
      (data ?? []).map(async (row) => mapProjectUpdate(row, await resolveProjectUpdateImages(supabase, row.id)))
    );

    return NextResponse.json({ status: "ok", updates });
  } catch (err) {
    return errorResponse(err, "api.projects.updates.list");
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireApprovedDesigner();
    const body = await request.json().catch(() => null);

    const stage = typeof body?.stage === "string" ? body.stage : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const imageFileIds: string[] = Array.isArray(body?.imageFileIds)
      ? body.imageFileIds.filter((id: unknown): id is string => typeof id === "string")
      : [];
    if (!stage || !note) {
      return NextResponse.json({ status: "error", message: "A stage and a note are required." }, { status: 400 });
    }

    const supabase = createClient();
    // Customer-approved completion locks the progress history (the database enforces it too).
    const locked = await lockedProjectResponse(supabase, params.id);
    if (locked) return locked;

    const insert: TablesInsert<"project_updates"> = {
      project_id: params.id,
      stage: stage as TablesInsert<"project_updates">["stage"],
      note,
      author_id: ctx.designerId,
    };
    const { data: created, error: insertError } = await supabase.from("project_updates").insert(insert).select().single();
    if (insertError) throw insertError;

    if (imageFileIds.length > 0) {
      const rows = imageFileIds.map((file_id, position) => ({ update_id: created.id, file_id, position }));
      const { error: imagesError } = await supabase.from("project_update_images").insert(rows);
      if (imagesError) throw imagesError;
    }

    // Advancing a project's stage/progress via a new update is the same rule the existing mock
    // frontend already applies (lib/store.ts's addProjectUpdate): the update's stage becomes the
    // project's current stage, and progress is that stage's position in the project's own
    // ordered `stages` array — read fresh from the project, never a second hardcoded stage list.
    const { data: project } = await supabase.from("projects").select("stages").eq("id", params.id).single();
    if (project) {
      const stageIndex = project.stages.indexOf(insert.stage);
      if (stageIndex >= 0) {
        const progressPercent = Math.round(((stageIndex + 1) / project.stages.length) * 100);
        await supabase.from("projects").update({ stage: insert.stage, progress_percent: progressPercent }).eq("id", params.id);
      }
    }

    const images = await resolveProjectUpdateImages(supabase, created.id);
    return NextResponse.json({ status: "ok", update: mapProjectUpdate(created, images) });
  } catch (err) {
    return errorResponse(err, "api.projects.updates.create");
  }
}
