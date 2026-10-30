// Unit tests for lib/supabase/schema-readiness.ts — recognising "not migrated yet" errors so analytics,
// withdrawal and request deletion fall back cleanly on a database without their migrations.
// No database, no app. Run with: node --test scripts/test-schema-readiness-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingSchemaObject } from "../lib/supabase/schema-readiness.ts";

test("missing functions, tables and columns are recognised (PostgREST and Postgres codes)", () => {
  for (const e of [
    { code: "PGRST202", message: "Could not find the function public.designer_analytics(p_end, p_start) in the schema cache" },
    { code: "PGRST205", message: "Could not find the table 'public.project_withdrawals' in the schema cache" },
    { code: "PGRST204", message: "Could not find the 'plan_key' column of 'subscription_plans' in the schema cache" },
    { code: "42883", message: "function public.cancel_request(uuid) does not exist" },
    { code: "42P01", message: 'relation "public.analytics_events" does not exist' },
    { code: "42703", message: "column subscription_plans.plan_key does not exist" },
    { message: 'relation "public.project_withdrawals" does not exist' },
  ]) {
    assert.equal(isMissingSchemaObject(e), true, JSON.stringify(e));
  }
});

test("ordinary failures are not mistaken for a missing migration", () => {
  for (const e of [
    null,
    undefined,
    "boom",
    {},
    { code: "42501", message: "permission denied for table projects" },
    { code: "P0001", message: "Request not found" },
    { code: "23505", message: "duplicate key value violates unique constraint" },
    { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    new Error("fetch failed"),
  ]) {
    assert.equal(isMissingSchemaObject(e), false, JSON.stringify(e));
  }
});
