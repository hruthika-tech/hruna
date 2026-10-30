import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Card, Delta } from "@/lib/analytics/metrics";
import { cn } from "@/lib/utils";

// One analytics overview card: label · value · comparison · supporting facts · honest empty state.
// Values use proportional figures (no tabular-nums at display size). Every metric here is
// "more is better", so up = success, down = error — always with an arrow and words, never color alone.

function DeltaLine({ delta, days, hideUnavailable }: { delta: Delta | null; days: number; hideUnavailable: boolean }) {
  if (!delta || (hideUnavailable && delta.kind === "unavailable")) return null;
  const vs = `vs previous ${days} days`;
  if (delta.kind === "unavailable") return <p className="text-xs text-[#0A3323]/60">{delta.reason}</p>;
  if (delta.kind === "same") {
    return (
      <p className="text-xs text-[#0A3323]/70 flex items-center gap-1">
        <Minus size={13} aria-hidden /> No change {vs}
      </p>
    );
  }
  if (delta.kind === "new") return <p className="text-xs text-[#0A3323]/70">New this period — none in the previous {days} days</p>;
  const up = delta.direction === "up";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={cn("text-xs flex items-center gap-1", up ? "text-emerald-700" : "text-error")}>
      <Icon size={14} aria-hidden />
      <span>
        {up ? "Up" : "Down"} {delta.percent}% <span className="text-[#0A3323]/60">{vs}</span>
      </span>
    </p>
  );
}

/** `compact` is the secondary row: same content (value, comparison, empty state, explanation), smaller.
 *  `hideUnavailable`: the page already states why comparisons are unavailable, once for all cards.
 *  `accent`: the moss top rule marking the headline metrics. */
export function StatTile({
  card,
  days,
  compact = false,
  hideUnavailable = false,
  accent = false,
}: {
  card: Card;
  days: number;
  compact?: boolean;
  hideUnavailable?: boolean;
  accent?: boolean;
}) {
  const shown = card.value === null ? "—" : card.unit === "percent" ? `${card.value}%` : card.value.toLocaleString("en-IN");
  return (
    <div className={cn("bg-white border border-[#839958]/30 rounded-md flex flex-col min-w-0", accent && "border-t-[3px] border-t-[#839958]", compact ? "p-4 gap-1.5" : "p-4 sm:p-5 gap-2")} data-testid={`analytics-card-${card.id}`}>
      <p className="text-sm text-[#0A3323]/70">{card.label}</p>
      <p className={cn("font-body font-semibold leading-none text-[#0A3323]", compact ? "text-2xl" : "text-[1.75rem] sm:text-[2rem]")} data-testid="analytics-card-value">
        {shown}
      </p>
      <DeltaLine delta={card.delta} days={days} hideUnavailable={hideUnavailable} />
      {card.empty && (
        <p className="text-xs text-[#0A3323]/75 bg-[#F7F4D5] rounded px-2 py-1.5" data-testid="analytics-card-empty">
          {card.empty}
        </p>
      )}
      <ul className="pt-1 flex flex-col gap-1 text-xs text-[#0A3323]/60">
        {card.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}
