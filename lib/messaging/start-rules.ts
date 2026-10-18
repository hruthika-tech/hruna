import { NextResponse } from "next/server";
import { isPostgrestError } from "@/lib/supabase/errors";

/**
 * Starting a NEW conversation is decided by the database function can_start_conversation()
 * (supabase/migrations/20261012000002_conversation_start_rules.sql), the same rule the conversations
 * insert policy enforces. If a database hasn't received that migration, the function doesn't exist —
 * that is a deployment gap, not a reason to skip the rule. These helpers turn it into a clear,
 * specific answer (and a server log naming the migration) instead of a generic 500.
 */

/** PostgREST "function not found in the schema cache" / Postgres "undefined function". */
export function isMissingStartRule(error: unknown): boolean {
  return isPostgrestError(error) && (error.code === "PGRST202" || error.code === "42883");
}

export function startRuleUnavailable(context: string, error: unknown): NextResponse {
  console.error(
    `[${context}] public.can_start_conversation() is missing in this database — apply supabase/migrations/20261012000002_conversation_start_rules.sql (and 20261012000001_messaging_participant_policies.sql).`,
    { code: isPostgrestError(error) ? error.code : undefined }
  );
  return NextResponse.json(
    {
      status: "error",
      code: "messaging_not_ready",
      message: "New conversations can't be started right now because messaging isn't fully set up on the server yet. Existing conversations still open. Please try again later.",
    },
    { status: 503 }
  );
}
