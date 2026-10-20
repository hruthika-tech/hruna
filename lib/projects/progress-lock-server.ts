// Server-side responses for the progress-history lock (rule + messages: ./progress-lock.ts).

import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { isProgressLocked, PROJECT_LOCKED_CODE, PROJECT_LOCKED_MESSAGE } from "./progress-lock";

export function projectLockedResponse(): NextResponse {
  return NextResponse.json({ status: "error", code: PROJECT_LOCKED_CODE, message: PROJECT_LOCKED_MESSAGE }, { status: 409 });
}

/**
 * For the progress-update write routes: the 409 response if this project is locked, else null.
 * Reads with the caller's own client (RLS-scoped); a project the caller can't see falls through
 * to the route's existing not-found / permission handling.
 */
export async function lockedProjectResponse(supabase: ReturnType<typeof createClient>, projectId: string): Promise<NextResponse | null> {
  const { data, error } = await supabase.from("projects").select("status").eq("id", projectId).maybeSingle();
  if (error) throw error;
  return data && isProgressLocked(data.status) ? projectLockedResponse() : null;
}
