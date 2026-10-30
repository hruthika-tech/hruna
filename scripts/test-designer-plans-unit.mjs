// Unit tests for lib/subscriptions/plans.ts — plan keys, reading the database's plan_limit errors,
// the messages designers see, the API's room pre-check, analytics ranges per plan, and trial
// error reasons. No database, no app. Run with: node --test scripts/test-designer-plans-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNER_PLAN_KEYS,
  PLAN_NAMES,
  TRIAL_DAYS,
  analyticsRangesFor,
  formatLimit,
  hasRoomFor,
  isDuplicateProposalError,
  isPaidPlanKey,
  parsePlanLimitError,
  planLimitMessage,
  trialNotEligibleReason,
  validatePlanEdit,
  isPlansNotReadyError,
  PLANS_NOT_READY_ENTITLEMENTS,
} from "../lib/subscriptions/plans.ts";

const FREE = { dresses: 5, collections: 3, previous_creations: 10, highlights: 3, meet_entries: 2, proposals_per_month: 5, analytics_max_days: 7, analytics_comparison: false };
const PRO = { dresses: null, collections: null, previous_creations: null, highlights: 3, meet_entries: 2, proposals_per_month: null, analytics_max_days: 90, analytics_comparison: true };
const usage = (u = {}) => ({ dresses: 0, collections: 0, previous_creations: 0, highlights: 0, meet_entries: 0, proposals_this_month: 0, ...u });

test("exactly three designer plans; only Plus and Pro can be bought; a 14-day trial", () => {
  assert.deepEqual([...DESIGNER_PLAN_KEYS], ["designer_free", "designer_plus", "designer_pro"]);
  assert.deepEqual(PLAN_NAMES, { designer_free: "Free", designer_plus: "Designer Plus", designer_pro: "Designer Pro" });
  assert.equal(isPaidPlanKey("designer_plus"), true);
  assert.equal(isPaidPlanKey("designer_pro"), true);
  for (const k of ["designer_free", "pro", "", null, undefined, "customer"]) assert.equal(isPaidPlanKey(k), false, String(k));
  assert.equal(TRIAL_DAYS, 14);
});

test("the database's plan_limit error is read back exactly", () => {
  assert.deepEqual(parsePlanLimitError({ code: "P0001", message: "plan_limit:dresses:5:designer_free" }), { resource: "dresses", limit: 5, planKey: "designer_free" });
  assert.deepEqual(parsePlanLimitError({ message: "plan_limit:proposals_per_month:25:designer_plus" }), { resource: "proposals_per_month", limit: 25, planKey: "designer_plus" });
  assert.deepEqual(parsePlanLimitError({ message: "plan_limit:analytics_days:7:designer_free" }), { resource: "analytics_days", limit: 7, planKey: "designer_free" });
  for (const bad of [null, "plan_limit:dresses:5:designer_free", { message: "plan_limit:unknown:5:x" }, { message: "something else" }, { code: "P0001" }]) {
    assert.equal(parsePlanLimitError(bad), null, JSON.stringify(bad));
  }
});

test("messages name the plan and the limit, and promise nothing is removed", () => {
  assert.match(planLimitMessage("dresses", 5, "designer_free"), /Free plan includes up to 5 dress listings.*everything you already have stays/);
  assert.match(planLimitMessage("collections", 1, "designer_plus"), /Designer Plus plan includes up to 1 collection\./);
  assert.match(planLimitMessage("proposals_per_month", 5, "designer_free"), /5 proposals per calendar month.*next month/);
  assert.match(planLimitMessage("analytics_days", 7, "designer_free"), /7 days of analytics/);
});

test("room pre-check: limits apply only while plans are on; null = unlimited; proposals use this month's count", () => {
  assert.equal(hasRoomFor({ enforced: true, limits: FREE, usage: usage({ dresses: 4 }) }, "dresses"), true);
  assert.equal(hasRoomFor({ enforced: true, limits: FREE, usage: usage({ dresses: 5 }) }, "dresses"), false);
  assert.equal(hasRoomFor({ enforced: true, limits: FREE, usage: usage({ dresses: 9 }) }, "dresses"), false, "over the limit after a downgrade");
  assert.equal(hasRoomFor({ enforced: false, limits: FREE, usage: usage({ dresses: 50 }) }, "dresses"), true, "plans off → no limit");
  assert.equal(hasRoomFor({ enforced: true, limits: PRO, usage: usage({ dresses: 5000, collections: 900 }) }, "collections"), true);
  assert.equal(hasRoomFor({ enforced: true, limits: FREE, usage: usage({ proposals_this_month: 5 }) }, "proposals_per_month"), false);
  assert.equal(hasRoomFor({ enforced: true, limits: FREE, usage: usage({ proposals_this_month: 4 }) }, "proposals_per_month"), true);
  assert.equal(hasRoomFor({ enforced: true, limits: FREE, usage: usage({ highlights: 3 }) }, "highlights"), false);
  assert.equal(hasRoomFor({ enforced: true, limits: PRO, usage: usage({ meet_entries: 2 }) }, "meet_entries"), false, "same on every plan");
});

