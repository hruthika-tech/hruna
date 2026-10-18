// Unit tests for lib/auth/confirm-errors.ts — messages for failed email-confirmation links.
// Pure function: no database, no running app. Run with: node --test scripts/test-confirm-errors.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationErrorMessage } from "../lib/auth/confirm-errors.ts";

test("each known reason has a clear, actionable message", () => {
  assert.match(confirmationErrorMessage("expired"), /expired or has already been used/);
  assert.match(confirmationErrorMessage("invalid-link"), /isn't valid/);
  assert.match(confirmationErrorMessage("different-browser"), /same browser where the account was created/);
});

test("every message tells the user how to get a new link", () => {
  for (const r of ["expired", "invalid-link", "different-browser"]) {
    assert.match(confirmationErrorMessage(r), /fill in the form again/, r);
  }
});

test("missing or unknown reasons show nothing (no message injection from the URL)", () => {
  assert.equal(confirmationErrorMessage(undefined), null);
  assert.equal(confirmationErrorMessage(null), null);
  assert.equal(confirmationErrorMessage(""), null);
  assert.equal(confirmationErrorMessage("<script>alert(1)</script>"), null);
  assert.equal(confirmationErrorMessage("toString"), null);
});

test("a repeated ?error= param uses the first value", () => {
  assert.match(confirmationErrorMessage(["expired", "invalid-link"]), /expired/);
});
