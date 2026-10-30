#!/usr/bin/env node
/**
 * One-off maintenance tool: move the designer content an ADMIN account accidentally created
 * (before admins were blocked from the designer role) to a real, non-admin designer test account.
 * Nothing is deleted. DRY RUN by default — prints exactly what would change and writes nothing.
 *
 *   node scripts/transfer-admin-designer-content.mjs --mode=profile --to=<email>  [--apply --confirm-target=<db host>]
 *   node scripts/transfer-admin-designer-content.mjs --mode=content --to=<email>  [--apply --confirm-target=<db host>]
 *
 * NOT A TEST. It writes to whatever database .env.local names — which may be the LIVE project. Every
 * run prints the target host first; --apply additionally requires --confirm-target=<that exact host>
 * and is refused when HRUNA_TEST_* variables are set.
 *   optional: --from-designer=<designer_profiles.id>  (default: the single admin-owned profile)
 *
 * --mode=profile  Hands the WHOLE designer profile row (and everything hanging off it by
 *                 designer_id: onboarding, verification, collections, dresses, ...) to a user who
 *                 does NOT have a designer profile yet. designer_profiles.user_id is UNIQUE, so the
 *                 target can't already be a designer. Afterwards the admin owns no designer profile.
 * --mode=content  Moves only the collections + dresses (and the banner, if the target has none)
 *                 into an EXISTING non-admin designer profile. The admin's now-empty designer
 *                 profile (+ its onboarding/verification rows) is left in place — removing it would
 *                 be a deletion and is intentionally not done here.
 *
 * Image ownership is transferred consistently in both modes: every referenced `files` row owned
 * by the admin gets owner_id = target user, AND its storage object is moved from '<admin uid>/...'
 * to '<target uid>/...' (studio-images update/delete storage policies key on that folder, so the
 * new owner could otherwise never replace/remove these images). files.id never changes, so every
 * FK (banner_file_id, cover_image_file_id, dress_images.file_id) stays valid untouched.
 *
 * Uses the service-role key from .env.local (bypasses RLS) — run only by a maintainer.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  })
);
const APPLY = args.apply === true;
const MODE = args.mode;
const TO_EMAIL = typeof args.to === "string" ? args.to.trim().toLowerCase() : "";

function fail(msg) {
  console.error(`\n✗ ${msg}\nNothing was changed.`);
  process.exit(1);
}
if (!["profile", "content"].includes(MODE) || !TO_EMAIL) {
  fail("Usage: --mode=profile|content --to=<target email> [--from-designer=<id>] [--apply --confirm-target=<db host>]");
}

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
// Which database this run touches — .env.local may point at the HOSTED (live) project. --apply needs
// --confirm-target=<that exact host> typed out, and is refused inside a test run (HRUNA_TEST_* set),
// so it can't be mistaken for, or triggered as part of, an ordinary test operation.
let targetHost = "";
try {
  targetHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
} catch {
  fail("NEXT_PUBLIC_SUPABASE_URL in .env.local is missing or invalid.");
}
const targetIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(targetHost);
console.log(`\nTarget database: ${targetHost} — ${targetIsLocal ? "LOCAL development stack" : "HOSTED project (live data)"}`);
if (APPLY) {
  if (Object.keys(process.env).some((k) => k.startsWith("HRUNA_TEST_"))) {
    fail("--apply is refused while HRUNA_TEST_* variables are set: this maintenance tool is not part of the test suites.");
  }
  if (args["confirm-target"] !== targetHost) {
    fail(`--apply changes data in ${targetHost}${targetIsLocal ? "" : " (the LIVE database)"}. Re-run the dry run, check the planned changes, then add --confirm-target=${targetHost} to proceed.`);
  }
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- source (admin-owned profile)
const adminProfiles = await q(db.from("designer_profiles").select("id, user_id, studio_name, banner_file_id, avatar_file_id, users!inner(id, email, is_admin)").eq("users.is_admin", true));
const source = args["from-designer"] ? adminProfiles.find((p) => p.id === args["from-designer"]) : adminProfiles.length === 1 ? adminProfiles[0] : null;
if (!source) fail(adminProfiles.length === 0 ? "No admin-owned designer profile exists." : "Several (or no matching) admin-owned designer profiles — pass --from-designer=<id>.");
const D = source.id;
const ADMIN_UID = source.user_id;

const collections = await q(db.from("collections").select("id, name, cover_image_file_id").eq("designer_id", D));
const dresses = await q(db.from("dresses").select("id, name, collection_id").eq("designer_id", D));
const dressImages = dresses.length ? await q(db.from("dress_images").select("dress_id, file_id").in("dress_id", dresses.map((d) => d.id))) : [];
const blockers = {};
for (const t of ["studio_highlights", "meet_the_designer_entries", "previous_creations", "designer_portfolio_items", "proposals", "projects", "conversations", "reviews"]) {
  const { count } = await db.from(t).select("*", { count: "exact", head: true }).eq("designer_id", D);
  if (count) blockers[t] = count;
}

// ---------------------------------------------------------------- target
const targetUser = (await q(db.from("users").select("id, email, is_admin").eq("email", TO_EMAIL))).at(0);
if (!targetUser) fail(`No account with email ${TO_EMAIL}. Create it through the normal signup flow first — this tool never creates accounts.`);
if (targetUser.is_admin) fail("Target account is an admin — content must go to a non-admin designer account.");
if (targetUser.id === ADMIN_UID) fail("Target is the same account as the source.");
const { data: authUser } = await db.auth.admin.getUserById(targetUser.id);
if (!authUser?.user?.email_confirmed_at) fail("Target account hasn't confirmed its email yet.");
const targetProfile = (await q(db.from("designer_profiles").select("id, studio_name, banner_file_id").eq("user_id", targetUser.id))).at(0);

if (MODE === "profile" && targetProfile) fail(`Target already has a designer profile (${targetProfile.id}). designer_profiles.user_id is unique — use --mode=content instead.`);
if (MODE === "content" && !targetProfile) fail("Target has no designer profile — use --mode=profile instead.");
if (MODE === "content" && Object.keys(blockers).length) fail(`Source has content this mode doesn't move: ${JSON.stringify(blockers)}. Use --mode=profile.`);

// ---------------------------------------------------------------- files to re-home
const moveBanner = MODE === "profile" || (MODE === "content" && !targetProfile.banner_file_id);
const referencedFileIds = new Set([
  ...collections.map((c) => c.cover_image_file_id),
  ...dressImages.map((i) => i.file_id),
  ...(moveBanner ? [source.banner_file_id] : []),
  ...(MODE === "profile" ? [source.avatar_file_id] : []),
].filter(Boolean));
const files = referencedFileIds.size ? await q(db.from("files").select("id, entity_type, bucket_id, storage_path, owner_id").in("id", [...referencedFileIds])) : [];
const fileMoves = files
  .filter((f) => f.owner_id === ADMIN_UID)
  .map((f) => ({ ...f, newPath: f.storage_path.startsWith(`${ADMIN_UID}/`) ? `${targetUser.id}/${f.storage_path.slice(ADMIN_UID.length + 1)}` : f.storage_path }));

// ---------------------------------------------------------------- plan
console.log(`\n${APPLY ? "APPLYING" : "DRY RUN (add --apply to perform)"} — mode=${MODE}`);
console.log(`Source designer profile: ${D} (owner ${source.users.email} / ${ADMIN_UID}, admin)`);
console.log(`Target account:          ${targetUser.email} / ${targetUser.id}${targetProfile ? `, designer profile ${targetProfile.id} "${targetProfile.studio_name}"` : ", no designer profile yet"}`);
console.log("\nPlanned changes:");
if (MODE === "profile") {
  console.log(`  designer_profiles ${D}: user_id ${ADMIN_UID} -> ${targetUser.id}`);
  console.log(`  (collections ${collections.length}, dresses ${dresses.length}, onboarding/verification rows stay attached by designer_id — unchanged)`);
} else {
  for (const c of collections) console.log(`  collections ${c.id} "${c.name}": designer_id ${D} -> ${targetProfile.id}`);
  for (const d of dresses) console.log(`  dresses ${d.id} "${d.name}": designer_id ${D} -> ${targetProfile.id} (collection_id unchanged)`);
  if (source.banner_file_id) {
    console.log(
      moveBanner
        ? `  designer_profiles ${targetProfile.id}: banner_file_id null -> ${source.banner_file_id};  designer_profiles ${D}: banner_file_id -> null`
        : `  banner: target already has one — the admin profile's banner stays where it is (not moved)`
    );
  }
  console.log(`  designer_profiles ${D} (now empty) stays owned by the admin — removing it needs a separate, confirmed deletion`);
}
for (const f of fileMoves) {
  console.log(`  files ${f.id} (${f.entity_type}): owner_id -> ${targetUser.id}; storage ${f.bucket_id}/${f.storage_path} -> ${f.newPath}`);
}
if (!APPLY) {
  console.log("\nNo changes made.");
  process.exit(0);
}

// ---------------------------------------------------------------- apply (files first, then rows)
const done = [];
try {
  for (const f of fileMoves) {
    if (f.newPath !== f.storage_path) {
      const { error } = await db.storage.from(f.bucket_id).move(f.storage_path, f.newPath);
      if (error) throw new Error(`storage move ${f.storage_path}: ${error.message}`);
    }
    const { error } = await db.from("files").update({ owner_id: targetUser.id, storage_path: f.newPath }).eq("id", f.id);
    if (error) {
      if (f.newPath !== f.storage_path) await db.storage.from(f.bucket_id).move(f.newPath, f.storage_path);
      throw new Error(`files ${f.id}: ${error.message}`);
    }
    done.push(f);
    console.log(`  ✓ file ${f.id}`);
  }

  if (MODE === "profile") {
    await q(db.from("designer_profiles").update({ user_id: targetUser.id }).eq("id", D).eq("user_id", ADMIN_UID).select("id"));
    console.log(`  ✓ designer profile ${D} now owned by ${targetUser.email}`);
  } else {
    await q(db.from("collections").update({ designer_id: targetProfile.id }).eq("designer_id", D).select("id"));
    await q(db.from("dresses").update({ designer_id: targetProfile.id }).eq("designer_id", D).select("id"));
    if (moveBanner && source.banner_file_id) {
      await q(db.from("designer_profiles").update({ banner_file_id: source.banner_file_id }).eq("id", targetProfile.id).select("id"));
      await q(db.from("designer_profiles").update({ banner_file_id: null }).eq("id", D).select("id"));
    }
    console.log(`  ✓ ${collections.length} collection(s), ${dresses.length} dress(es) now under ${targetProfile.id}`);
  }
  console.log("\nDone. Nothing was deleted.");
} catch (err) {
  console.error(`\n✗ Stopped: ${err.message}`);
  console.error(`Files already re-homed before the failure (safe — their ids are unchanged): ${done.map((f) => f.id).join(", ") || "none"}`);
  console.error("Re-run the same command to continue; already-moved files are skipped automatically.");
  process.exit(1);
}
