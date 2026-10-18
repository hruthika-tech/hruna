/**
 * Customer profile — optional creation (Phase 3), now joined by real GET/PATCH (Phase 4) so the
 * existing Profile/Settings page can read and edit real data. Every operation resolves the
 * customer from the AUTHENTICATED session (never a client-supplied id) and goes through the
 * authenticated server client, so customer_profiles' own RLS policies
 * (supabase/migrations/20260829180013_rls.sql) are the actual gate: a customer can only ever see
 * or touch their own row here — this route doesn't re-decide that, it just can't succeed against
 * someone else's row even if it tried.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotAdmin, requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { getPublicFileUrl, deleteFileIfOwnedBy, areFilesOwnedInBucket } from "@/lib/supabase/storage";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Settings > Notifications preferences — stored in customer_profiles.notification_preferences
// (supabase/migrations/20260910000001_customer_notification_preferences.sql), a single additive
// jsonb column, not a new table and not a duplicate of the unrelated /notifications activity feed.
export interface NotificationPreferences {
  proposals: boolean;
  messages: boolean;
  projectUpdates: boolean;
  marketing: boolean;
}
const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  proposals: true,
  messages: true,
  projectUpdates: true,
  marketing: false,
};
const NOTIFICATION_PREFERENCE_KEYS = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as (keyof NotificationPreferences)[];

async function loadOwnProfile(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("*, files:files!customer_profiles_avatar_file_id_fkey(storage_path)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const avatarPath = (data as unknown as { files: { storage_path: string } | null }).files?.storage_path;
  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    city: data.city ?? "",
    phone: data.phone ?? "",
    status: data.status,
    avatar: avatarPath ? getPublicFileUrl(supabase, "avatars", avatarPath) : "",
    notificationPreferences: {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...((data as { notification_preferences?: Partial<NotificationPreferences> | null }).notification_preferences ?? {}),
    },
  };
}

export async function GET() {
  try {
    const ctx = await requireUser();
    assertNotAdmin(ctx);
    const supabase = createClient();
    const profile = await loadOwnProfile(supabase, ctx.user.id);
    return NextResponse.json({ status: "ok", customerProfile: profile });
  } catch (err) {
    return errorResponse(err, "api.profile.customer.get");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    assertNotAdmin(ctx);
    const body = await request.json().catch(() => null);
    const supabase = createClient();

    // The name is never asked for twice. If the caller doesn't send one:
    //   - an EXISTING profile keeps its current name (so this never overwrites a profile someone
    //     already set up — calling it again just returns/updates their own row);
    //   - a NEW profile uses the name given at registration (auth user_metadata.full_name, set by
    //     app/api/auth/signup/route.ts), linked to this signed-in user's id.
    // Only when neither exists is the name genuinely missing.
    let name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      const { data: existing } = await supabase.from("customer_profiles").select("name").eq("user_id", ctx.user.id).maybeSingle();
      const registrationName = typeof ctx.user.user_metadata?.full_name === "string" ? ctx.user.user_metadata.full_name.trim() : "";
      name = existing?.name ?? registrationName;
    }
    if (!name) {
      return NextResponse.json(
        { status: "error", message: "Enter your name to set up a customer profile." },
        { status: 400 }
      );
    }

    const values: TablesInsert<"customer_profiles"> = {
      user_id: ctx.user.id,
      name,
    };
    // Only set fields the caller actually sent — on the upsert's conflict-update path (see below)
    // an included key overwrites the existing value, so an omitted one must stay omitted rather
    // than defaulting to null, or a partial re-submission (e.g. onboarding's Finish, which never
    // sends `phone`) would silently wipe a field set elsewhere (e.g. via the Profile page).
    if (typeof body?.city === "string") values.city = body.city;
    if (typeof body?.phone === "string") values.phone = body.phone;
    // Optional — lets the onboarding wizard create the profile with its already-uploaded avatar
    // in one call, instead of a POST immediately followed by a PATCH for the same row.
    if (body && "avatarFileId" in body && typeof body.avatarFileId === "string") {
      if (!(await areFilesOwnedInBucket(supabase, [body.avatarFileId], ctx.user.id, "avatars"))) {
        return NextResponse.json({ status: "error", message: "That photo couldn't be used. Please upload it again." }, { status: 400 });
      }
      values.avatar_file_id = body.avatarFileId;
    }

    // Upsert on user_id (UNIQUE — one customer profile per identity), not a blind insert: makes
    // "finish onboarding" idempotent. A customer who already has a profile — from a previously
    // completed onboarding, a retried submission after a dropped response, or simply revisiting
    // /onboarding — previously hit a 23505 unique-violation ("That already exists.") that
    // permanently blocked "Finish & Explore LILIRVE" from ever succeeding again for them, with the
    // loading state resetting and no way to reach /home. Still fully RLS-scoped either way: the
    // insert branch is gated by customer_profiles_insert_self (user_id = auth.uid()), the
    // ON CONFLICT update branch by customer_profiles_update (same check) — this still can't create
    // or touch anyone else's row.
    const { data, error } = await supabase
      .from("customer_profiles")
      .upsert(values, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ status: "ok", customerProfile: data });
  } catch (err) {
    return errorResponse(err, "api.profile.customer.post");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireUser();
    assertNotAdmin(ctx);
    const body = await request.json().catch(() => null);

    const patch: TablesUpdate<"customer_profiles"> = {};
    if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body?.city === "string") patch.city = body.city;
    if (typeof body?.phone === "string") patch.phone = body.phone;
    // avatarFileId: null explicitly clears the photo ("Remove Photo"); a string sets a newly
    // uploaded file's id. Never trust anything else — no other column is patchable here (in
    // particular, never `status`: that column's own trigger already blocks a non-admin caller,
    // but this route doesn't even forward it).
    if (body && "avatarFileId" in body) {
      patch.avatar_file_id = typeof body.avatarFileId === "string" ? body.avatarFileId : null;
    }
    // Only the four known boolean keys are ever written — never trust an arbitrary client-supplied
    // JSON blob into a jsonb column verbatim. The client always sends the complete preferences
    // object (its local state is initialized from this same GET/PATCH response shape), so a
    // straight sanitized replace is correct — no partial-merge read needed.
    if (body && "notificationPreferences" in body && body.notificationPreferences && typeof body.notificationPreferences === "object") {
      const incoming = body.notificationPreferences as Record<string, unknown>;
      const sanitized = {} as NotificationPreferences;
      for (const key of NOTIFICATION_PREFERENCE_KEYS) {
        sanitized[key] = typeof incoming[key] === "boolean" ? incoming[key] : DEFAULT_NOTIFICATION_PREFERENCES[key];
      }
      // Cast needed purely because Json's index-signature branch isn't structurally satisfied by a
      // named interface without one — the runtime value is exactly the sanitized shape above.
      patch.notification_preferences = sanitized as unknown as TablesUpdate<"customer_profiles">["notification_preferences"];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ status: "error", message: "Nothing to update." }, { status: 400 });
    }

    const supabase = createClient();

    // Same rule as POST: only the caller's own upload in the avatars bucket can become their photo.
    if (typeof patch.avatar_file_id === "string" && !(await areFilesOwnedInBucket(supabase, [patch.avatar_file_id], ctx.user.id, "avatars"))) {
      return NextResponse.json({ status: "error", message: "That photo couldn't be used. Please upload it again." }, { status: 400 });
    }

    // Read the OLD avatar_file_id before it's overwritten, so a replaced/removed photo's storage
    // object + files row can be cleaned up afterward instead of orphaning forever (Phase 7 storage
    // gap-fill — see deleteFileIfOwnedBy's own comment).
    const previousAvatarFileId =
      "avatar_file_id" in patch
        ? (await supabase.from("customer_profiles").select("avatar_file_id").eq("user_id", ctx.user.id).maybeSingle()).data?.avatar_file_id
        : null;

    const { error } = await supabase.from("customer_profiles").update(patch).eq("user_id", ctx.user.id);
    if (error) throw error;

    if (previousAvatarFileId && previousAvatarFileId !== patch.avatar_file_id) {
      await deleteFileIfOwnedBy(supabase, previousAvatarFileId, ctx.user.id);
    }

    const profile = await loadOwnProfile(supabase, ctx.user.id);
    return NextResponse.json({ status: "ok", customerProfile: profile });
  } catch (err) {
    return errorResponse(err, "api.profile.customer.patch");
  }
}
