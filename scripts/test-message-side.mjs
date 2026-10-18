// Unit tests for lib/messaging/alignment.ts messageSide — which side a chat bubble goes on, decided
// only by the stored sender id vs the viewer's own auth id. Pure function: no database, no running
// app. Run with: node --test scripts/test-message-side.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { messageSide } from "../lib/messaging/alignment.ts";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const DESIGNER = "22222222-2222-4222-8222-222222222222";

test("customer's own message is on the right for the customer, left for the designer", () => {
  assert.equal(messageSide(CUSTOMER, CUSTOMER), "right");
  assert.equal(messageSide(CUSTOMER, DESIGNER), "left");
});

test("designer's reply is on the right for the designer, left for the customer", () => {
  assert.equal(messageSide(DESIGNER, DESIGNER), "right");
  assert.equal(messageSide(DESIGNER, CUSTOMER), "left");
});

test("nothing is 'mine' before the viewer's id is known, or for a message with no sender", () => {
  assert.equal(messageSide(CUSTOMER, ""), "left");
  assert.equal(messageSide(CUSTOMER, null), "left");
  assert.equal(messageSide(CUSTOMER, undefined), "left");
  assert.equal(messageSide("", ""), "left");
  assert.equal(messageSide(null, null), "left");
});

test("ids are compared exactly — no partial or case-insensitive matches", () => {
  const HEX = "abcdef12-3456-4789-8abc-def012345678";
  assert.equal(messageSide(HEX.toUpperCase(), HEX), "left");
  assert.equal(messageSide(HEX.slice(0, 8), HEX), "left");
  assert.equal(messageSide(HEX, HEX), "right");
});
