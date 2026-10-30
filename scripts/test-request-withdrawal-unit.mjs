// Unit tests for lib/projects/withdrawal.ts and the deletion rules in lib/requests/lifecycle.ts.
// No database, no app. Run with: node --test scripts/test-request-withdrawal-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { isProjectWithdrawable, validateResponseReason, validateWithdrawalReason, withdrawalViewState } from "../lib/projects/withdrawal.ts";
import { isRequestDeletable, isRequestDeleted, isRequestOpenForProposals } from "../lib/requests/lifecycle.ts";
import { isProgressLocked } from "../lib/projects/progress-lock.ts";

test("only requests without a chosen designer can be deleted; deleted requests are closed", () => {
  for (const s of ["submitted", "proposal_received", "draft", "reviewed"]) assert.equal(isRequestDeletable(s), true, s);
  for (const s of ["accepted", "cancelled", "declined", "expired", "", null]) assert.equal(isRequestDeletable(s), false, String(s));
  assert.equal(isRequestDeleted("cancelled"), true);
  assert.equal(isRequestOpenForProposals("cancelled"), false);
});

test("withdrawal reasons: required, trimmed, bounded; response reasons optional", () => {
  assert.deepEqual(validateWithdrawalReason("  Event postponed  "), { ok: true, value: "Event postponed" });
  for (const r of ["", "   ", undefined, null, 5]) assert.equal(validateWithdrawalReason(r).ok, false, String(r));
  assert.equal(validateWithdrawalReason("x".repeat(1001)).ok, false);
  assert.deepEqual(validateResponseReason(undefined), { ok: true, value: null });
  assert.deepEqual(validateResponseReason("  "), { ok: true, value: null });
  assert.equal(validateResponseReason(3).ok, false);
});

test("eligibility: only unfinished projects; finished ones lock progress", () => {
  for (const s of ["active", "awaiting_confirmation", "on_hold"]) assert.equal(isProjectWithdrawable(s), true, s);
  for (const s of ["completed", "withdrawn", "cancelled"]) assert.equal(isProjectWithdrawable(s), false, s);
  assert.equal(isProgressLocked("withdrawn"), true);
  assert.equal(isProgressLocked("completed"), true);
  assert.equal(isProgressLocked("active"), false);
});

test("who can do what: the requester waits, only the other side responds", () => {
  const pending = [{ id: "w1", requestedByRole: "customer", reason: "r", status: "pending", responseReason: null, createdAt: "t", respondedAt: null }];
  assert.deepEqual(
    (({ mineIsPending, canRespond, canRequest }) => ({ mineIsPending, canRespond, canRequest }))(withdrawalViewState(pending, "customer", "active")),
    { mineIsPending: true, canRespond: false, canRequest: false }
  );
  assert.equal(withdrawalViewState(pending, "designer", "active").canRespond, true);
  assert.equal(withdrawalViewState(pending, "designer", "completed").canRespond, false);
  assert.equal(withdrawalViewState(pending, null, "active").canRespond, false);
  assert.equal(withdrawalViewState([], "designer", "active").canRequest, true);
  assert.equal(withdrawalViewState([], "designer", "withdrawn").canRequest, false);
});
