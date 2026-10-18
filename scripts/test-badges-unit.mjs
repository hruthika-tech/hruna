// Unit tests for the navbar unread badges' pure helpers (lib/badges/format.ts) and the notification
// key format (lib/notifications/keys.ts). No database, no app. Run: node --test scripts/test-badges-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCount, unreadLabel } from "../lib/badges/format.ts";
import { isNotificationKey } from "../lib/notifications/keys.ts";

test("no badge for zero, unknown or nonsense counts (never a fake number)", () => {
  for (const v of [0, -1, null, undefined, NaN, Infinity]) assert.equal(formatCount(v), null, String(v));
});

test("one, multiple and the 99+ cap", () => {
  assert.equal(formatCount(1), "1");
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(99), "99");
  assert.equal(formatCount(100), "99+");
  assert.equal(formatCount(12345), "99+");
});

test("accessible labels", () => {
  assert.equal(unreadLabel("Notifications", 3), "Notifications, 3 unread");
  assert.equal(unreadLabel("Messages", 5), "Messages, 5 unread");
  assert.equal(unreadLabel("Messages", 1), "Messages, 1 unread");
  assert.equal(unreadLabel("Messages", 250), "Messages, more than 99 unread");
  assert.equal(unreadLabel("Notifications", 0), "Notifications");
  assert.equal(unreadLabel("Notifications", null), "Notifications");
});

test("only real notification keys can be marked read", () => {
  for (const k of [
    "proposal-81000000-0000-0000-0000-000000000001",
    "update-abc",
    "completion-3adae9a4-3aff-4261-977b-beec303ed1fe-1792136465456",
    "request-71000000-0000-0000-0000-000000000001",
    "review-x1",
    "verification-approved-1760000000000",
  ]) assert.ok(isNotificationKey(k), k);
  // Chat messages are not notifications, so their keys are refused too.
  for (const k of ["message-9f1c2d3e-0000-4000-8000-000000000000", "", "proposal-", "admin-1", "proposal-<script>", "proposal-a b", `proposal-${"a".repeat(200)}`, 42, null, "message-1;drop"]) {
    assert.equal(isNotificationKey(k), false, String(k));
  }
});
