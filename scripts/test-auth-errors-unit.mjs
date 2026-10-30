// Unit tests for lib/auth/auth-errors.ts — sign-in / password-reset error classification, using the
// real auth-js error classes so names and statuses match what supabase-js throws. No database, no
// app. Run with: node --test scripts/test-auth-errors-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthApiError, AuthRetryableFetchError, AuthUnknownError } from "@supabase/supabase-js";
import { authErrorLogFields, classifyAuthError } from "../lib/auth/auth-errors.ts";

test("wrong credentials and unconfirmed email are the only 'your details' outcomes", () => {
  assert.equal(classifyAuthError(new AuthApiError("Invalid login credentials", 400, "invalid_credentials")), "invalid_credentials");
  assert.equal(classifyAuthError(new AuthApiError("Email not confirmed", 400, "email_not_confirmed")), "email_not_confirmed");
});

test("database, network and configuration failures are 'unavailable', never 'incorrect password'", () => {
  // What GoTrue answered while the local database was being rebuilt (seen in its log).
  assert.equal(classifyAuthError(new AuthApiError("Database error querying schema", 500, "unexpected_failure")), "unavailable");
  assert.equal(classifyAuthError(new AuthRetryableFetchError("fetch failed", 0)), "unavailable");
  assert.equal(classifyAuthError(new AuthRetryableFetchError("Bad gateway", 502)), "unavailable");
  assert.equal(classifyAuthError(new AuthUnknownError("Unexpected token <", new Error("x"))), "unavailable");
  assert.equal(classifyAuthError(new Error("getaddrinfo ENOTFOUND")), "unavailable");
  assert.equal(classifyAuthError(null), "unavailable");
});

test("rate limits are recognised by status or code", () => {
  assert.equal(classifyAuthError(new AuthApiError("Too many requests", 429, "over_request_rate_limit")), "rate_limited");
  assert.equal(classifyAuthError(new AuthApiError("Email rate limit exceeded", 429, "over_email_send_rate_limit")), "rate_limited");
});

test("an email-send failure is kept apart (the reset route must not reveal it)", () => {
  assert.equal(classifyAuthError(new AuthApiError("Error sending recovery email", 500, "unexpected_failure")), "email_send_failed");
});

test("other 4xx rejections are neither 'incorrect password' nor 'unavailable'", () => {
  assert.equal(classifyAuthError(new AuthApiError("Unable to validate email address: invalid format", 400, "validation_failed")), "rejected");
  assert.equal(classifyAuthError(new AuthApiError("User is banned", 400, "user_banned")), "rejected");
});

test("log fields carry no secrets beyond the error itself", () => {
  const f = authErrorLogFields(new AuthApiError("Database error querying schema", 500, "unexpected_failure"));
  assert.deepEqual(Object.keys(f).sort(), ["code", "message", "name", "status"]);
  assert.equal(f.status, 500);
});
