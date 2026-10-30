// Designer plans — shared, isomorphic definitions (no runtime imports; unit-tested directly).
//
// The limits themselves live in the database (subscription_plans rows, migration
// 20261029000001_designer_subscription_plans.sql) and are enforced there by triggers; this module
// only describes them for the API and UI: plan keys, how a database "plan_limit" error is read, and
// which analytics ranges a plan allows. null always means "unlimited".

export const DESIGNER_PLAN_KEYS = ["designer_free", "designer_plus", "designer_pro"] as const;
export type DesignerPlanKey = (typeof DESIGNER_PLAN_KEYS)[number];
export const PAID_PLAN_KEYS = ["designer_plus", "designer_pro"] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];

export const isDesignerPlanKey = (v: unknown): v is DesignerPlanKey => DESIGNER_PLAN_KEYS.includes(v as DesignerPlanKey);
export const isPaidPlanKey = (v: unknown): v is PaidPlanKey => PAID_PLAN_KEYS.includes(v as PaidPlanKey);

export const TRIAL_DAYS = 14;

export type LimitedResource = "dresses" | "collections" | "previous_creations" | "highlights" | "meet_entries" | "proposals_per_month" | "analytics_days";

export interface PlanLimits {
  dresses: number | null;
  collections: number | null;
  previous_creations: number | null;
  highlights: number | null;
  meet_entries: number | null;
  proposals_per_month: number | null;
  analytics_max_days: number | null;
  analytics_comparison: boolean;
}

/** Shape returned by public.my_designer_entitlements(). */
export interface DesignerEntitlements {
  enforced: boolean;
  plan_key: DesignerPlanKey;
  is_trial: boolean;
  ends_at: string | null;
  trial_used: boolean;
  approved: boolean;
  limits: PlanLimits;
  usage: { dresses: number; collections: number; previous_creations: number; highlights: number; meet_entries: number; proposals_this_month: number };
  month_start: string;
}

const NOUN: Record<LimitedResource, [string, string]> = {
  dresses: ["dress listing", "dress listings"],
  collections: ["collection", "collections"],
  previous_creations: ["previous creation", "previous creations"],
  highlights: ["studio highlight", "studio highlights"],
  meet_entries: ["Meet the Designer entry", "Meet the Designer entries"],
  proposals_per_month: ["proposal this month", "proposals per calendar month"],
  analytics_days: ["day of analytics", "days of analytics"],
};

export const PLAN_NAMES: Record<DesignerPlanKey, string> = {
  designer_free: "Free",
  designer_plus: "Designer Plus",
  designer_pro: "Designer Pro",
};

export const PLAN_LIMIT_CODE = "plan_limit";

/** Parses the database's 'plan_limit:<resource>:<limit>:<plan_key>' error message. */
export function parsePlanLimitError(error: unknown): { resource: LimitedResource; limit: number; planKey: DesignerPlanKey | null } | null {
  if (typeof error !== "object" || error === null) return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const m = message.match(/plan_limit:([a-z_]+):(\d+):([a-z_]*)/);
  if (!m || !(m[1] in NOUN)) return null;
  return { resource: m[1] as LimitedResource, limit: Number(m[2]), planKey: isDesignerPlanKey(m[3]) ? m[3] : null };
}

/** The message a designer sees when a plan limit stops an action. */
export function planLimitMessage(resource: LimitedResource, limit: number, planKey: DesignerPlanKey | null): string {
  const plan = planKey ? PLAN_NAMES[planKey] : "current";
  const [one, many] = NOUN[resource];
  if (resource === "proposals_per_month") {
    return `Your ${plan} plan includes ${limit} ${limit === 1 ? "proposal" : "proposals"} per calendar month, and you've used them all. Upgrade your plan or wait until next month.`;
  }
  if (resource === "analytics_days") return `Your ${plan} plan includes ${limit} days of analytics.`;
  return `Your ${plan} plan includes up to ${limit} ${limit === 1 ? one : many}. Upgrade your plan to add more — everything you already have stays as it is.`;
}

/** Database messages for the always-on rules that aren't plan limits. */
export const isDuplicateProposalError = (error: unknown) =>
  typeof (error as { message?: unknown })?.message === "string" && (error as { message: string }).message.startsWith("duplicate_proposal");
export const trialNotEligibleReason = (error: unknown): string | null => {
  const message = (error as { message?: unknown })?.message;
  if (typeof message !== "string" || !message.startsWith("trial_not_eligible:")) return null;
  const reason = message.slice("trial_not_eligible:".length).trim();
  return reason.charAt(0).toUpperCase() + reason.slice(1) + ".";
};

/** Analytics presets a plan allows: every preset up to its history; all of them when unlimited or
 *  while plans aren't switched on. */
export function analyticsRangesFor(limits: Pick<PlanLimits, "analytics_max_days">, enforced: boolean, presets: readonly number[]): number[] {
  if (!enforced || limits.analytics_max_days === null) return [...presets];
  return presets.filter((d) => d <= limits.analytics_max_days!);
}

/** Whether one more of `resource` fits (used for the API's friendly pre-check; the database trigger
 *  is what actually guarantees it). */
export function hasRoomFor(ent: Pick<DesignerEntitlements, "enforced" | "limits" | "usage">, resource: Exclude<LimitedResource, "analytics_days">): boolean {
  if (!ent.enforced) return true;
  const limit = ent.limits[resource];
  if (limit === null) return true;
  const used = resource === "proposals_per_month" ? ent.usage.proposals_this_month : ent.usage[resource];
  return used < limit;
}

export const formatLimit = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString("en-IN"));

