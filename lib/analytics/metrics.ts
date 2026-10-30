// Turns public.designer_analytics()'s aggregates into what the dashboard shows. Isomorphic and pure
// (no I/O), so every rule below is unit-tested (scripts/test-analytics-unit.mjs).
//
// Honesty rules:
//  - Views and saves exist only since tracking began (tracking_started_on). Days before that are
//    "not tracked" (null) — never zero — and a period comparison is offered only when tracking
//    covered the WHOLE previous period.
//  - Requests, proposals, conversations and projects come from their own tables' real timestamps,
//    so they have full history and are always comparable.
//  - Conversion rate is shown only with enough signed-in visitors to mean something.

// Type-only imports: this module has no runtime dependencies (unit tests load it directly).
import type { AnalyticsEntitlement } from "./plans";

export const TRACKED_METRICS = ["studio_views", "dress_views", "saves"] as const;
export const RECORDED_METRICS = ["conversations", "requests", "proposals", "projects_started", "projects_completed"] as const;
export type TrackedMetric = (typeof TRACKED_METRICS)[number];
export type RecordedMetric = (typeof RECORDED_METRICS)[number];
export type Metric = TrackedMetric | RecordedMetric;

/** Why a views/saves comparison is withheld while tracking is younger than two periods. */
export const NO_COMPARISON_YET = "No comparison yet — tracking began recently.";

/** "2026-10-15" → "15 Oct 2026". */
export const formatDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Why a comparison is missing on a plan without comparisons (Free). */
export const PLAN_COMPARISON_REASON = "Comparisons with the previous period are included in Designer Plus and Pro.";

const ZERO_TOTALS: Totals = { studio_views: 0, dress_views: 0, saves: 0, conversations: 0, requests: 0, proposals: 0, projects_started: 0, projects_completed: 0 };

/** Fewest signed-in visitors in a period before a conversion rate is shown. */
export const MIN_CONVERSION_VIEWERS = 20;

export type Totals = Record<Metric, number>;

/** Shape returned by public.designer_analytics(). */
export interface RawAnalytics {
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
  tracking_started_on: string | null;
  series: ({ day: string } & Totals)[];
  current: Totals;
  /** null when the designer's plan has no period comparison (Free). */
  previous: Totals | null;
  unique_visitors: { current: number; previous: number | null };
  conversion: { eligible_viewers: number; converted: number };
  top_dresses: { id: string; name: string; views: number }[];
  snapshot: { projects_total: number; projects_active: number; projects_completed: number; saves_current: number };
}

export type Delta =
  | { kind: "change"; percent: number; direction: "up" | "down" }
  | { kind: "same" }
  | { kind: "new" }
  | { kind: "unavailable"; reason: string };

export function compare(current: number, previous: number): Delta {
  if (current === previous) return { kind: "same" };
  if (previous === 0) return { kind: "new" };
  const percent = Math.round(((current - previous) / previous) * 100);
  return { kind: "change", percent: Math.abs(percent), direction: current > previous ? "up" : "down" };
}

/** Tracking status for the selected window. */
export interface TrackingState {
  /** First day any view/save was recorded on HRUNA, or null if none yet. */
  startedOn: string | null;
  /** Tracking covered the whole selected window. */
  coversCurrent: boolean;
  /** Tracking covered the whole previous window (needed for comparisons). */
  coversPrevious: boolean;
}

export function trackingState(raw: Pick<RawAnalytics, "tracking_started_on" | "start" | "previous_start">): TrackingState {
  const s = raw.tracking_started_on;
  return {
    startedOn: s,
    coversCurrent: !!s && s <= raw.start,
    coversPrevious: !!s && s <= raw.previous_start,
  };
}

function trackedDelta(current: number, previous: number, tracking: TrackingState, allowed: boolean): Delta {
  if (!allowed) return { kind: "unavailable", reason: PLAN_COMPARISON_REASON };
  if (!tracking.coversPrevious) return { kind: "unavailable", reason: NO_COMPARISON_YET };
  return compare(current, previous);
}

