// Unit tests for lib/admin/email-status.ts — the admin "Email" verification label.
// Pure function: no database, no running app. Run with: node --test scripts/test-email-status.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { emailVerificationLabel } from "../lib/admin/email-status.ts";

test("a confirmed email reads as verified", () => {
  assert.equal(emailVerificationLabel(true), "Verified ✓");
});

test("an unconfirmed email reads as not verified", () => {
  assert.equal(emailVerificationLabel(false), "Not verified");
});

test("a failed lookup (null/undefined) reads as Unknown — never as 'Not verified'", () => {
  assert.equal(emailVerificationLabel(null), "Unknown");
  assert.equal(emailVerificationLabel(undefined), "Unknown");
  assert.notEqual(emailVerificationLabel(null), "Not verified");
});
