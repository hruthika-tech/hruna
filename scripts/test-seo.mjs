// HRUNA — SEO phase 1, over plain HTTP (server-rendered HTML, no browser): robots.txt and
// sitemap.xml are valid and list only public pages (approved studios only); public pages have
// unique titles, descriptions, a www.hruna.in canonical and Open Graph / X card tags; sign-in and
// email-link pages are noindex; unapproved studios stay reachable but noindex; malformed studio ids
// are a 404 (not a 500); the homepage has exactly one <h1>; private pages still redirect to sign-in;
// the favicon, app icons, main logo and 1200x630 share image are the new white hanger-and-H logo
// (the supplied public/brand/favicon_io files), at the sizes the <head> claims, and the old red
// emblem is neither served nor referenced;
// dress and collection pages are server-rendered with their own metadata, 404 when missing, and are
// indexable (and in the sitemap) only for approved designers, without leaking non-displayed fields.
// It adds and removes one local fixture collection + dress for an unapproved designer.
// Prereqs: the app on HRUNA_TEST_APP_URL (default http://localhost:3100) against a LOCAL seeded
// Supabase whose DB container is HRUNA_TEST_DB_CONTAINER. Run: node scripts/test-seo.mjs

import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_URL = process.env.HRUNA_TEST_APP_URL ?? "http://localhost:3100";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP_URL)) throw new Error(`Refusing non-local app ${APP_URL}`);
const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
const SITE = "https://www.hruna.in";

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
};