export interface Card {
  id: "studio_views" | "dress_views" | "interest" | "requests" | "projects" | "conversion";
  label: string;
  /** Headline value; null = cannot be shown yet (see `empty`). */
  value: number | null;
  /** Unit for the headline value. */
  unit: "count" | "percent";
  delta: Delta | null;
  /** Supporting facts under the value. */
  details: string[];
  /** Shown instead of (or alongside) a zero/missing value. */
  empty: string | null;
}

export interface SeriesPoint {
  /** First day of the point (a day, or the first day of a week bucket). */
  day: string;
  /** Last day covered (same as `day` for daily points). */
  endDay: string;
  values: Record<Metric, number | null>;
}

export interface AnalyticsView {
  range: { start: string; end: string; days: number; previousStart: string; previousEnd: string; bucket: "day" | "week" };
  tracking: TrackingState;
  cards: Card[];
  series: SeriesPoint[];
  topDresses: { id: string; name: string; views: number }[] | null;
  entitlement: AnalyticsEntitlement;
}

const fmt = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

/** Daily rows → points; tracked metrics are null on days before tracking began. 90-day ranges are
 *  grouped into 7-day buckets (the last may be shorter) so the chart stays readable. */
export function buildSeries(raw: Pick<RawAnalytics, "series" | "tracking_started_on">, bucket: "day" | "week"): SeriesPoint[] {
  const started = raw.tracking_started_on;
  const daily: SeriesPoint[] = raw.series.map((row) => {
    const values = {} as Record<Metric, number | null>;
    for (const m of TRACKED_METRICS) values[m] = started && row.day >= started ? Number(row[m]) : null;
    for (const m of RECORDED_METRICS) values[m] = Number(row[m]);
    return { day: row.day, endDay: row.day, values };
  });
  if (bucket === "day") return daily;

  const out: SeriesPoint[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const values = {} as Record<Metric, number | null>;
    for (const m of [...TRACKED_METRICS, ...RECORDED_METRICS]) {
      const known = chunk.map((p) => p.values[m]).filter((v): v is number => v !== null);
      values[m] = known.length ? known.reduce((a, b) => a + b, 0) : null;
    }
    out.push({ day: chunk[0].day, endDay: chunk[chunk.length - 1].day, values });
  }
  return out;
}

export function conversionCard(raw: Pick<RawAnalytics, "conversion" | "unique_visitors">, tracking: TrackingState): Card {
  const { eligible_viewers: eligible, converted } = raw.conversion;
  const base: Omit<Card, "value" | "empty"> = {
    id: "conversion",
    label: "Conversion rate",
    unit: "percent",
    delta: null,
    details: [
      `${plural(raw.unique_visitors.current, "unique visitor", "unique visitors")} this period`,
      "Share of signed-in visitors who then saved, messaged you or sent a request",
    ],
  };
  if (!tracking.startedOn) return { ...base, value: null, empty: "Starts once visits are being recorded." };
  if (eligible < MIN_CONVERSION_VIEWERS) {
    return {
      ...base,
      value: null,
      empty: `Shown once at least ${MIN_CONVERSION_VIEWERS} signed-in customers visit in a period (${eligible.toLocaleString("en-IN")} so far).`,
    };
  }
  const percent = Math.min(100, Math.round((converted / eligible) * 1000) / 10);
  return { ...base, value: percent, empty: null };
}

