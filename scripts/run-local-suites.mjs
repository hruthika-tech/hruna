#!/usr/bin/env node
// Runs the scripts/test-*.mjs suites against the LOCAL Supabase stack only. For each suite:
//   1. `supabase db reset`  (local Docker DB — refuses to run if the CLI is linked to a hosted project)
//   2. applies that suite's fixtures from supabase/test-fixtures/ inside the local DB container
//   3. runs the suite with the local URL/anon key (read from `supabase status`, never printed)
//
// Prereqs: Docker running, `npm run db:start`, and the app on :3100 started against the LOCAL stack
// (each suite also refuses to run otherwise — see scripts/lib/test-auth.mjs).
// Required env: HRUNA_TEST_SEED_PASSWORD (the dev-only password set by supabase/seed.sql).
// For test-phase8-payments also: HRUNA_TEST_RAZORPAY_KEY_ID (must be rzp_test_…),
// HRUNA_TEST_RAZORPAY_KEY_SECRET, HRUNA_TEST_RAZORPAY_WEBHOOK_SECRET — equal to the RAZORPAY_* values
// the local app under test runs with. Never live credentials.
// Usage: node scripts/run-local-suites.mjs [suite-name ...]   e.g. test-phase4-customer

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DB_CONTAINER = "supabase_db_lilirve-app";
const SUITES = [
  "test-phase3-auth", "test-phase3-rls", "test-phase4-customer", "test-phase5-designer", "test-phase6-admin",
  "test-phase7-audit", "test-phase8-payments", "test-phase9-integration", "test-phase10-security", "test-storage-uploads",
  "test-messages-ui",
];
const FIXTURES = {
  "test-phase4-customer": ["phase4-review.sql"],
  "test-phase6-admin": ["phase6-disputes.sql"],
  "test-phase8-payments": ["phase8-payments.sql"],
};

const fail = (m) => { console.error(`✗ ${m}`); process.exit(2); };
if (existsSync(join(ROOT, "supabase/.temp/project-ref"))) fail("The Supabase CLI is linked to a hosted project — refusing to reset anything.");
if (!process.env.HRUNA_TEST_SEED_PASSWORD) fail("Set HRUNA_TEST_SEED_PASSWORD (the dev-only password from supabase/seed.sql).");

const selected = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;
if (selected.includes("test-phase8-payments")) {
  const missing = ["HRUNA_TEST_RAZORPAY_KEY_ID", "HRUNA_TEST_RAZORPAY_KEY_SECRET", "HRUNA_TEST_RAZORPAY_WEBHOOK_SECRET"].filter((k) => !process.env[k]);
  if (missing.length) fail(`test-phase8-payments needs ${missing.join(", ")} (test-mode values matching the local app's RAZORPAY_*).`);
  if (!process.env.HRUNA_TEST_RAZORPAY_KEY_ID.startsWith("rzp_test_")) fail("HRUNA_TEST_RAZORPAY_KEY_ID must be a TEST-mode key id (rzp_test_…). Live credentials are never used by tests.");
}

let status = "";
try {
  status = execSync("npx supabase status -o env", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  fail("Local Supabase stack not running (npm run db:start).");
}
const kv = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="?([^"\r\n]*)"?$/gm)].map((m) => [m[1], m[2]]));
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(kv.API_URL ?? "") || !kv.ANON_KEY) fail("Local Supabase stack not running (npm run db:start).");
const logDir = join(ROOT, "scripts/.test-logs");
mkdirSync(logDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
for (const suite of selected) {
  if (!SUITES.includes(suite)) fail(`Unknown suite ${suite}`);
  execSync("npx supabase db reset", { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${kv.API_URL}/auth/v1/health`)).ok) break; } catch {}
    await sleep(1500);
  }
  for (const f of FIXTURES[suite] ?? []) {
    const sql = readFileSync(join(ROOT, "supabase/test-fixtures", f), "utf8");
    const r = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: sql, encoding: "utf8" });
    if (r.status !== 0) fail(`Fixture ${f} failed for ${suite}: ${r.stderr.trim()}`);
  }
  const run = spawnSync(process.execPath, [join("scripts", `${suite}.mjs`)], {
    cwd: ROOT, encoding: "utf8",
    env: { ...process.env, HRUNA_TEST_SUPABASE_URL: kv.API_URL, HRUNA_TEST_SUPABASE_ANON_KEY: kv.ANON_KEY },
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  writeFileSync(join(logDir, `${suite}.log`), output);
  const summary = output.match(/(\d+) passed, (\d+) failed/);
  results.push({ suite, exit: run.status, passed: summary ? +summary[1] : null, failed: summary ? +summary[2] : null });
  console.log(`${suite.padEnd(26)} exit=${run.status}  ${summary ? summary[0] : "no summary (see log)"}`);
}
const t = results.reduce((a, r) => ({ p: a.p + (r.passed ?? 0), f: a.f + (r.failed ?? 0) }), { p: 0, f: 0 });
console.log(`\nTotal: ${t.p} passed, ${t.f} failed. Logs: scripts/.test-logs/`);
process.exit(results.every((r) => r.exit === 0) ? 0 : 1);
