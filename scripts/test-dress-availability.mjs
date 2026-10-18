// HRUNA — dress availability (designer-set stock status) end to end.
// Seed: approved designer meera owns collection e1…01 and dress e2…01 ("Nur Ivory Lehenga").
//
// With dresses.stock_status (migration 20261019000001): every option saves, reloads, shows to
// customers, an unavailable dress can't be ordered, invalid values and other designers are refused.
// Without it (hosted until the migration is applied): editing dresses keeps working, the response
// says the availability wasn't stored, and customers see the pre-existing "In stock" behaviour.
//
// LOCAL STACK ONLY (scripts/lib/test-auth.mjs). Optional HRUNA_TEST_DB_CONTAINER (read-only checks).
// Run with: node scripts/test-dress-availability.mjs

import { spawnSync } from "node:child_process";
import { APP_URL, assertLocalTestEnvironment, rawClientFromCookie, signInWithPassword } from "./lib/test-auth.mjs";

const DB_CONTAINER = process.env.HRUNA_TEST_DB_CONTAINER ?? "supabase_db_lilirve-app";
const DRESS = "e2000000-0000-0000-0000-000000000001";
const COLLECTION = "e1000000-0000-0000-0000-000000000001";
const DESIGNER_PROFILE = "d1000000-0000-0000-0000-000000000001";
let pass = 0;
let fail = 0;
const failures = [];
function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}
const db = (sql) =>
  (spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-tA"], { input: `BEGIN READ ONLY; ${sql}; ROLLBACK;`, encoding: "utf8" }).stdout ?? "")
    .trim().split("\n").filter(Boolean).pop() ?? "";
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const html = async (path, cookie) => (await fetch(`${APP_URL}${path}`, { headers: cookie ? { cookie } : {} })).text();
const studioDress = async (cookie, id = DRESS) => ((await api("/api/designer/studio", { cookie })).data.dresses ?? []).find((d) => d.id === id);
const publicDress = async (cookie, id = DRESS) => (await api(`/api/dresses/${id}`, { cookie })).data.dress;
const rowOf = (id = DRESS) => db(`SELECT name||'|'||price||'|'||available||'|'||coalesce(description,'')||'|'||(SELECT count(*) FROM public.dress_images WHERE dress_id='${id}') FROM public.dresses WHERE id='${id}'`);

let browser = null;
async function main() {
  await assertLocalTestEnvironment();
  try {
    browser = await (await import("playwright")).chromium.launch();
  } catch {
    console.log("  \x1b[33m!\x1b[0m playwright/Chromium unavailable — browser checks are SKIPPED");
  }
  const page = async (cookie, path) => {
    const ctx = await browser.newContext();
    if (cookie) await ctx.addCookies(cookie.split("; ").map((p) => ({ name: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1), url: APP_URL })));
    const p = await ctx.newPage();
    await p.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" });
    return { ctx, p };
  };
  const hasColumn = db("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='dresses' AND column_name='stock_status'") === "1";
  console.log(`\n(database under test: dresses.stock_status ${hasColumn ? "PRESENT" : "MISSING — hosted-like state"})`);

  const designer = await signInWithPassword("meera@lilirve.dev");
  const other = await signInWithPassword("ramesh@lilirve.dev"); // a different designer
  const customer = await signInWithPassword("aanya@lilirve.dev");
  const before = await studioDress(designer);
  const rowBefore = rowOf();
  check("0. (setup) the designer's own dress is listed for editing, available for purchase", !!before && before.available === true, before);

  if (!hasColumn) {
    console.log("\n=== Without the stock_status column (hosted until the migration is applied) ===");
    const r = await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { description: "edited without the column", stockStatus: "made_to_order" } });
    check("N1. Saving a dress still works (200) and reports the availability wasn't stored", r.status === 200 && r.data.stockStatusSaved === false && r.data.dress?.description === "edited without the column", r.data);
    const pub = await publicDress(customer);
    check("N2. Customers see the previous behaviour: In stock (nothing invented)", pub?.stockStatus === "in_stock" && pub?.available === true, pub);
    const created = await api("/api/designer/studio/dresses", { method: "POST", cookie: designer, body: { collectionId: COLLECTION, name: "No-column dress", price: 1000, available: true, stockStatus: "unavailable" } });
    check("N3. Creating a dress still works and reports the availability wasn't stored", created.status === 200 && created.data.stockStatusSaved === false && !!created.data.dress?.id, created.data);
    const bad = await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: "sold_out" } });
    check("N4. Invalid values are still refused (400)", bad.status === 400, bad.data);
  } else {
    console.log("\n=== Save and reload each option (designer) ===");
    for (const [status, label] of [["made_to_order", "Made to order"], ["unavailable", "Currently unavailable"], ["in_stock", "In stock"]]) {
      const r = await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: status } });
      const reloaded = await studioDress(designer);
      const stored = db(`SELECT stock_status FROM public.dresses WHERE id='${DRESS}'`);
      const pub = await publicDress(customer);
      check(`1. ${label}: saved (200), stored in the database, and reloads for the designer and customers`, r.status === 200 && r.data.stockStatusSaved === true && r.data.dress?.stockStatus === status && reloaded?.stockStatus === status && stored === status && pub?.stockStatus === status, { r: r.data, reloaded: reloaded?.stockStatus, stored, pub: pub?.stockStatus });
    }
    check("1d. Changing availability didn't touch the name, price, purchase flag, description or images", rowOf() === rowBefore, { before: rowBefore, after: rowOf() });

    const bad = await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: "sold_out" } });
    check("2. An invalid availability is refused (400) and nothing changes", bad.status === 400 && db(`SELECT stock_status FROM public.dresses WHERE id='${DRESS}'`) === "in_stock", bad.data);

    const created = await api("/api/designer/studio/dresses", { method: "POST", cookie: designer, body: { collectionId: COLLECTION, name: "Made-to-order gown", price: 25000, available: true, stockStatus: "made_to_order" } });
    const newId = created.data.dress?.id;
    check("3. Adding a dress stores its chosen availability (Made to order) and it reloads", created.status === 200 && created.data.dress?.stockStatus === "made_to_order" && (await studioDress(designer, newId))?.stockStatus === "made_to_order", created.data);
    const plain = await api("/api/designer/studio/dresses", { method: "POST", cookie: designer, body: { collectionId: COLLECTION, name: "Default dress", price: 9000 } });
    check("3b. A dress added without choosing one defaults to In stock", plain.data.dress?.stockStatus === "in_stock", plain.data);
    const badNew = await api("/api/designer/studio/dresses", { method: "POST", cookie: designer, body: { collectionId: COLLECTION, name: "Bad", price: 1, stockStatus: "nope" } });
    check("3c. Adding with an invalid availability is refused (400) and creates nothing", badNew.status === 400 && db("SELECT count(*) FROM public.dresses WHERE name='Bad'") === "0", badNew.data);

    console.log("\n=== Ownership ===");
    await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: "made_to_order" } });
    const intrude = await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: other, body: { stockStatus: "unavailable", price: 1 } });
    check("4a. Another designer can't change it through the app (404) — status and price unchanged", intrude.status === 404 && db(`SELECT stock_status||'|'||price FROM public.dresses WHERE id='${DRESS}'`) === `made_to_order|${rowBefore.split("|")[1]}`, intrude.data);
    const raw = await rawClientFromCookie(other);
    const { data: rlsRows } = await raw.from("dresses").update({ stock_status: "unavailable" }).eq("id", DRESS).select("id");
    check("4b. …nor directly against the database: RLS updates 0 rows", (rlsRows ?? []).length === 0 && db(`SELECT stock_status FROM public.dresses WHERE id='${DRESS}'`) === "made_to_order", rlsRows);
    const asCustomer = await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: customer, body: { stockStatus: "unavailable" } });
    const anon = await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", body: { stockStatus: "unavailable" } });
    check("4c. Customers (403) and signed-out visitors (401) can't change it either", asCustomer.status === 403 && anon.status === 401 && db(`SELECT stock_status FROM public.dresses WHERE id='${DRESS}'`) === "made_to_order", { customer: asCustomer.status, anon: anon.status });

    console.log("\n=== Customer display and ordering ===");
    if (browser) {
      const show = async () => {
        const { ctx, p } = await page(customer, `/dresses/${DRESS}`);
        await p.locator('[data-testid="dress-availability"]').waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
        const r = {
          text: (await p.locator('[data-testid="dress-availability"]').innerText().catch(() => "")).trim(),
          contact: await p.getByRole("button", { name: /Contact Designer/ }).count(),
          request: await p.getByRole("link", { name: "Request a Similar Design" }).count(),
        };
        await ctx.close();
        return r;
      };
      await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: "in_stock" } });
      let r = await show();
      check("5a. In stock → 'Availability: In stock' and Contact Designer", r.text === "Availability: In stock" && r.contact === 1 && r.request === 0, r);
      await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: "made_to_order" } });
      r = await show();
      check("5b. Made to order → 'Made to order' and Contact Designer", r.text === "Availability: Made to order" && r.contact === 1 && r.request === 0, r);
      await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: "unavailable" } });
      r = await show();
      check("5c. Currently unavailable → never 'In stock', and it can't be ordered (Request a Similar Design only)", r.text === "Availability: Currently unavailable" && r.contact === 0 && r.request === 1, r);
      await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { stockStatus: "in_stock", available: false } });
      r = await show();
      check("5d. Not available for purchase (even if in stock) → can't be ordered", r.text === "Availability: Not available for purchase" && r.contact === 0 && r.request === 1, r);
      await api(`/api/designer/studio/dresses/${DRESS}`, { method: "PATCH", cookie: designer, body: { available: true, stockStatus: "made_to_order" } });
    }
    const studioHtml = await html(`/studio/${DESIGNER_PROFILE}`, customer);
    check("6a. The public studio's dress cards show each dress's availability", /data-testid="dress-availability"[^>]*>Made to order</.test(studioHtml));
    const collectionHtml = await html(`/collections/${COLLECTION}`, customer);
    check("6b. The collection page's dress cards show it too", /data-testid="dress-availability"[^>]*>Made to order</.test(collectionHtml) || (browser && (await (async () => {
      const { ctx, p } = await page(customer, `/collections/${COLLECTION}`);
      await p.locator('[data-testid="dress-availability"]').first().waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
      const t = await p.locator('[data-testid="dress-availability"]').allInnerTexts();
      await ctx.close();
      return t.includes("Made to order");
    })())));

    if (browser) {
      console.log("\n=== Designer's Add/Edit dress form ===");
      const { ctx, p } = await page(designer, "/designer/studio/manage");
      await p.getByRole("button", { name: "Collections", exact: true }).click().catch(() => undefined);
      await p.getByText("Nur Ivory Lehenga").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
      const card = p.locator("div.border", { hasText: "Nur Ivory Lehenga" }).last();
      await card.getByRole("button", { name: "Edit" }).click();
      const select = p.locator("#dStock");
      await select.waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined);
      const shown = await select.inputValue().catch(() => "");
      const options = await select.locator("option").allInnerTexts().catch(() => []);
      check("7a. Edit dress shows an Availability control with the three options, set to the saved value", shown === "made_to_order" && JSON.stringify(options) === JSON.stringify(["In stock", "Made to order", "Currently unavailable"]) && (await p.getByText("Available for purchase").count()) === 1, { shown, options });
      await select.selectOption("unavailable");
      await p.getByRole("button", { name: "Save Dress" }).click();
      await p.waitForTimeout(1500);
      await p.reload({ waitUntil: "networkidle" });
      await p.getByRole("button", { name: "Collections", exact: true }).click().catch(() => undefined);
      await p.getByText("Nur Ivory Lehenga").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
      const card2 = p.locator("div.border", { hasText: "Nur Ivory Lehenga" }).last();
      const badge = await card2.locator('[data-testid="dress-badge"]').innerText().catch(() => "");
      await card2.getByRole("button", { name: "Edit" }).click();
      await p.locator("#dStock").waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined);
      const after = await p.locator("#dStock").inputValue().catch(() => "");
      check("7b. Choosing 'Currently unavailable' and saving persists it: after a reload the form shows it and the card is badged", after === "unavailable" && badge === "Unavailable" && db(`SELECT stock_status FROM public.dresses WHERE id='${DRESS}'`) === "unavailable", { after, badge });
      await ctx.close();
    }
  }

  if (browser) await browser.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("Failed:", failures.join(" | "));
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("Test suite crashed:", err);
  if (browser) await browser.close().catch(() => undefined);
  process.exit(1);
});
