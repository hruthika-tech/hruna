import { isPostgrestError } from "@/lib/supabase/errors";

/**
 * True when a write failed ONLY because this database doesn't have dresses.stock_status yet
 * (supabase/migrations/20261019000001_dress_stock_status.sql not applied): PostgREST's "column not in
 * the schema cache". The dress routes then save everything else and report stockStatusSaved: false,
 * so editing dresses keeps working until the migration is applied.
 */
export function isMissingStockStatusColumn(error: unknown): boolean {
  return isPostgrestError(error) && error.code === "PGRST204" && /stock_status/.test(error.message ?? "");
}