test("analytics ranges per plan", () => {
  assert.deepEqual(analyticsRangesFor(FREE, true, [7, 30, 90]), [7]);
  assert.deepEqual(analyticsRangesFor(PRO, true, [7, 30, 90]), [7, 30, 90]);
  assert.deepEqual(analyticsRangesFor(FREE, false, [7, 30, 90]), [7, 30, 90]);
  assert.deepEqual(analyticsRangesFor({ analytics_max_days: null }, true, [7, 30, 90]), [7, 30, 90]);
});

test("trial and duplicate-proposal errors from the database", () => {
  assert.equal(trialNotEligibleReason({ message: "trial_not_eligible: the free trial has already been used" }), "The free trial has already been used.");
  assert.equal(trialNotEligibleReason({ message: "something else" }), null);
  assert.equal(isDuplicateProposalError({ message: "duplicate_proposal: you have already sent a proposal for this request" }), true);
  assert.equal(isDuplicateProposalError({ message: "plan_limit:dresses:5:designer_free" }), false);
  assert.equal(formatLimit(null), "Unlimited");
  assert.equal(formatLimit(25), "25");
});

test("admin plan edits: valid edits pass through (null = unlimited), invalid ones are refused", () => {
  const ok = validatePlanEdit({ name: " Designer Plus ", price: 249, features: ["a", " b "], isActive: true, limits: { dresses: null, proposals_per_month: 30, analytics_max_days: 30, analytics_comparison: true } }, "designer_plus");
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: "Designer Plus", price: 249, features: ["a", "b"], isActive: true, limits: { dresses: null, proposals_per_month: 30, analytics_max_days: 30, analytics_comparison: true } });
  assert.equal(validatePlanEdit({ price: 0, name: "Free" }, "designer_free").ok, true);
  const bad = [
    [{ price: 1 }, "designer_free"], [{ isActive: false }, "designer_free"], [{ price: 0 }, "designer_pro"],
    [{ price: -5 }, "designer_plus"], [{ price: 1.005 }, "designer_plus"], [{ price: "199" }, "designer_plus"], [{ price: 100001 }, "designer_plus"],
    [{ name: "" }, "designer_plus"], [{ name: "x".repeat(61) }, "designer_plus"], [{ description: "x".repeat(301) }, "designer_plus"],
    [{ features: "a" }, "designer_plus"], [{ features: [""] }, "designer_plus"], [{ features: Array(13).fill("f") }, "designer_plus"],
    [{ isActive: "yes" }, "designer_plus"], [{ limits: null }, "designer_plus"], [{ limits: { dresses: 1.5 } }, "designer_plus"],
    [{ limits: { dresses: -1 } }, "designer_plus"], [{ limits: { dresses: 100001 } }, "designer_plus"], [{ limits: { analytics_max_days: 14 } }, "designer_plus"],
    [{ limits: { analytics_max_days: null } }, "designer_plus"], [{ limits: { analytics_comparison: 1 } }, "designer_plus"],
    [{ limits: { highlights: 5 } }, "designer_plus"], [{ limits: { meet_entries: 5 } }, "designer_plus"], [{}, "designer_plus"], [null, "designer_plus"],
  ];
  for (const [edit, key] of bad) assert.equal(validatePlanEdit(edit, key).ok, false, JSON.stringify(edit));
});

test("missing plan migrations are recognised and fall back to the unrestricted pre-plans behaviour", () => {
  for (const e of [{ code: "PGRST202" }, { code: "42883" }, { code: "42703" }, { code: "PGRST204" }, { message: "Could not find the function public.my_designer_entitlements without parameters in the schema cache" }, { message: "column subscription_plans.plan_key does not exist" }]) {
    assert.equal(isPlansNotReadyError(e), true, JSON.stringify(e));
  }
  for (const e of [null, {}, { code: "42501", message: "permission denied" }, { message: "plan_limit:dresses:5:designer_free" }]) assert.equal(isPlansNotReadyError(e), false, JSON.stringify(e));
  assert.equal(PLANS_NOT_READY_ENTITLEMENTS.enforced, false);
  assert.equal(hasRoomFor(PLANS_NOT_READY_ENTITLEMENTS, "dresses"), true);
  assert.deepEqual(analyticsRangesFor(PLANS_NOT_READY_ENTITLEMENTS.limits, false, [7, 30, 90]), [7, 30, 90]);
});
