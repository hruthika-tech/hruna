/**
 * The designer's PERSONAL details (§35/§36) — distinct from their Studio's business info
 * (app/api/designer/studio/route.ts). designer_profiles has no person-name/phone column of its
 * own (only studio_name, the business name) — the person's actual name is `public.users.
 * display_name`, the same shared identity field Phase 3 established and the customer profile page
 * already reads for the analogous purpose. Avatar uses the same "avatars" bucket + files pattern
 * as the customer avatar.
 *
 * rating/review_count/verification status are never accepted here — this route doesn't even parse
 * those fields out of the body, so there's no path by which a client-supplied value for them could
 * reach the database (on top of the DB triggers that would reject a direct attempt anyway).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireDesigner } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { getPublicFileUrl, deleteFileIfOwnedBy, areFilesOwnedInBucket } from "@/lib/supabase/storage";
import type { TablesUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function loadOwnProfile(supabase: ReturnType<typeof createClient>, userId: string, designerId: string) {
  const [{ data: user }, { data: designer }] = await Promise.all([
    supabase.from("users").select("display_name, email").eq("id", userId).single(),
    supabase.from("designer_profiles").select("avatar_file_id").eq("id", designerId).single(),
  ]);

  let avatar = "";
  if (designer?.avatar_file_id) {
    const { data: file } = await supabase.from("files").select("storage_path").eq("id", designer.avatar_file_id).maybeSingle();
    if (file) avatar = getPublicFileUrl(supabase, "avatars", file.storage_path);
  }

  return { displayName: user?.display_name ?? "", email: user?.email ?? "", avatar };
}

export async function GET() {
  try {
    const ctx = await requireDesigner();
    const supabase = createClient();
    const profile = await loadOwnProfile(supabase, ctx.user.id, ctx.designerId);
    return NextResponse.json({ status: "ok", profile });
  } catch (err) {
    return errorResponse(err, "api.designer.profile.get");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireDesigner();
    const body = await request.json().catch(() => null);
    const supabase = createClient();

    // A new avatar must be the caller's OWN upload in the avatars bucket — checked before anything
    // is written. Never someone else's file, nor a file from a private bucket (which would only ever
    // render as a broken image). One generic message; it never says whether a foreign file exists.
    if (typeof body?.avatarFileId === "string" && !(await areFilesOwnedInBucket(supabase, [body.avatarFileId], ctx.user.id, "avatars"))) {
      return NextResponse.json({ status: "error", message: "That photo couldn't be used. Please upload it again." }, { status: 400 });
    }

    if (typeof body?.displayName === "string" && body.displayName.trim()) {
      const { error } = await supabase.from("users").update({ display_name: body.displayName.trim() }).eq("id", ctx.user.id);
      if (error) throw error;
    }

    if (body && "avatarFileId" in body) {
      const newAvatarFileId = typeof body.avatarFileId === "string" ? body.avatarFileId : null;
      // Read the OLD avatar_file_id before it's overwritten, so a replaced/removed photo's
      // storage object + files row can be cleaned up afterward instead of orphaning forever
      // (Phase 7 storage gap-fill — see deleteFileIfOwnedBy's own comment).
      const { data: current } = await supabase.from("designer_profiles").select("avatar_file_id").eq("id", ctx.designerId).maybeSingle();
      const previousAvatarFileId = current?.avatar_file_id;

      const patch: TablesUpdate<"designer_profiles"> = { avatar_file_id: newAvatarFileId };
      const { error } = await supabase.from("designer_profiles").update(patch).eq("id", ctx.designerId);
      if (error) throw error;

      if (previousAvatarFileId && previousAvatarFileId !== newAvatarFileId) {
        await deleteFileIfOwnedBy(supabase, previousAvatarFileId, ctx.user.id);
      }
    }

    const profile = await loadOwnProfile(supabase, ctx.user.id, ctx.designerId);
    return NextResponse.json({ status: "ok", profile });
  } catch (err) {
    return errorResponse(err, "api.designer.profile.patch");
  }
}
