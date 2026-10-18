// Unit tests for lib/dresses/availability.ts — the one rule that turns a dress's "Available for
// purchase" flag + designer-set stock status into what customers see and whether they can order it.
// No database, no app. Run with: node --test scripts/test-dress-availability-unit.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { STOCK_STATUS_OPTIONS, dressAvailability, isStockStatus } from "../lib/dresses/availability.ts";

test("the designer's three options, in order", () => {
  assert.deepEqual(STOCK_STATUS_OPTIONS.map((o) => [o.value, o.label]), [
    ["in_stock", "In stock"],
    ["made_to_order", "Made to order"],
    ["unavailable", "Currently unavailable"],
  ]);
});

test("each status, when the dress is available for purchase", () => {
  assert.deepEqual(dressAvailability({ available: true, stockStatus: "in_stock" }), { label: "In stock", orderable: true, badge: null });
  assert.deepEqual(dressAvailability({ available: true, stockStatus: "made_to_order" }), { label: "Made to order", orderable: true, badge: "Made to order" });
  assert.deepEqual(dressAvailability({ available: true, stockStatus: "unavailable" }), { label: "Currently unavailable", orderable: false, badge: "Unavailable" });
});

test("an unavailable dress is never shown as in stock and can't be ordered", () => {
  const a = dressAvailability({ available: true, stockStatus: "unavailable" });
  assert.notEqual(a.label, "In stock");
  assert.equal(a.orderable, false);
});

test("not available for purchase wins over any stock status (the two stay separate)", () => {
  for (const stockStatus of ["in_stock", "made_to_order", "unavailable"]) {
    const a = dressAvailability({ available: false, stockStatus });
    assert.equal(a.orderable, false, stockStatus);
    assert.equal(a.label, "Not available for purchase", stockStatus);
    assert.notEqual(a.label, "In stock", stockStatus);
  }
});

test("missing/unknown status (database not migrated yet) behaves like before: in stock", () => {
  assert.equal(dressAvailability({ available: true }).label, "In stock");
  assert.equal(dressAvailability({ available: true, stockStatus: null }).label, "In stock");
  assert.equal(dressAvailability({ available: true, stockStatus: "sold_out" }).label, "In stock");
});

test("only the three real statuses are accepted from clients", () => {
  for (const v of ["in_stock", "made_to_order", "unavailable"]) assert.ok(isStockStatus(v), v);
  for (const v of ["", "In stock", "sold", "UNAVAILABLE", null, undefined, 1, {}, "toString"]) assert.equal(isStockStatus(v), false, String(v));
});
