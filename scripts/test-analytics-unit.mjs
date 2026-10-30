// Unit tests for designer analytics: date ranges (IST), comparisons, tracking coverage, series
// bucketing, conversion threshold, empty states, and the plan entitlement. No database, no app.
// Run with: node --test scripts/test-analytics-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { RANGE_PRESETS, addDays, daysBetween, istDay, isRangeDays, resolveRange } from "../lib/analytics/ranges.ts";
import { MIN_CONVERSION_VIEWERS, NO_COMPARISON_YET, PLAN_COMPARISON_REASON, buildAnalyticsView, buildSeries, compare, conversionCard, formatDay, trackingState } from "../lib/analytics/metrics.ts";
import { getAnalyticsEntitlement } from "../lib/analytics/plans.ts";

const zero = { studio_views: 0, dress_views: 0, saves: 0, conversations: 0, requests: 0, proposals: 0, projects_started: 0, projects_completed: 0 };
const days = (start, n, fill = () => ({})) => Array.from({ length: n }, (_, i) => ({ day: addDays(start, i), ...zero, ...fill(i) }));
const raw = (over = {}) => ({
  start: "2026-10-01",
  end: "2026-10-07",
  previous_start: "2026-09-24",
  previous_end: "2026-09-30",
  tracking_started_on: "2026-09-01",
  series: days("2026-10-01", 7),
  current: { ...zero },
  previous: { ...zero },
  unique_visitors: { current: 0, previous: 0 },
  conversion: { eligible_viewers: 0, converted: 0 },
  top_dresses: [],
  snapshot: { projects_total: 0, projects_active: 0, projects_completed: 0, saves_current: 0 },
  ...over,
});
// Plan-shaped inputs for lib/analytics/plans.ts (limits as stored on the plan rows).
const LIMITS = {
  free: { dresses: 5, collections: 3, previous_creations: 10, highlights: 3, meet_entries: 2, proposals_per_month: 5, analytics_max_days: 7, analytics_comparison: false },
  plus: { dresses: 20, collections: 10, previous_creations: 50, highlights: 3, meet_entries: 2, proposals_per_month: 25, analytics_max_days: 90, analytics_comparison: true },
  pro: { dresses: null, collections: null, previous_creations: null, highlights: 3, meet_entries: 2, proposals_per_month: null, analytics_max_days: 90, analytics_comparison: true },
};
const ent = getAnalyticsEntitlement({ enforced: false, plan_key: "designer_free", limits: LIMITS.free }); // plans off → unrestricted
const card = (view, id) => view.cards.find((c) => c.id === id);

test("IST day boundaries: 18:29 UTC is still the same IST day, 18:30 UTC is the next", () => {
  assert.equal(istDay(new Date("2026-10-27T18:29:59Z")), "2026-10-27");
  assert.equal(istDay(new Date("2026-10-27T18:30:00Z")), "2026-10-28");
});

