// Shared authentication helpers for the scripts/test-*.mjs suites — the current HRUNA flow:
//   • sign in:  POST /api/auth/login { email, password }  → Supabase signInWithPassword(), session cookies
//   • register: POST /api/auth/signup { name, email, password, confirmPassword } → Supabase signUp()
//               → confirmation email (local Mailpit) → GET /auth/confirm?token_hash=…&type=signup
//               → session cookies (redirect to /setup-password, password already set at signup)
// (The old /api/auth/otp/request + /otp/verify routes no longer exist.)
//
// LOCAL STACK ONLY. These suites create accounts and data, and several run SQL in the local DB
// container, so every entry point first calls assertLocalTestEnvironment(), which refuses to run
// unless both the Supabase URL and the app under test point at a loopback (local) stack.
//
// Required environment (nothing secret is hardcoded here):
//   HRUNA_TEST_SEED_PASSWORD        dev-only password of the accounts created by supabase/seed.sql
//   HRUNA_TEST_SUPABASE_ANON_KEY    local stack anon key (`npm run db:status`) — only needed by
//                                   suites that talk to Supabase directly (RLS / storage checks)
// Optional (defaults shown): HRUNA_TEST_APP_URL=http://localhost:3100,
//   HRUNA_TEST_SUPABASE_URL=http://127.0.0.1:54321, HRUNA_TEST_MAILPIT_URL=http://127.0.0.1:54324

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const APP_URL = process.env.HRUNA_TEST_APP_URL ?? "http://localhost:3100";
export const SUPABASE_URL = process.env.HRUNA_TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const MAILPIT_URL = process.env.HRUNA_TEST_MAILPIT_URL ?? "http://127.0.0.1:54324";

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`\n✗ Missing required environment variable ${name}. See scripts/lib/test-auth.mjs for the test setup.`);
    process.exit(2);
  }
  return value;
}

export const seedPassword = () => requireEnv("HRUNA_TEST_SEED_PASSWORD");
export const anonKey = () => requireEnv("HRUNA_TEST_SUPABASE_ANON_KEY");

/** A throwaway password for accounts a suite registers itself — random per run, meets
 *  lib/auth/password.ts (≥ 8 chars, a letter and a number). Not a secret: the account is local. */
export const FRESH_PASSWORD = `Test1-${randomUUID()}`;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const isLoopback = (url) => LOOPBACK.has(new URL(url).hostname);

let verified = false;
/** Refuses to run unless the app under test is wired to a LOCAL Supabase. Next.js inlines
 *  NEXT_PUBLIC_SUPABASE_URL into the browser bundle, so the app's own JS reveals which project it
 *  talks to — any hosted *.supabase.co reference aborts the run before anything is written. */