const dbList = (sql) =>
  execSync(`docker exec ${DB_CONTAINER} psql -U postgres -d postgres -At -c "${sql}"`, { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const get = async (path) => {
  const res = await fetch(`${APP_URL}${path}`, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") ?? "", type: res.headers.get("content-type") ?? "", text: await res.text() };
};

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const headOf = (html) => html.split("</head>")[0];
const tags = (html, tag) => headOf(html).match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
const attr = (tagHtml, name) => {
  const m = tagHtml.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
};
const meta = (html, key) => {
  const t = tags(html, "meta").find((m) => attr(m, "name") === key || attr(m, "property") === key);
  return t ? attr(t, "content") : null;
};
const seo = (html) => ({
  title: decode(headOf(html).match(/<title>([^<]*)<\/title>/)?.[1] ?? ""),
  description: meta(html, "description"),
  robots: meta(html, "robots"),
  canonical: attr(tags(html, "link").find((l) => attr(l, "rel") === "canonical") ?? "", "href"),
  ogUrl: meta(html, "og:url"),
  ogTitle: meta(html, "og:title"),
  ogSite: meta(html, "og:site_name"),
  twitterCard: meta(html, "twitter:card"),
  appName: meta(html, "application-name"),
  h1: (html.match(/<h1\b/g) ?? []).length,
});

// Paths and the routes that must never be indexed or listed.
const PUBLIC_PAGES = ["/", "/discover", "/about", "/become-a-designer", "/help", "/support", "/terms", "/privacy", "/acceptable-use", "/account-policy", "/collaboration-policy", "/community-guidelines", "/content-policy", "/reporting-and-disputes", "/reviews-policy"];
const UTILITY_PAGES = ["/login", "/create-account", "/forgot-password", "/reset-password", "/verify-email", "/auth/link-error", "/account/email"];
const PRIVATE_PAGES = ["/home", "/messages", "/notifications", "/profile", "/projects", "/requests", "/requests/new", "/saved", "/diary", "/designer/home", "/designer/messages", "/designer/requests", "/admin", "/choose-role", "/onboarding", "/designer-onboarding", "/setup-password", "/subscription"];
const NEVER_LISTED = /^\/(api|auth|admin|designer|designer-onboarding|designer-subscription|home|messages|notifications|profile|projects|requests|saved|diary|login|create-account|forgot-password|reset-password|verify-email|account|choose-role|onboarding|setup-password|subscription|verification-pending|verification-rejected)(\/|$)/;

const approvedIds = dbList("select id from public.designer_public_profiles where is_approved order by id");
const unapprovedIds = dbList("select id from public.designer_public_profiles where not coalesce(is_approved, false) order by id");
const inList = (ids) => ids.map((id) => `'${id}'`).join(",");
const approvedDressIds = dbList(`select id from public.dresses where designer_id in (${inList(approvedIds)}) order by id`);
const approvedCollectionIds = dbList(`select id from public.collections where designer_id in (${inList(approvedIds)}) order by id`);

// Local fixture: a collection + dress owned by an UNAPPROVED designer (the seed has none), removed
// again on exit. They must stay reachable by link, but be noindex and absent from the sitemap.
const FX_COLLECTION = "e1ffffff-0000-4000-8000-000000000099";
const FX_DRESS = "e2ffffff-0000-4000-8000-000000000099";
const dropFixture = () => dbList(`delete from public.dresses where id = '${FX_DRESS}'; delete from public.collections where id = '${FX_COLLECTION}'; select 1`);
dropFixture();
dbList(
  `insert into public.collections (id, designer_id, name, category, description) values ('${FX_COLLECTION}', '${unapprovedIds[0]}', 'SEO Fixture Collection', 'Bridal', 'Fixture for an unapproved designer.'); ` +
    `insert into public.dresses (id, designer_id, collection_id, name, description, price, available, fabric) values ('${FX_DRESS}', '${unapprovedIds[0]}', '${FX_COLLECTION}', 'SEO Fixture Dress', 'Fixture dress.', 1000, true, 'Cotton'); select 1`
);
process.on("exit", dropFixture);

console.log("\n=== robots.txt ===");
{
  const r = await get("/robots.txt");
  const lines = r.text.split("\n").map((l) => l.trim());
  const disallow = lines.filter((l) => /^Disallow:/i.test(l)).map((l) => l.replace(/^Disallow:\s*/i, ""));
  const blocked = (path) => disallow.some((d) => d && path.startsWith(d));
  check("200, text/plain", r.status === 200 && r.type.startsWith("text/plain"), { status: r.status, type: r.type });
  check("one rule group for every crawler, allowing /", lines.includes("User-Agent: *") && lines.includes("Allow: /"), lines);
  check("points to https://www.hruna.in/sitemap.xml", lines.includes(`Sitemap: ${SITE}/sitemap.xml`), lines);
  check("disallows API and auth-callback endpoints", blocked("/api/designers") && blocked("/auth/confirm"), disallow);
  const privateNotBlocked = PRIVATE_PAGES.filter((p) => !blocked(p));
  check("disallows every private area", privateNotBlocked.length === 0, privateNotBlocked);
  const publicBlocked = [...PUBLIC_PAGES, `/studio/${approvedIds[0] ?? "x"}`, "/dresses/x", "/collections/x"].filter(blocked);
  check("public pages, studios, dresses and collections stay crawlable", publicBlocked.length === 0, publicBlocked);
  const assetsBlocked = ["/_next/static/chunks/main.js", "/_next/image?url=x", "/images/stitch/dress-form-draping.png", "/favicon.ico"].filter(blocked);
  check("CSS/JS/images (/_next, /images) are not blocked", assetsBlocked.length === 0, assetsBlocked);
  // Pages that rely on their own noindex must stay crawlable, or crawlers could never see it.
  const utilityBlocked = UTILITY_PAGES.filter((p) => !p.startsWith("/auth/") && blocked(p));
  check("sign-in / reset / verify pages are NOT disallowed (their noindex must be readable)", utilityBlocked.length === 0, utilityBlocked);
}

console.log("\n=== sitemap.xml ===");
let sitemapLocs = [];
{
  const r = await get("/sitemap.xml");
  check("200, XML", r.status === 200 && /xml/.test(r.type), { status: r.status, type: r.type });
  check("a <urlset> in the sitemap namespace", /<urlset[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(r.text) && r.text.trim().endsWith("</urlset>"));
  const blocks = r.text.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  sitemapLocs = blocks.map((b) => decode(b.match(/<loc>([^<]*)<\/loc>/)?.[1] ?? ""));
  check("every <url> has exactly one <loc>", blocks.length > 0 && blocks.every((b) => (b.match(/<loc>/g) ?? []).length === 1), blocks.length);
  check("every URL is absolute on https://www.hruna.in", sitemapLocs.every((u) => u === SITE || u.startsWith(`${SITE}/`)), sitemapLocs.filter((u) => !u.startsWith(SITE)));
  check("no duplicate URLs", new Set(sitemapLocs).size === sitemapLocs.length);
  const paths = sitemapLocs.map((u) => new URL(u).pathname);
  check("lists every public informational page", PUBLIC_PAGES.every((p) => paths.includes(p)), PUBLIC_PAGES.filter((p) => !paths.includes(p)));
  const leaked = paths.filter((p) => NEVER_LISTED.test(p));
  check("lists no private, account, auth or API URLs", leaked.length === 0, leaked);
  check(`lists every approved designer's dress (${approvedDressIds.length}) and collection (${approvedCollectionIds.length})`, approvedDressIds.length > 0 && approvedCollectionIds.length > 0 && approvedDressIds.every((id) => paths.includes(`/dresses/${id}`)) && approvedCollectionIds.every((id) => paths.includes(`/collections/${id}`)), { approvedDressIds, approvedCollectionIds });
  check("lists no dress or collection of an unapproved designer", !paths.includes(`/dresses/${FX_DRESS}`) && !paths.includes(`/collections/${FX_COLLECTION}`));
  const catalog = paths.filter((p) => /^\/(dresses|collections)\//.test(p)).map((p) => p.split("/")[2]);
  check("every listed dress/collection id is a real row of an approved designer", catalog.every((id) => approvedDressIds.includes(id) || approvedCollectionIds.includes(id)), catalog);
  check(`lists every approved studio (${approvedIds.length})`, approvedIds.length > 0 && approvedIds.every((id) => paths.includes(`/studio/${id}`)), approvedIds);
  check(`lists no unapproved studio (${unapprovedIds.length} in the database)`, unapprovedIds.length > 0 && unapprovedIds.every((id) => !paths.includes(`/studio/${id}`)), unapprovedIds);
  check("only studios, dresses and collections beyond the static pages", paths.every((p) => PUBLIC_PAGES.includes(p) || /^\/(studio|dresses|collections)\/[0-9a-f-]{36}$/.test(p)), paths);
  const lastmods = r.text.match(/<lastmod>([^<]*)<\/lastmod>/g) ?? [];
  check("<lastmod> values are valid dates", lastmods.every((l) => !Number.isNaN(Date.parse(l.replace(/<\/?lastmod>/g, "")))), lastmods.slice(0, 3));
}

console.log("\n=== Every sitemap URL is a real, indexable page ===");
{
  const problems = [];
  for (const loc of sitemapLocs) {
    const path = new URL(loc).pathname;
    const r = await get(path);
    const s = seo(r.text);
    if (r.status !== 200 || /noindex/.test(s.robots ?? "") || s.canonical !== loc) problems.push({ path, status: r.status, robots: s.robots, canonical: s.canonical });
  }
  check(`all ${sitemapLocs.length} URLs: 200, no noindex, canonical = the listed URL`, problems.length === 0, problems);
}

console.log("\n=== Public page metadata ===");
{
  const seen = new Map();
  for (const path of PUBLIC_PAGES) {
    const s = seo((await get(path)).text);
    seen.set(path, s);
    const url = path === "/" ? SITE : `${SITE}${path}`; // Next renders the home canonical as the bare origin
    const ok =
      s.title && s.description && s.description.length >= 50 && s.description.length <= 170 &&
      s.canonical === url && s.ogUrl === url && s.ogTitle && s.ogSite === "HRUNA" && s.twitterCard === "summary_large_image" && s.appName === "HRUNA" && !s.robots;
    check(`${path}: title, description, canonical, Open Graph + X card`, ok, s);
  }
  const titles = [...seen.values()].map((s) => s.title);
  const descriptions = [...seen.values()].map((s) => s.description);
  check("titles are unique across public pages", new Set(titles).size === titles.length, titles);
  check("descriptions are unique across public pages", new Set(descriptions).size === descriptions.length);
  check("non-home titles use the '| HRUNA' template", [...seen].filter(([p]) => p !== "/").every(([, s]) => s.title.endsWith(" | HRUNA")), titles);
  const home = seen.get("/");
  check("homepage: full brand title and exactly one <h1>", home.title === "HRUNA — Where Vision Meets Craft" && home.h1 === 1, home);
  const homeHtml = (await get("/")).text;
  const h1 = homeHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
  check("homepage <h1> is the HRUNA wordmark, with the original classes", !!h1 && h1[1].replace(/<[^>]+>/g, "") === "HRUNA" && /class="font-display text-6xl sm:text-7xl md:text-8xl text-scrapbook-forest tracking-tight flex"/.test(h1[0]), h1?.[0]);
  const ogImage = `${SITE}/brand/hruna-og.png`;
  check("homepage: og:image + twitter:image = the 1200x630 share image", meta(homeHtml, "og:image") === ogImage && meta(homeHtml, "og:image:width") === "1200" && meta(homeHtml, "og:image:height") === "630" && !!meta(homeHtml, "og:image:alt") && meta(homeHtml, "twitter:image") === ogImage, { og: meta(homeHtml, "og:image"), tw: meta(homeHtml, "twitter:image") });
  const noImage = [];
  for (const path of PUBLIC_PAGES) if (meta((await get(path)).text, "og:image") !== ogImage) noImage.push(path);
  check("every public page shares the default image", noImage.length === 0, noImage);
}

console.log("\n=== Brand assets: icons and share image exist and are what the <head> says ===");
{
  const bin = async (path) => {
    const res = await fetch(`${APP_URL}${path}`);
    return { status: res.status, type: res.headers.get("content-type") ?? "", buf: Buffer.from(await res.arrayBuffer()) };
  };
  const png = (buf) => ({ sig: buf.subarray(1, 4).toString() === "PNG", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] });
  const homeHead = headOf((await get("/")).text);
  const links = tags(homeHead, "link").map((l) => ({ rel: attr(l, "rel"), href: attr(l, "href"), type: attr(l, "type"), sizes: attr(l, "sizes") }));
  const icon = (pred) => links.find(pred);
  const fav = icon((l) => l.rel === "icon" && l.href?.startsWith("/favicon.ico"));
  const pngIcon = icon((l) => l.rel === "icon" && l.href?.startsWith("/icon.png"));
  const apple = icon((l) => l.rel === "apple-touch-icon" && l.href?.startsWith("/apple-icon.png"));
  check("<head> links favicon.ico, icon.png (512x512) and apple-touch-icon (180x180)", !!fav && pngIcon?.sizes === "512x512" && pngIcon?.type === "image/png" && apple?.sizes === "180x180", links.filter((l) => /icon/.test(l.rel ?? "")));

  const f = await bin("/favicon.ico");
  const count = f.buf.readUInt16LE(4);
  const sizes = [...Array(count)].map((_, i) => f.buf[6 + i * 16] || 256).sort((a, b) => a - b);
  check("/favicon.ico: 200, an ICO with 16, 32 and 48px images", f.status === 200 && f.buf.readUInt16LE(2) === 1 && JSON.stringify(sizes) === "[16,32,48]", { status: f.status, sizes });

  // [served path, width, height, PNG colour type (6 = RGBA, 2 = RGB)]
  const served = {};
  for (const [path, w, h, colorType] of [["/icon.png", 512, 512, 6], ["/apple-icon.png", 180, 180, 6], ["/brand/hruna-logo.png", 512, 512, 6], ["/brand/hruna-og.png", 1200, 630, 2]]) {
    const r = await bin(path.startsWith("/icon") || path.startsWith("/apple") ? (links.find((l) => l.href?.startsWith(path))?.href ?? path) : path);
    served[path] = r.buf;
    const p = r.status === 200 ? png(r.buf) : {};
    check(`${path}: 200 image/png, ${w}x${h} (square: ${w === h})`, r.status === 200 && r.type.startsWith("image/png") && p.sig && p.w === w && p.h === h && p.colorType === colorType, { status: r.status, type: r.type, ...p });
  }
  // On disk, not over HTTP: Windows dev servers ignore case, Vercel (Linux) does not.
  const publicDirs = readdirSync(new URL("../public", import.meta.url));
  const brandFiles = readdirSync(new URL("../public/brand", import.meta.url));
  check("public/brand is lowercase, no capitalised Brand folder: the logo, the share image and the favicon_io set", publicDirs.includes("brand") && !publicDirs.includes("Brand") && JSON.stringify(brandFiles.sort()) === '["favicon_io","hruna-logo.png","hruna-og.png"]', { publicDirs, brandFiles });

  // The official logo is the SUPPLIED white hanger-and-H on black (public/brand/favicon_io). Every
  // icon and the main logo file are those supplied files, served byte-for-byte.
  const faviconSet = (name) => readFileSync(new URL(`../public/brand/favicon_io/${name}`, import.meta.url));
  check("/favicon.ico is exactly favicon_io/favicon.ico", f.buf.equals(faviconSet("favicon.ico")));
  check("/icon.png is exactly favicon_io/android-chrome-512x512.png", served["/icon.png"].equals(faviconSet("android-chrome-512x512.png")));
  check("/apple-icon.png is exactly favicon_io/apple-touch-icon.png", served["/apple-icon.png"].equals(faviconSet("apple-touch-icon.png")));
  check("/brand/hruna-logo.png (main logo) is exactly favicon_io/android-chrome-512x512.png", served["/brand/hruna-logo.png"].equals(faviconSet("android-chrome-512x512.png")));

  // The previous red dress emblem: SHA-256 of every asset that carried it (as committed in 57d4d1c).
  // None of them may be served, or referenced by active code, any more.
  const OLD_EMBLEM = new Set([
    "89ffbe1317040019ea8d1b84992271f5ec3f769ed5b2499ac1c57314c0f77e4a", // app/favicon.ico
    "557d15ca718d2780189d24616b1307dccc531bc406a8f36e0e66eec482af79bf", // app/icon.png
    "36d5284557843e54054fa50810a147fe55d57a3205b65c523e2c376156d2a8b6", // app/apple-icon.png
    "b81bb0cc499d3847bf6e280498d988cd893cd14b0d6b0c157905266ad605d5aa", // public/brand/hruna-logo.png
    "7387fe74d39397e3ed84df7fcda216e7d589d0bca6300cfc18f072c23c7dc8c3", // public/brand/hruna-og.png
  ]);
  const sha = (buf) => createHash("sha256").update(buf).digest("hex");
  const stillOld = Object.entries({ "/favicon.ico": f.buf, ...served }).filter(([, buf]) => OLD_EMBLEM.has(sha(buf))).map(([p]) => p);
  check("no served icon, logo or share image is the old red emblem", stillOld.length === 0, stillOld);
  // Every image under /brand/ (or an app icon) that active code points at must exist and be new.
  const sources = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?|css|json)$/.test(e.name)) sources.push(p);
    }
  };
  for (const d of ["app", "components", "lib", "hooks"]) walk(fileURLToPath(new URL(`../${d}`, import.meta.url)));
  const refs = [...new Set(sources.flatMap((p) => readFileSync(p, "utf8").match(/\/brand\/[\w./-]+\.(png|jpe?g|webp|svg|ico)/g) ?? []))];
  const badRefs = refs.filter((r) => {
    const file = new URL(`../public${r}`, import.meta.url);
    try { return OLD_EMBLEM.has(sha(readFileSync(file))); } catch { return true; }
  });
  check(`active code's brand image references (${refs.join(", ")}) all exist and none is the old emblem`, refs.length > 0 && badRefs.length === 0, badRefs);
}

