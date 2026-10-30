"use client";

import { useEffect, useId, useState } from "react";
import type { Metric, SeriesPoint } from "@/lib/analytics/metrics";

// A small line chart for one or two series over time (SVG, no chart library).
// Marks follow the dashboard spec: 2px lines, a ~10% area wash for a single series, hairline
// recessive grid, clean integer ticks, end dot with a surface ring. Days that weren't tracked are
// gaps, never zeros. Hover/focus shows a crosshair + one tooltip listing every series; arrow keys
// move it. A legend appears for two series, and every chart has a table view.

export interface ChartSeries {
  key: Metric;
  label: string;
  color: string;
}

const DEFAULT_HEIGHT = 200;
const PAD = { top: 12, right: 14, bottom: 26, left: 34 };

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtPoint = (p: SeriesPoint, bucket: "day" | "week") =>
  bucket === "week" && p.endDay !== p.day ? `${fmtDay(p.day)} – ${fmtDay(p.endDay)}` : fmtDay(p.day);

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = Math.ceil(max / (step * magnitude)) * step * magnitude;
    if (candidate / (step * magnitude) <= 5) return candidate;
  }
  return Math.ceil(max);
}

// Measures the plot container; a callback ref, so it re-attaches whenever the plot mounts again
// (e.g. switching back from the table view).
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

export function TrendChart({
  title,
  description,
  series,
  points,
  bucket,
  emptyMessage,
  testId,
  height: HEIGHT = DEFAULT_HEIGHT,
}: {
  title: string;
  description: string;
  series: ChartSeries[];
  points: SeriesPoint[];
  bucket: "day" | "week";
  /** Shown instead of the plot when no point has any data (e.g. tracking hasn't started). */
  emptyMessage: string;
  testId: string;
  /** Plot height in px (the main chart is taller than the compact ones). */
  height?: number;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const gradientId = useId().replace(/:/g, "");

  const hasData = points.some((p) => series.some((s) => p.values[s.key] !== null));
  const max = niceMax(Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0))));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max].map((t) => Math.round(t));
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 72))));

  // Path per series, broken where a value is null (not tracked).
  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = p.values[s.key];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });
  const area = (() => {
    if (series.length !== 1) return "";
    const known = points.map((p, i) => ({ i, v: p.values[series[0].key] })).filter((p): p is { i: number; v: number } => p.v !== null);
    if (known.length < 2) return "";
    const first = known[0].i;
    const last = known[known.length - 1].i;
    return `${paths[0]}L${x(last).toFixed(1)},${y(0)}L${x(first).toFixed(1)},${y(0)}Z`;
  })();

  const onPointer = (clientX: number, rect: DOMRect) => {
    if (points.length === 0 || plotW <= 0) return;
    const rel = clientX - rect.left - PAD.left;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round((rel / plotW) * (points.length - 1)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((a) => {
        const cur = a ?? (e.key === "ArrowRight" ? -1 : points.length);
        return Math.max(0, Math.min(points.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Escape") setActive(null);
  };

  const activePoint = active !== null ? points[active] : null;
  const tooltipLeft = active !== null ? Math.min(Math.max(x(active) - 80, 0), Math.max(0, width - 160)) : 0;
  const lastKnown = (key: Metric) => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].values[key] !== null) return i;
    return -1;
  };

  return (
    <section className="bg-white border border-[#839958]/30 rounded-md p-5 min-w-0" data-testid={testId} aria-label={title}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-body text-base font-medium text-[#0A3323]">{title}</h3>
          <p className="text-xs text-[#0A3323]/60 mt-0.5">{description}</p>
        </div>
        {hasData && (
          <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs text-[#105666] font-medium hover:underline shrink-0" aria-expanded={showTable}>
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </div>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-[#0A3323]/75" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 rounded" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {!hasData ? (
        <p className="text-sm text-[#0A3323]/75 bg-[#F7F4D5] rounded-md px-4 py-8 text-center" data-testid={`${testId}-empty`}>
          {emptyMessage}
        </p>
      ) : showTable ? (
        <div style={{ maxHeight: HEIGHT + 60 }} className="overflow-auto border border-[#839958]/30 rounded">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-[#F7F4D5] text-[#0A3323]/75 sticky top-0">
              <tr>
                <th className="text-left font-medium px-3 py-2">{bucket === "week" ? "Week" : "Day"}</th>
                {series.map((s) => (
                  <th key={s.key} className="text-right font-medium px-3 py-2">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.day} className="border-t border-[#839958]/20">
                  <td className="px-3 py-1.5 text-[#0A3323]/70">{fmtPoint(p, bucket)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right text-[#0A3323]">{p.values[s.key] === null ? "not tracked" : p.values[s.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative w-full" style={{ height: HEIGHT }}>
          {width > 0 && (
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`${title}: line chart. Use the table view for exact values.`}
              tabIndex={0}
              onKeyDown={onKey}
              onPointerMove={(e) => onPointer(e.clientX, e.currentTarget.getBoundingClientRect())}
              onPointerLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              className="block outline-none focus-visible:ring-2 focus-visible:ring-[#105666]/40 rounded touch-pan-y"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={series[0].color} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={series[0].color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="#839958" strokeOpacity={0.3} strokeWidth={1} />
                  <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[#0A3323]/55 text-[10px] tabular-nums">
                    {t.toLocaleString("en-IN")}
                  </text>
                </g>
              ))}
              {points.map((p, i) =>
                i % labelEvery === 0 || i === points.length - 1 ? (
                  <text key={p.day} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-[#0A3323]/55 text-[10px]">
                    {fmtDay(p.day)}
                  </text>
                ) : null
              )}
              {area && <path d={area} fill={`url(#${gradientId})`} />}
              {series.map((s, si) => (
                <path key={s.key} d={paths[si]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {series.map((s) => {
                const i = lastKnown(s.key);
                const v = i >= 0 ? points[i].values[s.key] : null;
                return v === null ? null : <circle key={s.key} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="#FFFFFF" strokeWidth={2} />;
              })}
              {active !== null && (
                <g pointerEvents="none">
                  <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="#0A3323" strokeOpacity={0.45} strokeWidth={1} />
                  {series.map((s) => {
                    const v = points[active].values[s.key];
                    return v === null ? null : <circle key={s.key} cx={x(active)} cy={y(v)} r={4} fill={s.color} stroke="#FFFFFF" strokeWidth={2} />;
                  })}
                </g>
              )}
            </svg>
          )}
          {activePoint && (
            <div
              role="status"
              className="absolute top-0 pointer-events-none bg-white border border-[#839958]/40 shadow-soft rounded px-3 py-2 text-xs w-40"
              style={{ left: tooltipLeft }}
            >
              <p className="text-[#0A3323]/60 mb-1">{fmtPoint(activePoint, bucket)}</p>
              {series.map((s) => {
                const v = activePoint.values[s.key];
                return (
                  <p key={s.key} className="flex items-center gap-2">
                    <span className="inline-block w-3 h-0.5 rounded shrink-0" style={{ background: s.color }} aria-hidden />
                    <span className="font-semibold text-[#0A3323] tabular-nums">{v === null ? "—" : v.toLocaleString("en-IN")}</span>
                    <span className="text-[#0A3323]/70 truncate">{v === null ? `${s.label} (not tracked)` : s.label}</span>
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
