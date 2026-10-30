// Recognises "this database object doesn't exist yet" errors, so code that ships ahead of its
// migration can fall back cleanly instead of failing (isomorphic, no runtime imports; unit-tested).
// Features that use it: designer analytics (20261028000001 / 20261029000002) and project withdrawal
// + request deletion (20261023000001 / 20261023000002). Designer plans have their own check
// (lib/subscriptions/plans.ts isPlansNotReadyError).
//
//   PGRST202 function not in PostgREST's schema cache    42883 undefined function
//   PGRST205 table not in PostgREST's schema cache       42P01 undefined table
//   PGRST204 column not in PostgREST's schema cache      42703 undefined column

const MISSING_CODES = new Set(["PGRST202", "PGRST204", "PGRST205", "42883", "42P01", "42703"]);

export function isMissingSchemaObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && MISSING_CODES.has(code)) return true;
  return typeof message === "string" && /could not find the (function|table)|schema cache|(relation|function|column) .* does not exist/i.test(message);
}
