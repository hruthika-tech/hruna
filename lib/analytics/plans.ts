// What a designer's analytics include, derived from their subscription plan (lib/subscriptions/
// plans.ts; limits stored on the plan rows and enforced again inside public.designer_analytics()):
//   Free: the 7-day range, no previous-period comparison (it would reveal older history).
//   Designer Plus / Designer Pro: 7, 30 and 90 days, with comparisons.
// While plans aren't switched on (payment_settings), nothing is restricted.
// The API and the dashboard read only this object.

// Type-only imports, so this module has no runtime dependencies (unit tests load it directly).
import type { RangeDays } from "./ranges";
import type { DesignerEntitlements, DesignerPlanKey } from "../subscriptions/plans";

export interface AnalyticsEntitlement {
  /** The plan these analytics follow, or "unrestricted" while plans are off. */
  tier: DesignerPlanKey | "unrestricted";
  /** Date-range presets the designer may select. */
  ranges: readonly RangeDays[];
  /** Per-listing breakdown (top dresses by views) — part of every plan. */
  topListings: boolean;
  /** Comparison with the previous equivalent period. */
  periodComparison: boolean;
}

const ALL_PRESETS: readonly RangeDays[] = [7, 30, 90]; // every preset in ranges.ts (asserted by the unit tests)

export function getAnalyticsEntitlement(ent: Pick<DesignerEntitlements, "enforced" | "plan_key" | "limits">): AnalyticsEntitlement {
  if (!ent.enforced) return { tier: "unrestricted", ranges: ALL_PRESETS, topListings: true, periodComparison: true };
  const max = ent.limits.analytics_max_days;
  return {
    tier: ent.plan_key,
    ranges: max === null ? ALL_PRESETS : ALL_PRESETS.filter((d) => d <= max),
    topListings: true,
    periodComparison: ent.limits.analytics_comparison,
  };
}