console.log("\n=== Sign-in and email-link pages: noindex ===");
for (const path of UTILITY_PAGES) {
  const r = await get(path);
  const s = seo(r.text);
  check(`${path}: 200, noindex+follow, own title, no canonical`, r.status === 200 && s.robots === "noindex, follow" && s.title.endsWith(" | HRUNA") && !s.canonical, { status: r.status, ...s });
}

console.log("\n=== Studios ===");
{
  const approved = approvedIds[0];
  const ra = await get(`/studio/${approved}`);
  const sa = seo(ra.text);
  const name = dbList(`select studio_name from public.designer_profiles where id = '${approved}'`)[0];
  check("approved studio: 200, indexable, title names the studio, canonical to itself", ra.status === 200 && !sa.robots && sa.title.startsWith(name) && sa.title.endsWith(" | HRUNA") && sa.canonical === `${SITE}/studio/${approved}` && sa.ogUrl === sa.canonical && !!sa.description, sa);

  const unapproved = unapprovedIds[0];
  const ru = await get(`/studio/${unapproved}`);
  const su = seo(ru.text);
  check("unapproved studio: still opens by direct link (200, page renders)", ru.status === 200 && su.h1 >= 1, { status: ru.status, h1: su.h1 });
  check("unapproved studio: marked noindex, follow", su.robots === "noindex, follow", su.robots);

  for (const bad of ["not-a-uuid", "1%27%20or%201=1", "00000000-0000-0000-0000-000000000000"]) {
    const r = await get(`/studio/${bad}`);
    check(`/studio/${decodeURIComponent(bad)} → 404 (not 500), noindex`, r.status === 404 && /noindex/.test(seo(r.text).robots ?? ""), r.status);
  }
  const api = await get("/api/studio/not-a-uuid");
  check("/api/studio/not-a-uuid → 404 JSON (was a 500)", api.status === 404 && /not found/i.test(api.text), { status: api.status });
  const apiOk = await get(`/api/studio/${approved}`);
  check("/api/studio/<approved id> still works", apiOk.status === 200 && JSON.parse(apiOk.text).status === "ok");
}

