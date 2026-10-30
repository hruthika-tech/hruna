// Date ranges for designer analytics. Days are calendar days in Asia/Kolkata (IST, UTC+5:30, no
// daylight saving) — the same bucketing public.designer_analytics() uses in the database.
// Isomorphic: no server-only imports, so the dashboard and unit tests use the same rules.

export const ANALYTICS_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Selectable presets, in days. Which of these a designer may use is decided by lib/analytics/plans.ts. */
export const RANGE_PRESETS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_PRESETS)[number];

export function isRangeDays(value: unknown): value is RangeDays {
  return RANGE_PRESETS.includes(value as RangeDays);
}

/** "YYYY-MM-DD" of the IST calendar day containing `at`. */
export function istDay(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds whole days to a "YYYY-MM-DD" date (calendar arithmetic, no time zone involved). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface DateRange {
  /** First day, inclusive. */
  start: string;
  /** Last day, inclusive (today). */
  end: string;
  days: number;
  /** The equivalent window immediately before, for comparisons. */
  previousStart: string;
  previousEnd: string;
}

/** The last `days` days ending today (IST), and the equal-length window before it. */
export function resolveRange(days: RangeDays, now: Date = new Date()): DateRange {
  const end = istDay(now);
  const start = addDays(end, -(days - 1));
  return { start, end, days, previousStart: addDays(start, -days), previousEnd: addDays(start, -1) };
}