export async function assertLocalTestEnvironment() {
  if (verified) return;
  for (const [name, url] of [["HRUNA_TEST_APP_URL", APP_URL], ["HRUNA_TEST_SUPABASE_URL", SUPABASE_URL], ["HRUNA_TEST_MAILPIT_URL", MAILPIT_URL]]) {
    if (!isLoopback(url)) abort(`${name} (${url}) is not a local address.`);
  }
  let html;
  try {
    html = await (await fetch(`${APP_URL}/reset-password`)).text();
  } catch {
    abort(`The app is not reachable at ${APP_URL}. Start it against the local stack first.`);
  }
  // Match the VALUE the app passes for NEXT_PUBLIC_SUPABASE_URL (lib/supabase/config.ts calls
  // requireEnv("NEXT_PUBLIC_SUPABASE_URL", <inlined value>)) — not any "supabase.co" text, since
  // dev bundles keep supabase-js doc comments like "https://xyzcompany.supabase.co".
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => new URL(m[1], APP_URL).href);
  const configured = new Set();
  for (const src of scripts) {
    const js = await (await fetch(src)).text();
    for (const m of js.matchAll(/NEXT_PUBLIC_SUPABASE_URL\\*"\s*,\s*\\*"([^"\\]+)/g)) configured.add(m[1]);
  }
  if (configured.size === 0) abort("Could not determine which Supabase project the app under test uses.");
  for (const url of configured) {
    if (!/^https?:\/\//.test(url) || !isLoopback(url)) abort(`The app under test is connected to a non-local Supabase project (${new URL(url).host}).`);
  }
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`);
  } catch {
    abort(`Local Supabase is not reachable at ${SUPABASE_URL} (npm run db:start).`);
  }
  verified = true;
}

function abort(message) {
  console.error(`\n✗ Refusing to run: ${message}\n  These suites only run against a local Supabase stack + an app started with its local env.`);
  process.exit(2);
}

export function cookiesFrom(res) {
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

/** Email + password sign-in through the app (POST /api/auth/login); returns the session cookie. */
export async function signInWithPassword(email, password = seedPassword()) {
  await assertLocalTestEnvironment();
  const res = await fetch(`${APP_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const cookie = cookiesFrom(res);
  if (!cookie) throw new Error(`login for ${email} returned no session cookie`);
  return cookie;
}

/** Polls Mailpit for the newest confirmation email to `email` and returns its token_hash. */
export async function confirmationTokenFor(email) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await (await fetch(`${MAILPIT_URL}/api/v1/messages?query=${encodeURIComponent(`to:${email}`)}&limit=1`)).json();
    if (search.messages?.length > 0) {
      const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${search.messages[0].ID}`)).json();
      const match = `${msg.HTML ?? ""} ${msg.Text ?? ""}`.match(/token_hash=([A-Za-z0-9_-]+)/);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No confirmation email found for ${email}`);
}

/** Registers a brand-new account through the real flow (signup → emailed confirmation link →
 *  /auth/confirm) and returns { cookie, password } for the now-confirmed, signed-in session. */
export async function registerAndConfirm(email, name = "Test User") {
  await assertLocalTestEnvironment();
  const res = await fetch(`${APP_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: FRESH_PASSWORD, confirmPassword: FRESH_PASSWORD }),
  });
  if (!res.ok) throw new Error(`signup failed for ${email}: ${res.status} ${await res.text()}`);
  const tokenHash = await confirmationTokenFor(email);
  const confirm = await fetch(`${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`, { redirect: "manual" });
  const location = confirm.headers.get("location") ?? "";
  if (!location.includes("/setup-password")) throw new Error(`email confirmation failed for ${email}: ${confirm.status} → ${location}`);
  const cookie = cookiesFrom(confirm);
  if (!cookie) throw new Error(`email confirmation for ${email} returned no session cookie`);
  return { cookie, password: FRESH_PASSWORD };
}

/** A supabase-js client carrying the SAME session as an app cookie (from signInWithPassword /
 *  registerAndConfirm) — for direct-to-PostgREST/storage checks that must bypass the app's routes.
 *  Handles @supabase/ssr's chunked auth cookie (sb-<ref>-auth-token[.0|.1…], "base64-" prefixed). */
export async function rawClientFromCookie(cookie) {
  const parts = cookie
    .split("; ")
    .map((c) => c.match(/^(sb-.*-auth-token)(?:\.(\d+))?=(.*)$/))
    .filter(Boolean)
    .sort((a, b) => Number(a[2] ?? 0) - Number(b[2] ?? 0));
  if (parts.length === 0) throw new Error("no Supabase auth cookie in the session cookie header");
  const raw = parts.map((m) => m[3]).join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64").toString("utf8"));
  const client = createClient(SUPABASE_URL, anonKey(), { auth: { persistSession: false } });
  const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) throw new Error(`setSession failed: ${error.message}`);
  return client;
}

/** A supabase-js client signed in directly against local Supabase (bypassing the app) — for
 *  suites that must prove RLS/storage policies hold even without the app's own routes. */
export async function signInDirect(email, password = seedPassword()) {
  await assertLocalTestEnvironment();
  const client = createClient(SUPABASE_URL, anonKey(), { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`direct sign-in failed for ${email}: ${error.message}`);
  return { client, userId: data.user.id };
}

/** Registers a brand-new account directly with Supabase Auth (signUp + confirmation token from
 *  Mailpit), returning a signed-in supabase-js client — for the PostgREST-only RLS suite. */
export async function registerDirect(email) {
  await assertLocalTestEnvironment();
  const client = createClient(SUPABASE_URL, anonKey(), { auth: { persistSession: false } });
  const { error: signUpError } = await client.auth.signUp({ email, password: FRESH_PASSWORD });
  if (signUpError) throw new Error(`direct signUp failed for ${email}: ${signUpError.message}`);
  const tokenHash = await confirmationTokenFor(email);
  const { data, error } = await client.auth.verifyOtp({ type: "signup", token_hash: tokenHash });
  if (error) throw new Error(`direct confirmation failed for ${email}: ${error.message}`);
  return { client, userId: data.user.id };
}
