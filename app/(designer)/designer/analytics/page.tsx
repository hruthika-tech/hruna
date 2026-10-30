"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info, Loader2, Lock } from "lucide-react";
import { StatTile } from "@/components/analytics/StatTile";
import { TrendChart, type ChartSeries } from "@/components/analytics/TrendChart";
import { ANALYTICS_COLORS } from "@/components/analytics/palette";
import { METRIC_DEFINITIONS, formatDay as fmtDay, type AnalyticsView, type Card } from "@/lib/analytics/metrics";
import { RANGE_PRESETS, type RangeDays } from "@/lib/analytics/ranges";
import { cn } from "@/lib/utils";

// The signed-in designer's own analytics (data: GET /api/designer/analytics, scoped server-side and
// in the database to this designer). Colours: components/analytics/palette.ts.
const SERIES_1 = ANALYTICS_COLORS.midnight;
const SERIES_2 = ANALYTICS_COLORS.rosyBrown;

export default function DesignerAnalyticsPage() {
  // null until the first load, which uses the plan's default range (Free: 7 days; otherwise 30).
  const [range, setRange] = useState<RangeDays | null>(null);
  const adoptDefault = useRef(false);
  const [view, setView] = useState<AnalyticsView | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready" | "not_ready">("loading");
  const [error, setError] = useState("");
  const request = useRef(0);

  const load = useCallback(async (days: RangeDays | null) => {
    const id = ++request.current;
    setStatus((s) => (s === "ready" ? "ready" : "loading"));
    setError("");
    try {
      const res = await fetch(days === null ? "/api/designer/analytics" : `/api/designer/analytics?range=${days}`);
      const data = await res.json();
      if (id !== request.current) return; // a newer range was chosen meanwhile
      if (res.status === 503 && data.code === "analytics_not_ready") {
        // Analytics isn't set up on this database yet: a calm notice, not an error.
        setError(data.message);
        setStatus("not_ready");
        return;
      }
      if (!res.ok) throw new Error(data.message ?? "Couldn't load your analytics.");
      setView(data.analytics);
      setStatus("ready");
      if (days === null) {
        adoptDefault.current = true; // show the range the server chose, without fetching it again
        setRange(data.analytics.range.days);
      }
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : "Couldn't load your analytics.");
      setStatus("error");
    }
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (adoptDefault.current) {
      adoptDefault.current = false;
      return;
    }
    setRefreshing(true);
    load(range).finally(() => setRefreshing(false));
  }, [range, load]);

  const allowed = view?.entitlement.ranges ?? RANGE_PRESETS;
  const days = view?.range.days ?? range ?? 7;
  const trackingEmpty = view?.tracking.startedOn
    ? "No visits recorded in this period yet."
    : "Nothing recorded yet. Views and saves are counted from the moment tracking is enabled; earlier activity can't be recovered.";

  const perBucket = view?.range.bucket === "week" ? "per week" : "per day";
  const chart = (testId: string, title: string, description: string, series: ChartSeries[], emptyMessage: string, height?: number) =>
    view && (
      <TrendChart
        testId={testId}
        title={title}
        description={description}
        series={series}
        points={view.series}
        bucket={view.range.bucket}
        emptyMessage={emptyMessage}
        height={height}
      />
    );
  // Four headline metrics on top; projects and conversion in a compact secondary row.
  const PRIMARY: Card["id"][] = ["studio_views", "dress_views", "interest", "requests"];
  const primaryCards = view?.cards.filter((c) => PRIMARY.includes(c.id)) ?? [];
  const secondaryCards = view?.cards.filter((c) => !PRIMARY.includes(c.id)) ?? [];
  // Without period comparison on this plan every card would repeat the same reason; say it once.
  const comparisonNote = view && !view.entitlement.periodComparison
    ? view.cards.map((c) => c.delta).find((d) => d?.kind === "unavailable")?.reason ?? null
    : null;
  const hideUnavailable = (card: Card) => comparisonNote !== null && card.delta?.kind === "unavailable" && card.delta.reason === comparisonNote;

  return (
    <div className="bg-[#F7F4D5] text-[#0A3323]">
    <div className="container-editorial py-10 md:py-14 pb-section-gap">
      {/* Heading with the one filter that scopes everything below it. */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-6">
        <div className="min-w-0">
          <h1 className="text-headline-md text-[#0A3323]">Studio Analytics</h1>
          <p className="text-[#0A3323]/70 text-sm mt-2 max-w-xl">
            How customers discover and engage with your studio. Only you can see these numbers.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 lg:items-end">
          <div role="group" aria-label="Date range" className="inline-flex w-fit rounded-full border border-[#839958]/40 bg-white p-1">
            {RANGE_PRESETS.map((r) => {
              const locked = !allowed.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  disabled={locked}
                  title={locked ? "Included in Designer Plus and Designer Pro" : undefined}
                  onClick={() => setRange(r)}
                  data-testid={`analytics-range-${r}`}
                  className={cn(
                    "px-3 sm:px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors inline-flex items-center gap-1",
                    range === r ? "bg-[#0A3323] text-[#F7F4D5] font-medium" : locked ? "text-[#0A3323]/40 cursor-not-allowed" : "text-[#0A3323]/70 hover:text-[#0A3323] hover:bg-[#F7F4D5]"
                  )}
                >
                  {locked && <Lock size={12} aria-hidden />} Last {r} days
                  {locked && <span className="sr-only"> (not included in your plan)</span>}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {view && (
              <p className="text-xs text-[#0A3323]/60" data-testid="analytics-range-label">
                {fmtDay(view.range.start)} – {fmtDay(view.range.end)} · India Standard Time
              </p>
            )}
            {refreshing && status === "ready" && <Loader2 className="animate-spin text-[#105666]" size={14} aria-label="Updating" />}
            {allowed.length < RANGE_PRESETS.length && (
              <Link href="/designer-subscription" className="text-xs text-[#105666] font-medium hover:underline" data-testid="analytics-upgrade">
                Longer history with Designer Plus →
              </Link>
            )}
          </div>
          {comparisonNote && (
            <p className="text-xs text-[#0A3323]/60" data-testid="analytics-comparison-note">
              {comparisonNote}
            </p>
          )}
        </div>
      </div>

      {status === "loading" && !view && (
        <div className="flex items-center justify-center gap-2 text-[#0A3323]/70 py-24" role="status">
          <Loader2 className="animate-spin" size={18} aria-hidden /> Loading your analytics…
        </div>
      )}

      {status === "not_ready" && (
        <div className="text-center py-16 bg-white border border-[#839958]/30 rounded-md px-6" role="status" data-testid="analytics-not-ready">
          <p className="text-headline-sm text-[#0A3323] mb-2">Studio analytics are on their way</p>
          <p className="text-[#0A3323]/70 text-sm">{error}</p>
        </div>
      )}

      {status === "error" && (
        <div className="text-center py-16" role="alert">
          <p className="text-headline-sm mb-2">Couldn&apos;t load your analytics</p>
          <p className="text-[#0A3323]/70 text-sm mb-4">{error}</p>
          <button type="button" onClick={() => load(range)} className="text-sm text-[#105666] font-medium hover:underline">
            Try again
          </button>
        </div>
      )}

      {view && status !== "error" && (
        <div className={cn("transition-opacity", refreshing && "opacity-60")} data-testid="analytics-dashboard">
          {!view.tracking.coversCurrent && (
            <p className="flex gap-2 items-start bg-[#D3968C]/20 border border-[#D3968C]/40 rounded-md px-3 py-2 mb-5 text-xs leading-relaxed text-[#0A3323]/80" data-testid="analytics-tracking-notice">
              <Info size={14} className="shrink-0 mt-0.5 text-[#105666]" aria-hidden />
              <span>
                {view.tracking.startedOn
                  ? `Studio views, dress views and saves are counted from ${fmtDay(view.tracking.startedOn)}, when tracking began — part of this period isn't covered yet.`
                  : "Studio views, dress views and saves are counted from the moment tracking is enabled, so they start at zero and build up from there."}{" "}
                Requests, proposals, conversations and projects include your full history.
              </span>
            </p>
          )}

          <h2 className="sr-only">Overview</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-3 sm:mb-4">
            {primaryCards.map((card) => (
              <StatTile key={card.id} card={card} days={days} hideUnavailable={hideUnavailable(card)} accent />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
            {secondaryCards.map((card) => (
              <StatTile key={card.id} card={card} days={days} compact hideUnavailable={hideUnavailable(card)} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className={cn("min-w-0", view.topDresses ? "lg:col-span-2" : "lg:col-span-3")}>
              {chart(
                "analytics-chart-performance",
                "Performance over time",
                `Studio and dress views, ${perBucket}`,
                [
                  { key: "studio_views", label: "Studio views", color: SERIES_1 },
                  { key: "dress_views", label: "Dress views", color: SERIES_2 },
                ],
                trackingEmpty,
                240
              )}
            </div>
            {view.topDresses && (
              <section className="bg-white border border-[#839958]/30 rounded-md p-5 min-w-0" data-testid="analytics-top-dresses" aria-labelledby="top-dresses-title">
                <h3 id="top-dresses-title" className="font-body text-base font-medium text-[#0A3323]">Most viewed dresses</h3>
                <p className="text-xs text-[#0A3323]/60 mt-0.5 mb-3">In the selected period</p>
                {view.topDresses.length === 0 ? (
                  <div className="text-sm text-[#0A3323]/75 bg-[#F7F4D5] rounded-md px-4 py-6 text-center" data-testid="analytics-top-dresses-empty">
                    <p>No dress views in this period yet.</p>
                    <p className="text-xs text-[#0A3323]/60 mt-1">Dresses appear here, most viewed first, as customers open them.</p>
                  </div>
                ) : (
                  <ol className="divide-y divide-[#839958]/25">
                    {view.topDresses.map((d, i) => (
                      <li key={d.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                        <span className="flex items-center gap-3 min-w-0">
                          <span className="text-[#105666] font-medium tabular-nums w-4 shrink-0">{i + 1}</span>
                          <Link href={`/dresses/${d.id}`} className="text-[#0A3323] hover:text-[#105666] hover:underline truncate">
                            {d.name}
                          </Link>
                        </span>
                        <span className="text-[#0A3323]/70 tabular-nums shrink-0">
                          {d.views.toLocaleString("en-IN")} {d.views === 1 ? "view" : "views"}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {chart(
              "analytics-chart-engagement",
              "Customer engagement",
              `Saves and new conversations, ${perBucket}`,
              [
                { key: "saves", label: "Saves", color: SERIES_1 },
                { key: "conversations", label: "New conversations", color: SERIES_2 },
              ],
              "No engagement in this period yet.",
              160
            )}
            {chart(
              "analytics-chart-requests",
              "Requests & projects",
              `Direct requests received and projects started, ${perBucket}`,
              [
                { key: "requests", label: "Requests received", color: SERIES_1 },
                { key: "projects_started", label: "Projects started", color: SERIES_2 },
              ],
              "No requests or projects in this period.",
              160
            )}
          </div>

          <details className="bg-white border border-[#839958]/30 rounded-md p-5" data-testid="analytics-definitions">
            <summary className="cursor-pointer text-sm font-medium text-[#0A3323] marker:text-[#839958]">How these numbers are calculated</summary>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              {METRIC_DEFINITIONS.map((m) => (
                <div key={m.name}>
                  <dt className="font-medium text-[#0A3323]">{m.name}</dt>
                  <dd className="text-[#0A3323]/70">{m.definition}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}
    </div>
    </div>
  );
}