/** True when an error means the designer-plan migrations aren't on this database yet (a missing
 *  function or column). Code that depends on them then falls back to the pre-plans behaviour —
 *  nothing restricted, nothing sold — instead of failing designers' everyday actions. */
export function isPlansNotReadyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "PGRST202" || code === "42883" || code === "42703" || code === "PGRST204") return true;
  return typeof message === "string" && /(function|column) .*(does not exist|could not find)|could not find the function|schema cache/i.test(message);
}

/** Entitlements used while the plan migrations aren't applied: the old behaviour (no limits). */
export const PLANS_NOT_READY_ENTITLEMENTS: DesignerEntitlements = {
  enforced: false,
  plan_key: "designer_free",
  is_trial: false,
  ends_at: null,
  trial_used: false,
  approved: false,
  limits: { dresses: null, collections: null, previous_creations: null, highlights: null, meet_entries: null, proposals_per_month: null, analytics_max_days: null, analytics_comparison: true },
  usage: { dresses: 0, collections: 0, previous_creations: 0, highlights: 0, meet_entries: 0, proposals_this_month: 0 },
  month_start: "",
};

// --- Admin plan editing: what can change, and the bounds (validated server-side) ---------------
export const ADMIN_LIMIT_FIELDS = ["dresses", "collections", "previous_creations", "proposals_per_month"] as const;
export type AdminLimitField = (typeof ADMIN_LIMIT_FIELDS)[number];
export const ANALYTICS_DAY_OPTIONS = [7, 30, 90] as const;
export const MAX_PLAN_PRICE = 100000;
export const MAX_LIMIT_VALUE = 100000;
export const MAX_FEATURES = 12;
/** Highlights and Meet the Designer entries are the same on every plan (3 / 2) and also capped by
 *  their own APIs, so they're shown but not editable per plan. */
export const FIXED_STUDIO_LIMITS = { highlights: 3, meet_entries: 2 } as const;

export interface PlanEdit {
  name?: string;
  price?: number;
  description?: string;
  features?: string[];
  isActive?: boolean;
  limits?: Partial<Record<AdminLimitField, number | null>> & { analytics_max_days?: number; analytics_comparison?: boolean };
}

/** Validates an admin's plan edit. Returns the error message, or null when it's acceptable. */
export function validatePlanEdit(edit: unknown, planKey: DesignerPlanKey): { ok: true; value: PlanEdit } | { ok: false; message: string } {
  if (typeof edit !== "object" || edit === null) return { ok: false, message: "Send the fields to change." };
  const e = edit as Record<string, unknown>;
  const out: PlanEdit = {};
  if (e.name !== undefined) {
    if (typeof e.name !== "string" || !e.name.trim() || e.name.trim().length > 60) return { ok: false, message: "A plan name of 1–60 characters is required." };
    out.name = e.name.trim();
  }
  if (e.price !== undefined) {
    const p = e.price;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > MAX_PLAN_PRICE || Math.round(p * 100) !== p * 100) {
      return { ok: false, message: `Price must be between 0 and ${MAX_PLAN_PRICE}, with at most 2 decimals.` };
    }
    if (planKey === "designer_free" && p !== 0) return { ok: false, message: "The Free plan always costs ₹0." };
    if (planKey !== "designer_free" && p === 0) return { ok: false, message: "A paid plan needs a price above ₹0." };
    out.price = p;
  }
  if (e.description !== undefined) {
    if (typeof e.description !== "string" || e.description.length > 300) return { ok: false, message: "The description can be up to 300 characters." };
    out.description = e.description.trim();
  }
  if (e.features !== undefined) {
    if (!Array.isArray(e.features) || e.features.length > MAX_FEATURES || !e.features.every((f) => typeof f === "string" && f.trim().length > 0 && f.length <= 100)) {
      return { ok: false, message: `List up to ${MAX_FEATURES} features, each 1–100 characters.` };
    }
    out.features = (e.features as string[]).map((f) => f.trim());
  }
  if (e.isActive !== undefined) {
    if (typeof e.isActive !== "boolean") return { ok: false, message: "isActive must be true or false." };
    if (planKey === "designer_free" && !e.isActive) return { ok: false, message: "The Free plan can't be switched off — every designer falls back to it." };
    out.isActive = e.isActive;
  }
  if (e.limits !== undefined) {
    if (typeof e.limits !== "object" || e.limits === null) return { ok: false, message: "limits must be an object." };
    const l = e.limits as Record<string, unknown>;
    const limits: NonNullable<PlanEdit["limits"]> = {};
    for (const key of Object.keys(l)) {
      if ((ADMIN_LIMIT_FIELDS as readonly string[]).includes(key)) {
        const v = l[key];
        if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_LIMIT_VALUE)) {
          return { ok: false, message: `${key.replace(/_/g, " ")} must be a whole number from 0 to ${MAX_LIMIT_VALUE}, or unlimited.` };
        }
        limits[key as AdminLimitField] = v as number | null;
      } else if (key === "analytics_max_days") {
        if (!(ANALYTICS_DAY_OPTIONS as readonly unknown[]).includes(l[key])) return { ok: false, message: "Analytics history must be 7, 30 or 90 days." };
        limits.analytics_max_days = l[key] as number;
      } else if (key === "analytics_comparison") {
        if (typeof l[key] !== "boolean") return { ok: false, message: "analytics_comparison must be true or false." };
        limits.analytics_comparison = l[key] as boolean;
      } else {
        return { ok: false, message: `${key} can't be changed per plan.` };
      }
    }
    out.limits = limits;
  }
  if (Object.keys(out).length === 0) return { ok: false, message: "Nothing to update." };
  return { ok: true, value: out };
}