export function buildAnalyticsView(raw: RawAnalytics, entitlement: AnalyticsEntitlement): AnalyticsView {
  const tracking = trackingState(raw);
  const days = raw.series.length; // one row per day of the window, start..end inclusive
  const bucket = days > 31 ? "week" : "day";
  const cmp = entitlement.periodComparison;
  const c = raw.current;
  const p = raw.previous ?? ZERO_TOTALS; // only read when comparisons are allowed

  // An honest empty-state line for tracked metrics (a partial period is explained once, by the
  // dashboard's tracking notice, rather than on every card).
  const trackedEmpty = (value: number, noun: string): string | null => {
    if (!tracking.startedOn) return `No ${noun} recorded yet. They're counted from the moment tracking is enabled — earlier activity can't be shown.`;
    if (value > 0) return null;
    return tracking.coversCurrent ? `No ${noun} in this period yet.` : `No ${noun} since tracking began on ${formatDay(tracking.startedOn)}.`;
  };

  const cards: Card[] = [
    {
      id: "studio_views",
      label: "Studio views",
      value: c.studio_views,
      unit: "count",
      delta: trackedDelta(c.studio_views, p.studio_views, tracking, cmp),
      details: ["Visits to your public studio page (one per visitor per day)"],
      empty: trackedEmpty(c.studio_views, "studio views"),
    },
    {
      id: "dress_views",
      label: "Dress views",
      value: c.dress_views,
      unit: "count",
      delta: trackedDelta(c.dress_views, p.dress_views, tracking, cmp),
      details: ["Visits to your dress pages (one per visitor, per dress, per day)"],
      empty: trackedEmpty(c.dress_views, "dress views"),
    },
    {
      id: "interest",
      label: "Customer interest",
      value: c.saves,
      unit: "count",
      delta: trackedDelta(c.saves, p.saves, tracking, cmp),
      details: [
        `${plural(c.saves, "save", "saves")} of your studio, dresses or collections`,
        `${plural(c.conversations, "new conversation", "new conversations")} with customers`,
        `${plural(raw.snapshot.saves_current, "item", "items")} saved by customers right now`,
      ],
      empty: trackedEmpty(c.saves, "saves"),
    },
    {
      id: "requests",
      label: "Design requests received",
      value: c.requests,
      unit: "count",
      delta: cmp ? compare(c.requests, p.requests) : { kind: "unavailable", reason: PLAN_COMPARISON_REASON },
      details: [
        "Requests customers sent directly to you",
        `${plural(c.proposals, "proposal", "proposals")} you sent this period`,
      ],
      empty: c.requests === 0 ? "No direct requests in this period." : null,
    },
    {
      id: "projects",
      label: "Projects",
      value: raw.snapshot.projects_total,
      unit: "count",
      delta: null,
      details: [
        `${fmt(raw.snapshot.projects_active)} active · ${fmt(raw.snapshot.projects_completed)} completed (current totals)`,
        `This period: ${fmt(c.projects_started)} started, ${fmt(c.projects_completed)} completed`,
      ],
      empty: raw.snapshot.projects_total === 0 ? "No projects yet — they start when a customer accepts your proposal." : null,
    },
    conversionCard(raw, tracking),
  ];

  return {
    range: { start: raw.start, end: raw.end, days, previousStart: raw.previous_start, previousEnd: raw.previous_end, bucket },
    tracking,
    cards,
    series: buildSeries(raw, bucket),
    topDresses: entitlement.topListings ? raw.top_dresses.map((d) => ({ ...d, views: Number(d.views) })) : null,
    entitlement,
  };
}

/** How each number is calculated — shown on the dashboard, and the reference for the tests. */
export const METRIC_DEFINITIONS: { name: string; definition: string }[] = [
  { name: "Studio views", definition: "Views of your public studio page in the selected days. Each visitor counts once per day; your own visits, admins and known bots are not counted. Counting started when tracking was enabled." },
  { name: "Dress views", definition: "Views of your dress pages in the selected days — once per visitor, per dress, per day, with the same exclusions as studio views." },
  { name: "Customer interest", definition: "Saves (hearts) of your studio, dresses or collections made in the selected days, each customer counted once per item per day. Also shown: conversations customers started with you, and how many of your items are saved right now." },
  { name: "Design requests received", definition: "Requests a customer sent directly to you (not drafts) in the selected days. Open requests you browse in Discover aren't counted; proposals you sent are shown alongside." },
  { name: "Projects", definition: "Current totals: all your projects, active ones (active, awaiting confirmation or on hold) and completed ones. 'This period' counts projects that started (proposal accepted) and that were completed in the selected days — each project once, whatever its status changes." },
  { name: "Conversion rate", definition: `Of the signed-in customers who viewed your studio or a dress in the selected days, the share who afterwards — within the same days — saved one of your items, started a conversation or sent you a request. Signed-out visitors can't be followed, so they're not included. Shown only with at least ${MIN_CONVERSION_VIEWERS} such visitors.` },
  { name: "Comparisons", definition: "Each change compares the selected days with the same number of days just before. For views and saves it appears only once tracking covered that whole earlier period." },
  { name: "Days", definition: "Calendar days in India Standard Time." },
];

/** Previous-window label, e.g. "vs previous 7 days". */
export const comparisonLabel = (days: number) => `vs previous ${days} days`;
