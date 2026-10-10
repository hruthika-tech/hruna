// Unit tests for lib/auth/safe-redirect.ts — the /login `?next=` open-redirect guard.
// Pure function: no database, no running app. Run with: node --test scripts/test-safe-redirect.mjs
// (Node 22.6+/24 runs the .ts module directly via built-in type stripping.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../lib/auth/safe-redirect.ts";

test("keeps valid same-site relative paths (incl. query + hash)", () => {
  assert.equal(safeNextPath("/home"), "/home");
  assert.equal(safeNextPath("/admin"), "/admin");
  assert.equal(safeNextPath("/designer/studio/manage"), "/designer/studio/manage");
  assert.equal(safeNextPath("/requests/71000000-0000-0000-0000-000000000001?tab=proposals#top"), "/requests/71000000-0000-0000-0000-000000000001?tab=proposals#top");
});

test("falls back to /home when next is missing or empty", () => {
  assert.equal(safeNextPath(null), "/home");
  assert.equal(safeNextPath(undefined), "/home");
  assert.equal(safeNextPath(""), "/home");
});

test("rejects absolute external URLs", () => {
  for (const v of ["https://evil.example", "http://evil.example/home", "HTTPS://evil.example", "javascript:alert(1)", "data:text/html,hi", "evil.example"]) {
    assert.equal(safeNextPath(v), "/home", v);
  }
});

test("rejects protocol-relative //evil.example", () => {
  assert.equal(safeNextPath("//evil.example"), "/home");
  assert.equal(safeNextPath("//evil.example/home"), "/home");
  assert.equal(safeNextPath("///evil.example"), "/home");
});

test("rejects /\\evil.example and other backslash tricks", () => {
  assert.equal(safeNextPath("/\\evil.example"), "/home");
  assert.equal(safeNextPath("\\\\evil.example"), "/home");
  assert.equal(safeNextPath("/home\\..\\evil"), "/home");
});

test("rejects control-character tricks that browsers strip into //host", () => {
  assert.equal(safeNextPath("/\t/evil.example"), "/home");
  assert.equal(safeNextPath("/\n/evil.example"), "/home");
  assert.equal(safeNextPath(" /home"), "/home");
});

test("custom fallback is respected", () => {
  assert.equal(safeNextPath("https://evil.example", "/designer/home"), "/designer/home");
});
