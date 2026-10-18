// Unit tests for lib/auth/auth-flows.ts — telling signup, email-change and recovery links apart.
// Pure functions: no database, no running app. Run with: node --test scripts/test-auth-flow-resolve.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { authCallbackUrl, confirmPath, pickLinkParams, resolveAuthFlow, switchAccountPath } from "../lib/auth/auth-flows.ts";

const r = (flow, type, hasMessage = false) => resolveAuthFlow({ flow, type, hasMessage });

test("every flow's redirect URL carries its own explicit marker", () => {
  assert.equal(authCallbackUrl("https://hruna.example", "signup"), "https://hruna.example/auth/confirm?flow=signup");
  assert.equal(authCallbackUrl("http://localhost:3000/", "email_change"), "http://localhost:3000/auth/confirm?flow=email_change");
  assert.equal(authCallbackUrl("http://localhost:3000", "recovery"), "http://localhost:3000/auth/confirm?flow=recovery");
});

test("default-template links (?code= plus the flow marker, no type) resolve to the marked flow", () => {
  assert.deepEqual(r("signup", null), { ok: true, flow: "signup" });
  assert.deepEqual(r("email_change", null), { ok: true, flow: "email_change" });
  assert.deepEqual(r("recovery", null), { ok: true, flow: "recovery" });
});

test("token_hash links resolve from their type", () => {
  assert.deepEqual(r(null, "signup"), { ok: true, flow: "signup" });
  assert.deepEqual(r(null, "email"), { ok: true, flow: "signup" });
  assert.deepEqual(r(null, "invite"), { ok: true, flow: "signup" });
  assert.deepEqual(r(null, "email_change"), { ok: true, flow: "email_change" });
  assert.deepEqual(r(null, "recovery"), { ok: true, flow: "recovery" });
});

test("a signup is never read as an email change (the reported bug)", () => {
  assert.equal(r("signup", null).flow, "signup");
  assert.equal(r(null, null).flow, "signup"); // untagged legacy signup links
  assert.equal(r("signup", "signup").flow, "signup");
});

test("flow marker and token type that disagree are rejected, not guessed", () => {
  assert.deepEqual(r("signup", "recovery"), { ok: false, reason: "mismatch" });
  assert.deepEqual(r("signup", "email_change"), { ok: false, reason: "mismatch" });
  assert.deepEqual(r("email_change", "signup"), { ok: false, reason: "mismatch" });
  assert.deepEqual(r("recovery", "signup"), { ok: false, reason: "mismatch" });
});

test("unknown flows/types are rejected (no injection of arbitrary values)", () => {
  assert.deepEqual(r("admin", null), { ok: false, reason: "unknown" });
  assert.deepEqual(r(null, "magiclink"), { ok: false, reason: "unknown" });
  assert.deepEqual(r(null, "toString"), { ok: false, reason: "unknown" });
  assert.deepEqual(r("", null), { ok: false, reason: "unknown" });
});

test("legacy links still work: ?type=email_change tag, and the default email-change ?message= link", () => {
  assert.equal(r(null, "email_change").flow, "email_change");
  assert.equal(r(null, null, true).flow, "email_change");
  assert.equal(r("signup", null, true).flow, "signup"); // an explicit marker always wins over ?message=
});

test("the account-switch step carries only whitelisted link parameters (no open redirect / injection)", () => {
  const q = new URLSearchParams("token_hash=pkce_abc&type=signup&flow=signup&next=https://evil.example&redirect_to=//evil&x=1");
  const params = pickLinkParams((n) => q.get(n));
  assert.deepEqual(params, { token_hash: "pkce_abc", type: "signup", flow: "signup" });
  assert.equal(switchAccountPath(params), "/auth/switch-account?token_hash=pkce_abc&type=signup&flow=signup");
  assert.equal(confirmPath(params), "/auth/confirm?token_hash=pkce_abc&type=signup&flow=signup");
  // Always a relative path on this site.
  assert.ok(confirmPath({ code: "c" }).startsWith("/auth/confirm?"));
  // Values are URL-encoded, never able to add parameters of their own.
  assert.equal(confirmPath({ code: "a&flow=recovery" }), "/auth/confirm?code=a%26flow%3Drecovery");
  // Empty and oversized values are dropped.
  assert.deepEqual(pickLinkParams((n) => (n === "code" ? "" : n === "token_hash" ? "x".repeat(600) : null)), {});
});