console.log("\n=== Dresses and collections: server-rendered, real 404s, indexable only when approved ===");
{
  const PUBLIC_IMG = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/studio-images\//;
  // Keys that only exist on fields these pages don't display (storage ids, designer contact/story,
  // signed-url tokens) — none may reach the browser in the server-rendered payload.
  const PRIVATE_KEYS = ["imageFiles", "fileId", "contactEmail", "openingHours", "atelierLocation", "\\\"story\\\"", "token="];
  const leaks = (html) => PRIVATE_KEYS.filter((k) => html.includes(k));

  const dressId = approvedDressIds[0];
  const [dressName, dressDesc, studio] = dbList(`select d.name || '|' || coalesce(d.description, '') || '|' || p.studio_name from public.dresses d join public.designer_profiles p on p.id = d.designer_id where d.id = '${dressId}'`)[0].split("|");
  const rd = await get(`/dresses/${dressId}`);
  const sd = seo(rd.text);
  const body = rd.text.split("</head>")[1] ?? "";
  check("approved dress: 200 with the real content in the server HTML (h1, description, availability — not 'Loading…')", rd.status === 200 && new RegExp(`<h1[^>]*>${dressName}</h1>`).test(decode(body)) && decode(body).includes(dressDesc) && /data-testid="dress-availability"/.test(body) && !/Loading…/.test(body), { status: rd.status, h1: sd.h1 });
  check("approved dress: title '<name> by <studio> | HRUNA', description, canonical + og:url to itself, indexable", sd.title === `${dressName} by ${studio} | HRUNA` && !!sd.description && sd.description.length <= 170 && sd.canonical === `${SITE}/dresses/${dressId}` && sd.ogUrl === sd.canonical && !sd.robots, sd);
  const dressImg = meta(rd.text, "og:image");
  check("approved dress: og:image is its own photo, a PUBLIC studio-images URL", PUBLIC_IMG.test(dressImg ?? "") && meta(rd.text, "twitter:image") === dressImg, dressImg);
  check("approved dress: no private fields or file ids in the page payload", leaks(rd.text).length === 0, leaks(rd.text));

  const collectionId = approvedCollectionIds[0];
  const [colName] = dbList(`select name from public.collections where id = '${collectionId}'`);
  const rc = await get(`/collections/${collectionId}`);
  const sc = seo(rc.text);
  const cbody = decode(rc.text.split("</head>")[1] ?? "");
  const colDresses = dbList(`select id from public.dresses where collection_id = '${collectionId}'`);
  check("approved collection: 200, server HTML has its h1 and links to each of its dresses", rc.status === 200 && cbody.includes(colName) && sc.h1 >= 1 && colDresses.every((id) => cbody.includes(`href="/dresses/${id}"`)) && !/Loading…/.test(cbody), { status: rc.status, colDresses });
  check("approved collection: title '<name> by <studio> | HRUNA', canonical to itself, indexable", sc.title === `${colName} by ${studio} | HRUNA` && sc.canonical === `${SITE}/collections/${collectionId}` && sc.ogUrl === sc.canonical && !sc.robots && !!sc.description, sc);
  check("approved collection: og:image is its cover, a PUBLIC studio-images URL", PUBLIC_IMG.test(meta(rc.text, "og:image") ?? ""), meta(rc.text, "og:image"));
  check("approved collection: no private fields or file ids in the page payload", leaks(rc.text).length === 0, leaks(rc.text));

  const ud = await get(`/dresses/${FX_DRESS}`);
  const uc = await get(`/collections/${FX_COLLECTION}`);
  check("unapproved designer's dress: still opens by link (200, content rendered) but noindex, follow", ud.status === 200 && decode(ud.text).includes("SEO Fixture Dress") && seo(ud.text).robots === "noindex, follow", { status: ud.status, robots: seo(ud.text).robots });
  check("unapproved designer's collection: still opens by link (200) but noindex, follow", uc.status === 200 && decode(uc.text).includes("SEO Fixture Collection") && seo(uc.text).robots === "noindex, follow", { status: uc.status, robots: seo(uc.text).robots });
  check("a collection with no cover or dress photos shares the default HRUNA image", meta(uc.text, "og:image") === `${SITE}/brand/hruna-og.png`, meta(uc.text, "og:image"));

  for (const base of ["/dresses", "/collections"]) {
    for (const bad of ["00000000-0000-0000-0000-000000000000", "not-a-uuid", "1%27%20or%201=1"]) {
      const r = await get(`${base}/${bad}`);
      check(`${base}/${decodeURIComponent(bad)} → 404 (not 200 + placeholder, not 500), noindex`, r.status === 404 && /noindex/.test(seo(r.text).robots ?? "") && !/Loading…/.test(r.text), r.status);
    }
    const api = await get(`/api${base}/not-a-uuid`);
    check(`/api${base}/not-a-uuid → 404 JSON (was a 500)`, api.status === 404, api.status);
  }
  const apiDress = await get(`/api/dresses/${dressId}`);
  check("the public dress API still works (used by Saved Items and other clients)", apiDress.status === 200 && JSON.parse(apiDress.text).dress?.id === dressId);
}

console.log("\n=== Private pages unchanged: signed-out visitors are sent to sign in ===");
{
  const wrong = [];
  for (const path of PRIVATE_PAGES) {
    const r = await get(path);
    if (r.status !== 307 || !r.location.includes(`/login?next=${encodeURIComponent(path)}`)) wrong.push({ path, status: r.status, location: r.location });
  }
  check(`all ${PRIVATE_PAGES.length} private pages → 307 /login?next=…`, wrong.length === 0, wrong);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