test("ranges: last N days ending today (IST), plus the equal window before it", () => {
  const r = resolveRange(7, new Date("2026-10-28T06:00:00Z"));
  assert.deepEqual(r, { start: "2026-10-22", end: "2026-10-28", days: 7, previousStart: "2026-10-15", previousEnd: "2026-10-21" });
  const r90 = resolveRange(90, new Date("2026-10-28T06:00:00Z"));
  assert.equal(daysBetween(r90.start, r90.end) + 1, 90);
  assert.equal(daysBetween(r90.previousStart, r90.previousEnd) + 1, 90);
  assert.equal(addDays(r90.previousEnd, 1), r90.start);
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("only the 7/30/90 presets are accepted", () => {
  assert.deepEqual([...RANGE_PRESETS], [7, 30, 90]);
  for (const ok of [7, 30, 90]) assert.equal(isRangeDays(ok), true);
  for (const bad of [0, 1, 14, 365, -7, "7", null, undefined, NaN]) assert.equal(isRangeDays(bad), false, String(bad));
});

test("comparisons: up/down %, no change, and 'new' instead of an infinite % when the previous period was 0", () => {
  assert.deepEqual(compare(15, 10), { kind: "change", percent: 50, direction: "up" });
  assert.deepEqual(compare(5, 10), { kind: "change", percent: 50, direction: "down" });
  assert.deepEqual(compare(3, 3), { kind: "same" });
  assert.deepEqual(compare(0, 0), { kind: "same" });
  assert.deepEqual(compare(4, 0), { kind: "new" });
  assert.deepEqual(compare(0, 4), { kind: "change", percent: 100, direction: "down" });
});

test("tracking coverage decides whether tracked metrics are comparable", () => {
  assert.deepEqual(trackingState({ tracking_started_on: null, start: "2026-10-01", previous_start: "2026-09-24" }), { startedOn: null, coversCurrent: false, coversPrevious: false });
  assert.deepEqual(trackingState({ tracking_started_on: "2026-09-28", start: "2026-10-01", previous_start: "2026-09-24" }), { startedOn: "2026-09-28", coversCurrent: true, coversPrevious: false });
  assert.deepEqual(trackingState({ tracking_started_on: "2026-09-24", start: "2026-10-01", previous_start: "2026-09-24" }), { startedOn: "2026-09-24", coversCurrent: true, coversPrevious: true });
});

test("days before tracking began are null (not tracked) for views/saves, but real zeros for recorded data", () => {
  const s = buildSeries({ tracking_started_on: "2026-10-04", series: days("2026-10-01", 7, (i) => ({ studio_views: i, requests: 1 })) }, "day");
  assert.deepEqual(s.map((p) => p.values.studio_views), [null, null, null, 3, 4, 5, 6]);
  assert.deepEqual(s.map((p) => p.values.requests), [1, 1, 1, 1, 1, 1, 1]);
  const none = buildSeries({ tracking_started_on: null, series: days("2026-10-01", 3) }, "day");
  assert.ok(none.every((p) => p.values.dress_views === null && p.values.saves === null && p.values.projects_started === 0));
});

test("90 days → 13 weekly buckets (last one shorter); a week with no tracked day stays null", () => {
  const s = buildSeries({ tracking_started_on: "2026-08-20", series: days("2026-08-01", 90, () => ({ studio_views: 1, proposals: 2 })) }, "week");
  assert.equal(s.length, 13);
  assert.equal(s[0].day, "2026-08-01");
  assert.equal(s[0].endDay, "2026-08-07");
  assert.equal(s.at(-1).endDay, "2026-10-29");
  assert.equal(daysBetween(s.at(-1).day, s.at(-1).endDay) + 1, 6);
  assert.deepEqual(s.slice(0, 4).map((p) => p.values.studio_views), [null, null, 2, 7]); // tracking from day 20 (Aug 20)
  assert.equal(s[0].values.proposals, 14);
  assert.equal(s.at(-1).values.proposals, 12);
  const total = s.reduce((a, p) => a + p.values.proposals, 0);
  assert.equal(total, 180, "bucketing neither drops nor double-counts days");
});

test("conversion: hidden below the minimum, a capped percentage above it, never before tracking", () => {
  const tracked = trackingState({ tracking_started_on: "2026-09-01", start: "2026-10-01", previous_start: "2026-09-24" });
  const below = conversionCard({ conversion: { eligible_viewers: MIN_CONVERSION_VIEWERS - 1, converted: 5 }, unique_visitors: { current: 40, previous: 0 } }, tracked);
  assert.equal(below.value, null);
  assert.match(below.empty, new RegExp(`at least ${MIN_CONVERSION_VIEWERS}.*\\(${MIN_CONVERSION_VIEWERS - 1} so far\\)`));
  const ok = conversionCard({ conversion: { eligible_viewers: 40, converted: 3 }, unique_visitors: { current: 55, previous: 0 } }, tracked);
  assert.equal(ok.value, 7.5);
  assert.equal(ok.empty, null);
  assert.equal(conversionCard({ conversion: { eligible_viewers: 20, converted: 25 }, unique_visitors: { current: 20, previous: 0 } }, tracked).value, 100);
  const untracked = conversionCard({ conversion: { eligible_viewers: 0, converted: 0 }, unique_visitors: { current: 0, previous: 0 } }, trackingState({ tracking_started_on: null, start: "x", previous_start: "x" }));
  assert.equal(untracked.value, null);
});

test("empty states: nothing tracked yet → explains tracking starts now; recorded metrics still real", () => {
  const v = buildAnalyticsView(raw({ tracking_started_on: null }), ent);
  assert.match(card(v, "studio_views").empty, /counted from the moment tracking is enabled/);
  assert.deepEqual(card(v, "studio_views").delta, { kind: "unavailable", reason: NO_COMPARISON_YET });
  assert.equal(card(v, "requests").empty, "No direct requests in this period.");
  assert.deepEqual(card(v, "requests").delta, { kind: "same" });
  assert.match(card(v, "projects").empty, /No projects yet/);
  assert.equal(card(v, "conversion").value, null);
});

test("partial period: no per-card repetition when there's data; a dated line when there's none", () => {
  const started = "2026-10-04"; // inside the 1–7 Oct window
  const withData = buildAnalyticsView(raw({ tracking_started_on: started, current: { ...zero, studio_views: 3 } }), ent);
  assert.equal(card(withData, "studio_views").empty, null);
  assert.equal(withData.tracking.coversCurrent, false);
  const noData = buildAnalyticsView(raw({ tracking_started_on: started }), ent);
  assert.equal(card(noData, "dress_views").empty, "No dress views since tracking began on 4 Oct 2026.");
  assert.equal(formatDay("2026-10-15"), "15 Oct 2026");
});

test("full view: real totals, comparisons only where valid, snapshot vs period counts kept apart", () => {
  const v = buildAnalyticsView(
    raw({
      tracking_started_on: "2026-09-24",
      current: { ...zero, studio_views: 12, dress_views: 30, saves: 4, conversations: 2, requests: 3, proposals: 5, projects_started: 1, projects_completed: 2 },
      previous: { ...zero, studio_views: 8, dress_views: 30, saves: 0, requests: 6 },
      snapshot: { projects_total: 9, projects_active: 3, projects_completed: 5, saves_current: 11 },
      top_dresses: [{ id: "a", name: "Gown", views: "7" }],
    }),
    ent
  );
  assert.equal(v.range.days, 7);
  assert.equal(v.range.bucket, "day");
  assert.equal(card(v, "studio_views").value, 12);
  assert.deepEqual(card(v, "studio_views").delta, { kind: "change", percent: 50, direction: "up" });
  assert.deepEqual(card(v, "dress_views").delta, { kind: "same" });
  assert.deepEqual(card(v, "interest").delta, { kind: "new" });
  assert.deepEqual(card(v, "requests").delta, { kind: "change", percent: 50, direction: "down" });
  assert.equal(card(v, "projects").value, 9);
  assert.equal(card(v, "projects").delta, null, "a current total has no period comparison");
  assert.ok(card(v, "projects").details.includes("3 active · 5 completed (current totals)"));
  assert.ok(card(v, "projects").details.includes("This period: 1 started, 2 completed"));
  assert.ok(card(v, "interest").details.includes("11 items saved by customers right now"));
  assert.deepEqual(v.topDresses, [{ id: "a", name: "Gown", views: 7 }]);
  assert.equal(v.tracking.coversCurrent, true);
});

test("analytics entitlement follows the plan: Free 7 days without comparison; Plus/Pro 7/30/90; unrestricted while plans are off", () => {
  const off = getAnalyticsEntitlement({ enforced: false, plan_key: "designer_free", limits: LIMITS.free });
  assert.deepEqual([...off.ranges], [...RANGE_PRESETS]);
  assert.equal(off.tier, "unrestricted");
  assert.equal(off.periodComparison, true);
  const free = getAnalyticsEntitlement({ enforced: true, plan_key: "designer_free", limits: LIMITS.free });
  assert.deepEqual([...free.ranges], [7]);
  assert.equal(free.periodComparison, false);
  assert.equal(free.tier, "designer_free");
  for (const key of ["plus", "pro"]) {
    const e = getAnalyticsEntitlement({ enforced: true, plan_key: `designer_${key}`, limits: LIMITS[key] });
    assert.deepEqual([...e.ranges], [7, 30, 90], key);
    assert.equal(e.periodComparison, true, key);
    assert.equal(e.topListings, true, key);
  }
});

test("Free analytics: no previous-period figures (null from the database) → comparisons explained, nothing crashes", () => {
  const free = getAnalyticsEntitlement({ enforced: true, plan_key: "designer_free", limits: LIMITS.free });
  const v = buildAnalyticsView(raw({ previous: null, unique_visitors: { current: 3, previous: null }, current: { ...zero, studio_views: 3, requests: 1 } }), free);
  assert.equal(card(v, "studio_views").value, 3);
  assert.deepEqual(card(v, "studio_views").delta, { kind: "unavailable", reason: PLAN_COMPARISON_REASON });
  assert.deepEqual(card(v, "requests").delta, { kind: "unavailable", reason: PLAN_COMPARISON_REASON });
});
