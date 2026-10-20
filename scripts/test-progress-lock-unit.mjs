// Unit tests for lib/projects/progress-lock.ts — which projects are locked, and recognising the
// database's lock error. No database, no app. Run with: node --test scripts/test-progress-lock-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { isProgressLocked, isProjectLockedDbError, PROJECT_LOCKED_CODE } from "../lib/projects/progress-lock.ts";

test("only a customer-approved (completed) project is locked", () => {
  assert.equal(isProgressLocked("completed"), true);
  for (const s of ["active", "awaiting_confirmation", "on_hold", "cancelled", "", null, undefined, "Completed"]) {
    assert.equal(isProgressLocked(s), false, String(s));
  }
});

test("the database lock error is recognised; other errors are not", () => {
  assert.equal(isProjectLockedDbError({ code: "42501", message: "project_progress_locked: this project's completion was approved…" }), true);
  assert.equal(isProjectLockedDbError({ code: "42501", message: "new row violates row-level security policy" }), false);
  assert.equal(isProjectLockedDbError({ code: "23505", message: "project_progress_locked: x" }), false);
  assert.equal(isProjectLockedDbError(null), false);
  assert.equal(isProjectLockedDbError("project_progress_locked"), false);
  assert.equal(PROJECT_LOCKED_CODE, "project_locked");
});
