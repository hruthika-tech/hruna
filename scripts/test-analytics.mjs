// HRUNA — designer analytics end to end, against the LOCAL seeded stack:
//   tracking (validation, origin/JSON checks, bots, owner/admin exclusion, once-per-visitor-per-day,
//   network cap, designer always derived server-side), save events, RLS on analytics_events and
//   designer_analytics() for every role, the /api/designer/analytics contract (auth, ranges, exact
//   numbers against fixtures, comparisons, isolation between designers), and the dashboard UI in a
//   real browser (navigation, cards, charts, range filter, table view, no sideways scroll at
//   390/768/1280px, StrictMode-safe single view per page load).
// Seed: meera (approved designer d1…01, dress e2…01, collection e1…01), ramesh (designer d1…02),
// aanya (customer), admin. Adds its own fixtures; run on a freshly reset local stack.
// Prereqs: app on HRUNA_TEST_APP_URL (local), HRUNA_TEST_SEED_PASSWORD, HRUNA_TEST_SUPABASE_URL,
// HRUNA_TEST_SUPABASE_ANON_KEY, HRUNA_TEST_DB_CONTAINER. Run: node scripts/test-analytics.mjs

import { execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, SUPABASE_URL, anonKey, assertLocalTestEnvironment, signInDirect, signInWithPassword } from "./lib/test-auth.mjs";

await assertLocalTestEnvironment();
const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 500)}` : ""}`);
  }
};

