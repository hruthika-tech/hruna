import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isPostgrestError } from "@/lib/supabase/errors";

type Db = SupabaseClient<Database>;

/**
 * Server helpers for blocking/reporting. Everything goes through the CALLER's own client: the SQL
 * functions (supabase/migrations/20261020000001_user_blocks_and_reports.sql) answer only about
 * auth.uid()'s own conversations, and RLS guards the tables.
 */

/** A database without the block/report migration yet: function/table not found. */
export function isModerationUnavailable(error: unknown): boolean {
  return isPostgrestError(error) && ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code);
}

/** 'blocked_by_me' | 'blocked_me' | 'none' for the caller's own conversation; null if not theirs. */
export async function conversationBlockState(supabase: Db, conversationId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("conversation_block_state", { p_conversation_id: conversationId });
  if (error) {
    // Before the migration there are no blocks at all — messaging behaves exactly as before.
    if (isModerationUnavailable(error)) return "none";
    throw error;
  }
  return data ?? null;
}

/** The other participant's user id in the caller's own conversation, or null. */
export async function conversationOtherUser(supabase: Db, conversationId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("conversation_other_user", { p_conversation_id: conversationId });
  if (error) throw error;
  return data ?? null;
}
