// Unit tests for lib/moderation/reports.ts — report reasons/statuses, input validation, admin review
// validation, and how a conversation's block state is shown. No database, no app.
// Run with: node --test scripts/test-moderation-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { chatBlockState, isReportReason, isReportStatus, validateReportInput, validateReview } from "../lib/moderation/reports.ts";

const ID = "9f1c2d3e-0000-4000-8000-000000000001";

test("the six report reasons and four statuses", () => {
  for (const r of ["harassment", "scam", "spam", "inappropriate", "impersonation", "other"]) assert.ok(isReportReason(r), r);
  for (const s of ["pending", "under_review", "resolved", "dismissed"]) assert.ok(isReportStatus(s), s);
  for (const v of ["", "abuse", "Spam", null, 1, "toString"]) assert.equal(isReportReason(v), false, String(v));
  for (const v of ["", "open", "closed", "Resolved", null]) assert.equal(isReportStatus(v), false, String(v));
});

test("a valid report is cleaned (trimmed, deduplicated evidence)", () => {
  const r = validateReportInput({ reason: "spam", description: "  repeated links  ", messageIds: [ID, ID] });
  assert.deepEqual(r, { ok: true, value: { reason: "spam", description: "repeated links", messageIds: [ID] } });
  assert.deepEqual(validateReportInput({ reason: "other" }), { ok: true, value: { reason: "other", description: null, messageIds: [] } });
  assert.equal(validateReportInput({ reason: "other", description: "   " }).value.description, null);
});

test("invalid reports are rejected with a reason", () => {
  assert.equal(validateReportInput({}).ok, false);
  assert.equal(validateReportInput({ reason: "nope" }).ok, false);
  assert.equal(validateReportInput({ reason: "spam", description: 42 }).ok, false);
  assert.equal(validateReportInput({ reason: "spam", description: "x".repeat(2001) }).ok, false);
  assert.equal(validateReportInput({ reason: "spam", messageIds: "not-an-array" }).ok, false);
  assert.equal(validateReportInput({ reason: "spam", messageIds: ["not-a-uuid"] }).ok, false);
  const tooMany = Array.from({ length: 21 }, (_, i) => `9f1c2d3e-0000-4000-8000-${String(i).padStart(12, "0")}`);
  assert.equal(validateReportInput({ reason: "spam", messageIds: tooMany }).ok, false);
});

test("admin reviews: valid status required; a decision is required to resolve or dismiss", () => {
  assert.deepEqual(validateReview({ status: "under_review" }), { ok: true, value: { status: "under_review", decision: null } });
  assert.equal(validateReview({ status: "resolved" }).ok, false);
  assert.equal(validateReview({ status: "dismissed", decision: "  " }).ok, false);
  assert.deepEqual(validateReview({ status: "resolved", decision: " warned " }), { ok: true, value: { status: "resolved", decision: "warned" } });
  assert.equal(validateReview({ status: "closed", decision: "x" }).ok, false);
  assert.equal(validateReview({ status: "resolved", decision: "x".repeat(2001) }).ok, false);
});

test("the blocked side is never told who blocked whom", () => {
  assert.equal(chatBlockState("blocked_by_me"), "blocked_by_me");
  assert.equal(chatBlockState("blocked_me"), "unavailable");
  assert.equal(chatBlockState("none"), "none");
  assert.equal(chatBlockState(null), "none");
  assert.equal(chatBlockState(undefined), "none");
});