// One line: Windows' cmd.exe would cut a multi-line command at the first newline.
const sql = (q) => execSync(`docker exec ${DB_CONTAINER} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "${q.replace(/\s*\n\s*/g, " ").replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const n = (q) => Number(sql(q).split("\n").pop());

const MEERA = "d1000000-0000-0000-0000-000000000001";
const RAMESH = "d1000000-0000-0000-0000-000000000002";
const PRIYA = "d1000000-0000-0000-0000-000000000003";
const DRESS = "e2000000-0000-0000-0000-000000000001";
const COLLECTION = "e1000000-0000-0000-0000-000000000001";
const AANYA_CUSTOMER = "c1000000-0000-0000-0000-000000000001";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const dayOffset = (d) => new Date(Date.parse(`${today}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

const cookieOf = (res, name) => (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${name}=`));
async function view(body, { cookie = "", ua = BROWSER_UA, origin = new URL(APP_URL).origin, ip, contentType = "application/json", raw } = {}) {
  const headers = { "content-type": contentType, cookie };
  if (ua !== null) headers["user-agent"] = ua;
  if (origin) headers.origin = origin;
  if (ip) headers["x-forwarded-for"] = ip;
  const res = await fetch(`${APP_URL}/api/analytics/view`, { method: "POST", headers, body: raw ?? JSON.stringify(body) });
  const vid = cookieOf(res, "hruna_vid");
  return { status: res.status, setCookie: vid ?? null, vid: vid ? vid.split(";")[0] : null };
}
const events = (where = "true") => n(`select count(*) from public.analytics_events where ${where}`);
async function api(path, cookie = "") {
  const res = await fetch(`${APP_URL}${path}`, { headers: { cookie }, redirect: "manual" });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, location: res.headers.get("location") ?? "" };
}

sql("delete from public.analytics_events");

console.log("\n=== Tracking endpoint: input validation and abuse controls ===");
{
  check("non-JSON body → 415", (await view(null, { contentType: "text/plain", raw: "type=studio" })).status === 415);
  check("unknown type → 400", (await view({ type: "collection", id: MEERA })).status === 400);
  check("malformed id → 400", (await view({ type: "studio", id: "not-a-uuid" })).status === 400);
  check("extra fields (e.g. a designerId to credit someone else) → 400", (await view({ type: "dress", id: DRESS, designerId: RAMESH })).status === 400);
  check("cross-origin POST → 403", (await view({ type: "studio", id: MEERA }, { origin: "https://evil.example" })).status === 403);
  const unknown = await view({ type: "studio", id: randomUUID() });
  check("unknown studio → 204 and nothing recorded", unknown.status === 204 && events() === 0);
  await view({ type: "studio", id: DRESS });
  check("a dress id sent as a studio is not credited to anyone", events() === 0);
  await view({ type: "studio", id: MEERA }, { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  await view({ type: "studio", id: MEERA }, { ua: "Mozilla/5.0 AppleWebKit/537.36 HeadlessChrome/130.0" });
  await view({ type: "studio", id: MEERA }, { ua: "" });
  await view({ type: "studio", id: MEERA }, { ua: null }); // fetch then sends its own "node" user agent
  check("crawlers, headless browsers, scripts and an empty user agent are not counted", events() === 0, sql("select event_type from public.analytics_events"));
}

console.log("\n=== Counting views ===");
let anonCookie;
{
  const first = await view({ type: "studio", id: MEERA }, { ip: "198.51.100.10" });
  anonCookie = first.vid;
  check("first signed-out studio view → 204 and a random first-party visitor cookie (httpOnly, scoped to /api/analytics)", first.status === 204 && /^hruna_vid=[0-9a-f-]{36}$/.test(first.vid ?? "") && /HttpOnly/i.test(first.setCookie) && /Path=\/api\/analytics/i.test(first.setCookie), first.setCookie);
  const row = sql(`select event_type, designer_id, target_id, coalesce(dress_id::text,'-'), visitor_key, coalesce(viewer_user_id::text,'-'), length(ip_hash), event_day from public.analytics_events`).split("|");
  check("recorded: studio_view for meera, hashed visitor key, no user id, hashed network, today's IST day", row[0] === "studio_view" && row[1] === MEERA && row[2] === MEERA && row[3] === "-" && /^c_[0-9a-f]{40}$/.test(row[4]) && row[5] === "-" && row[6] === "64" && row[7] === today, row);
  check("nothing personal stored: no IP, user agent or cookie value in the row", !sql("select row_to_json(e)::text from public.analytics_events e").match(/198\.51\.100\.10|Mozilla|hruna_vid/));
  for (let i = 0; i < 3; i++) await view({ type: "studio", id: MEERA }, { cookie: anonCookie, ip: "198.51.100.10" });
  check("the same visitor reloading 3× the same day → still 1 view", events("event_type='studio_view'") === 1);
  const again = await view({ type: "studio", id: MEERA }, { cookie: anonCookie });
  check("…and no new cookie is issued to a known visitor", again.setCookie === null);
  await view({ type: "studio", id: MEERA }, { ip: "198.51.100.11" });
  check("a different visitor → 2 views", events("event_type='studio_view'") === 2);
  await view({ type: "dress", id: DRESS }, { cookie: anonCookie });
  check("dress view → credited to the dress's designer (looked up server-side)", n(`select count(*) from public.analytics_events where event_type='dress_view' and designer_id='${MEERA}' and dress_id='${DRESS}' and target_id='${DRESS}'`) === 1);

  const meera = await signInWithPassword("meera@lilirve.dev");
  const before = events();
  await view({ type: "studio", id: MEERA }, { cookie: meera });
  await view({ type: "dress", id: DRESS }, { cookie: meera });
  check("the designer viewing their own studio and dress → not counted", events() === before);
  const admin = await signInWithPassword("admin@lilirve.dev");
  await view({ type: "studio", id: MEERA }, { cookie: admin });
  check("an admin's views → not counted", events() === before);

  const aanya = await signInWithPassword("aanya@lilirve.dev");
  await view({ type: "studio", id: MEERA }, { cookie: aanya });
  const aanyaUser = sql("select id from auth.users where email='aanya@lilirve.dev'");
  check("a signed-in customer's view → counted with their user id (for conversion) and a hashed key", n(`select count(*) from public.analytics_events where event_type='studio_view' and viewer_user_id='${aanyaUser}' and visitor_key like 'u\\_%'`) === 1);
  await view({ type: "studio", id: MEERA }, { cookie: `${aanya}; hruna_vid=${randomUUID()}` });
  check("…the same signed-in customer from another browser that day → still counted once", events("event_type='studio_view'") === 3);
  const ramesh = await signInWithPassword("ramesh@lilirve.dev");
  await view({ type: "studio", id: MEERA }, { cookie: ramesh });
  check("another designer viewing meera's studio → counted for meera", events("event_type='studio_view'") === 4);

  // Network cap: pre-fill 300 events today for one network (on priya's studio), then try one more.
  const capIp = "203.0.113.77";
  const capHash = createHash("sha256").update(`${capIp}|${today}|hruna-analytics-v1`).digest("hex");
  sql(`insert into public.analytics_events (event_type, designer_id, target_id, visitor_key, ip_hash, event_day) select 'studio_view', '${PRIYA}', '${PRIYA}', 'c_cap' || lpad(g::text, 20, '0'), '${capHash}', '${today}' from generate_series(1, 300) g`);
  const cappedBefore = events(`designer_id='${MEERA}'`);
  await view({ type: "studio", id: MEERA }, { ip: capIp });
  check("a network over its daily cap (300) → further views not counted", events(`designer_id='${MEERA}'`) === cappedBefore);
  sql(`delete from public.analytics_events where designer_id='${PRIYA}'`);
}

console.log("\n=== Save events ===");
{
  const aanya = await signInWithPassword("aanya@lilirve.dev");
  const toggle = async (itemType, itemId) => {
    const res = await fetch(`${APP_URL}/api/saved-items`, { method: "POST", headers: { "content-type": "application/json", cookie: aanya }, body: JSON.stringify({ itemType, itemId }) });
    return (await res.json()).saved;
  };
  // Start from "not saved".
  for (const [t, id] of [["dress", DRESS], ["collection", COLLECTION]]) {
    if (n(`select count(*) from public.customer_saved_items where customer_id='${AANYA_CUSTOMER}' and ${t}_id='${id}'`) > 0) await toggle(t, id);
  }
  const saved = await toggle("dress", DRESS);
  check("saving a dress still works and records one item_saved for its designer", saved === true && events(`event_type='item_saved' and designer_id='${MEERA}' and dress_id='${DRESS}'`) === 1);
  const unsaved = await toggle("dress", DRESS);
  const resaved = await toggle("dress", DRESS);
  check("unsave + save again the same day → still 1 save event; the save itself toggles normally", unsaved === false && resaved === true && events("event_type='item_saved'") === 1);
  await toggle("collection", COLLECTION);
  check("saving a collection → credited to the collection's designer", events(`event_type='item_saved' and designer_id='${MEERA}' and target_id='${COLLECTION}'`) === 1);
  check("unsaving never records anything", (await toggle("collection", COLLECTION)) === false && events("event_type='item_saved'") === 2);
  await toggle("collection", COLLECTION); // leave it saved for the snapshot count
}

console.log("\n=== Database access (RLS / grants) ===");
{
  const anon = createClient(SUPABASE_URL, anonKey(), { auth: { persistSession: false } });
  const a1 = await anon.from("analytics_events").select("*").limit(1);
  const a2 = await anon.from("analytics_events").insert({ event_type: "studio_view", designer_id: MEERA, target_id: MEERA, visitor_key: "c_" + "x".repeat(40) });
  const a3 = await anon.rpc("designer_analytics", { p_start: dayOffset(-6), p_end: today });
  check("signed-out: can't read, write, or call designer_analytics()", !!a1.error && !!a2.error && !!a3.error, { r: a1.error?.code, w: a2.error?.code, f: a3.error?.code });

  const { client: customer } = await signInDirect("aanya@lilirve.dev");
  const c1 = await customer.from("analytics_events").select("*").limit(1);
  const c2 = await customer.from("analytics_events").insert({ event_type: "studio_view", designer_id: MEERA, target_id: MEERA, visitor_key: "c_" + "y".repeat(40) });
  const c3 = await customer.rpc("designer_analytics", { p_start: dayOffset(-6), p_end: today });
  check("customer: can't read or insert events, and designer_analytics() refuses (42501)", !!c1.error && !!c2.error && c3.error?.code === "42501", { r: c1.error?.code, w: c2.error?.code, f: c3.error?.code });

  const { client: meera } = await signInDirect("meera@lilirve.dev");
  const m1 = await meera.from("analytics_events").select("*").limit(1);
  const m2 = await meera.from("analytics_events").update({ designer_id: RAMESH }).eq("designer_id", MEERA);
  const m3 = await meera.from("analytics_events").delete().eq("designer_id", MEERA);
  check("designer: can't read raw events (visitor keys stay private), or update/delete them", !!m1.error && !!m2.error && !!m3.error && events(`designer_id='${MEERA}'`) > 0);
  const own = await meera.rpc("designer_analytics", { p_start: dayOffset(-6), p_end: today });
  check("designer: designer_analytics() returns their own aggregates", !own.error && own.data?.current?.studio_views === 4, own.error ?? own.data?.current);
  const { client: ramesh } = await signInDirect("ramesh@lilirve.dev");
  const other = await ramesh.rpc("designer_analytics", { p_start: dayOffset(-6), p_end: today });
  check("another designer gets only THEIR numbers (0), never meera's — the function takes no designer id", !other.error && other.data?.current?.studio_views === 0 && other.data?.current?.saves === 0, other.data?.current);
  const tooLong = await meera.rpc("designer_analytics", { p_start: dayOffset(-400), p_end: today });
  const reversed = await meera.rpc("designer_analytics", { p_start: today, p_end: dayOffset(-3) });
  check("invalid ranges (over 366 days, end before start) are refused (22023)", tooLong.error?.code === "22023" && reversed.error?.code === "22023");
  const { client: adminDb } = await signInDirect("admin@lilirve.dev");
  const ad = await adminDb.rpc("designer_analytics", { p_start: dayOffset(-6), p_end: today });
  check("an admin account can't use designer analytics (42501)", ad.error?.code === "42501");
}

console.log("\n=== /api/designer/analytics ===");
{
  // Fixtures with known dates: two direct requests to meera (2 and 10 days ago), one draft (not
  // counted), and two tracked studio views 13 days ago — the first day of the previous 7-day window, so tracking covers all of it.
  sql(`insert into public.fashion_requests (customer_id, title, category, description, status, preferred_designer_id, created_at) values
    ('${AANYA_CUSTOMER}', 'Analytics fixture A', 'Occasion Wear', 'fixture', 'submitted', '${MEERA}', now() - interval '2 days'),
    ('${AANYA_CUSTOMER}', 'Analytics fixture B', 'Occasion Wear', 'fixture', 'submitted', '${MEERA}', now() - interval '10 days'),
    ('${AANYA_CUSTOMER}', 'Analytics fixture draft', 'Occasion Wear', 'fixture', 'draft', '${MEERA}', now() - interval '1 day')`);
  sql(`insert into public.analytics_events (event_type, designer_id, target_id, visitor_key, event_day, occurred_at) values
    ('studio_view', '${MEERA}', '${MEERA}', 'c_hist0000000000000001', '${dayOffset(-13)}', now() - interval '13 days'),
    ('studio_view', '${MEERA}', '${MEERA}', 'c_hist0000000000000002', '${dayOffset(-13)}', now() - interval '13 days')`);

  const anonRes = await api("/api/designer/analytics?range=7");
  const aanya = await signInWithPassword("aanya@lilirve.dev");
  const admin = await signInWithPassword("admin@lilirve.dev");
  const meera = await signInWithPassword("meera@lilirve.dev");
  check("signed out → 401", anonRes.status === 401);
  check("customer → 403", (await api("/api/designer/analytics?range=7", aanya)).status === 403);
  check("admin → 403", (await api("/api/designer/analytics?range=7", admin)).status === 403);
  const bad = await Promise.all(["14", "365", "abc", "-7"].map((r) => api(`/api/designer/analytics?range=${r}`, meera)));
  check("ranges other than 7/30/90 → 400", bad.every((r) => r.status === 400), bad.map((r) => r.status));

  const r7 = await api("/api/designer/analytics?range=7", meera);
  const v = r7.data?.analytics;
  const card = (id) => v?.cards.find((c) => c.id === id);
  check("range=7 → 200, 7 daily points ending today (IST)", r7.status === 200 && v.series.length === 7 && v.range.end === today && v.range.start === dayOffset(-6) && v.range.bucket === "day", v?.range);
  check("studio views = 4 (anon ×2, aanya, ramesh; owner/admin/bots/duplicates excluded)", card("studio_views").value === 4, card("studio_views"));
  check("studio views compared with the previous 7 days (2) → up 100%", JSON.stringify(card("studio_views").delta) === JSON.stringify({ kind: "change", percent: 100, direction: "up" }), card("studio_views").delta);
  check("dress views = 1", card("dress_views").value === 1);
  check("customer interest = 2 saves; 'saved right now' from current saved items", card("interest").value === 2 && card("interest").details.some((d) => /items? saved by customers right now/.test(d)), card("interest"));
  check("requests received = 1 (2 days ago; the draft and the 10-day-old one excluded)", card("requests").value === 1, card("requests"));
  check("requests vs previous 7 days (1) → no change", card("requests").delta?.kind === "same", card("requests").delta);
  const projectsTotal = n(`select count(*) from public.projects where designer_id='${MEERA}'`);
  const projectsActive = n(`select count(*) from public.projects where designer_id='${MEERA}' and status::text in ('active','on_hold','awaiting_confirmation')`);
  check(`projects card = current totals (${projectsTotal} total, ${projectsActive} active)`, card("projects").value === projectsTotal && card("projects").details[0].startsWith(`${projectsActive} active`), card("projects"));
  check("conversion: 2 signed-in viewers, 1 converted (aanya saved after viewing) → hidden below 20, says so", card("conversion").value === null && /\(2 so far\)/.test(card("conversion").empty ?? ""), card("conversion"));
  const raw = (await (await signInDirect("meera@lilirve.dev")).client.rpc("designer_analytics", { p_start: dayOffset(-6), p_end: today })).data;
  check("…the database counts 2 eligible viewers and 1 conversion", raw.conversion.eligible_viewers === 2 && raw.conversion.converted === 1, raw.conversion);
  check("top dresses lists meera's dress with its views", v.topDresses.length === 1 && v.topDresses[0].id === DRESS && v.topDresses[0].views === 1, v.topDresses);
  const todayPoint = v.series.at(-1);
  check("today's point: 4 studio views, 1 dress view, 2 saves", todayPoint.values.studio_views === 4 && todayPoint.values.dress_views === 1 && todayPoint.values.saves === 2, todayPoint);
  check("tracking started 13 days ago → covers this and the whole previous period", v.tracking.startedOn === dayOffset(-13) && v.tracking.coversCurrent && v.tracking.coversPrevious, v.tracking);

  const r30 = (await api("/api/designer/analytics?range=30", meera)).data.analytics;
  check("range=30 → 30 daily points; both direct requests counted; days before tracking began are null", r30.series.length === 30 && r30.cards.find((c) => c.id === "requests").value === 2 && r30.series[0].values.studio_views === null && r30.series.at(-1).values.studio_views === 4, { len: r30.series.length });
  check("range=30: tracking began inside the period → views comparison withheld, notice shown", r30.tracking.coversCurrent === false && r30.cards.find((c) => c.id === "studio_views").delta.kind === "unavailable");
  const r90 = (await api("/api/designer/analytics?range=90", meera)).data.analytics;
  check("range=90 → 13 weekly points covering 90 days", r90.range.bucket === "week" && r90.series.length === 13 && r90.series[0].day === dayOffset(-89) && r90.series.at(-1).endDay === today);

  const ramesh = await signInWithPassword("ramesh@lilirve.dev");
  const rv = (await api("/api/designer/analytics?range=30", ramesh)).data.analytics;
  check("ramesh's dashboard shows his own (empty) numbers, none of meera's", rv.cards.find((c) => c.id === "studio_views").value === 0 && rv.cards.find((c) => c.id === "requests").value === 0 && rv.topDresses.length === 0, rv.cards.map((c) => [c.id, c.value]));
  check("no visitor keys, user ids or IP hashes in the API response", !JSON.stringify(r7.data).match(/visitor_key|viewer_user_id|ip_hash|[cu]_[0-9a-f]{40}/));
}

console.log("\n=== Dashboard UI (real browser) ===");
{
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const sessionCtx = async (cookie, viewport) => {
    const context = await browser.newContext({ viewport, userAgent: BROWSER_UA });
    if (cookie) {
      const host = new URL(APP_URL).hostname;
      await context.addCookies(cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: "/" }; }));
    }
    return context;
  };
  const meera = await signInWithPassword("meera@lilirve.dev");

  for (const [w, h] of [[1280, 900], [768, 1000], [390, 844]]) {
    const ctx = await sessionCtx(meera, { width: w, height: h });
    const page = await ctx.newPage();
    if (w === 1280) {
      await page.goto(`${APP_URL}/designer/home`, { waitUntil: "networkidle" });
      const link = page.locator('header nav a[href="/designer/analytics"]');
      check("@1280 the designer navbar has an Analytics link", (await link.count()) === 1 && (await link.innerText()).trim() === "Analytics");
      await Promise.all([page.waitForURL(/\/designer\/analytics/), link.click()]);
    } else {
      await page.goto(`${APP_URL}/designer/analytics`, { waitUntil: "networkidle" });
    }
    await page.locator('[data-testid="analytics-dashboard"]').waitFor({ timeout: 30000 });
    const cards = await page.locator('[data-testid^="analytics-card-"][data-testid$="views"], [data-testid="analytics-card-interest"], [data-testid="analytics-card-requests"], [data-testid="analytics-card-projects"], [data-testid="analytics-card-conversion"]').count();
    const charts = await page.locator('[data-testid^="analytics-chart-"]').count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const topDresses = await page.locator('[data-testid="analytics-top-dresses"]').count();
    check(`@${w}: "Studio Analytics" heading, 6 metric cards, 3 charts, most viewed dresses, no sideways scroll`, (await page.locator("h1", { hasText: "Studio Analytics" }).count()) === 1 && cards === 6 && charts === 3 && topDresses === 1 && overflow <= 0, { cards, charts, topDresses, overflow });
    if (w === 1280) {
      const studioValue = (await page.locator('[data-testid="analytics-card-studio_views"] [data-testid="analytics-card-value"]').innerText()).trim();
      check("@1280 the studio views card (default 30 days) shows the real number: 6 = 4 today + 2 from 13 days ago", studioValue === "6", studioValue);
      await page.click('[data-testid="analytics-range-90"]');
      await page.waitForFunction(() => document.querySelector('[data-testid="analytics-range-90"]')?.getAttribute("aria-pressed") === "true");
      await page.waitForResponse((r) => r.url().includes("/api/designer/analytics?range=90")).catch(() => undefined);
      await page.waitForTimeout(500);
      const label = await page.locator('[data-testid="analytics-range-label"]').innerText();
      check("@1280 switching to 'Last 90 days' re-scopes everything (range label updates)", (await page.locator('[data-testid="analytics-range-90"]').getAttribute("aria-pressed")) === "true" && label.includes("·"), label);
      await page.locator('[data-testid="analytics-chart-performance"] button', { hasText: "Show table" }).click();
      const rows = await page.locator('[data-testid="analytics-chart-performance"] tbody tr').count();
      const heads = await page.locator('[data-testid="analytics-chart-performance"] thead th').allInnerTexts();
      check("@1280 the performance chart's table view lists every point (13 weeks) for studio and dress views", rows === 13 && heads.join("|") === "Week|Studio views|Dress views", { rows, heads });
      await page.locator('[data-testid="analytics-chart-performance"] button', { hasText: "Show chart" }).click();
      const svg = page.locator('[data-testid="analytics-chart-performance"] svg');
      await svg.scrollIntoViewIfNeeded();
      const box = await svg.boundingBox();
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
      const tip = await page.locator('[data-testid="analytics-chart-performance"] [role="status"]').innerText().catch(() => "");
      check("@1280 hovering the performance chart shows both series with values", /Studio views/.test(tip) && /Dress views/.test(tip), tip);
      check("@1280 'How these numbers are calculated' is on the page, collapsed", (await page.locator('[data-testid="analytics-definitions"]').count()) === 1 && (await page.locator('[data-testid="analytics-definitions"]').getAttribute("open")) === null);
    }
    if (w === 390) {
      await page.click('button[aria-label^="Open menu"]');
      const hrefs = await page.locator('[role="dialog"] nav a').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      check("@390 the mobile menu includes Analytics", hrefs.includes("/designer/analytics"), hrefs);
    }
    await ctx.close();
  }

  // A customer reaching the URL sees no analytics; signed out is sent to sign in.
  const aanya = await signInWithPassword("aanya@lilirve.dev");
  const cctx = await sessionCtx(aanya, { width: 1280, height: 900 });
  const cp = await cctx.newPage();
  await cp.goto(`${APP_URL}/designer/analytics`, { waitUntil: "networkidle" });
  await cp.waitForTimeout(800);
  check("a customer opening /designer/analytics sees no analytics data", (await cp.locator('[data-testid="analytics-dashboard"]').count()) === 0);
  await cctx.close();
  const anon = await api("/designer/analytics");
  check("signed out → redirected to sign in", anon.status === 307 && anon.location.includes("/login"), anon);

  // A real page load (React Strict Mode runs effects twice in development) records ONE view.
  sql(`delete from public.analytics_events where event_type='dress_view'`);
  const vctx = await sessionCtx(null, { width: 1280, height: 900 });
  const vp = await vctx.newPage();
  await vp.goto(`${APP_URL}/dresses/${DRESS}`, { waitUntil: "networkidle" });
  await vp.waitForTimeout(1500);
  const once = events("event_type='dress_view'");
  await vp.reload({ waitUntil: "networkidle" });
  await vp.waitForTimeout(1500);
  check("a browser page view records exactly one view; reloading the same day adds none", once === 1 && events("event_type='dress_view'") === 1, { once, after: events("event_type='dress_view'") });
  await vctx.close();
  await browser.close();
}

sql("delete from public.fashion_requests where title like 'Analytics fixture%'");
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
