// Unit tests for lib/auth/routes.ts roleHomePath — where a signed-in account belongs, by VERIFIED role.
// Pure function: no database, no running app. Run with: node --test scripts/test-role-home.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { roleHomePath } from "../lib/auth/routes.ts";

const roles = (o) => ({ isAdmin: false, hasCustomerProfile: false, hasDesignerProfile: false, ...o });

test("admin always goes to /admin — even if the account also has profiles", () => {
  assert.equal(roleHomePath(roles({ isAdmin: true })), "/admin");
  assert.equal(roleHomePath(roles({ isAdmin: true, hasCustomerProfile: true, hasDesignerProfile: true })), "/admin");
});

test("customer goes to the customer home", () => {
  assert.equal(roleHomePath(roles({ hasCustomerProfile: true })), "/home");
});

test("designer-only account goes to the designer dashboard", () => {
  assert.equal(roleHomePath(roles({ hasDesignerProfile: true })), "/designer/home");
});

test("dual-role customer+designer defaults to the customer home", () => {
  assert.equal(roleHomePath(roles({ hasCustomerProfile: true, hasDesignerProfile: true })), "/home");
});

test("an account with no profile yet finishes setup at /choose-role", () => {
  assert.equal(roleHomePath(roles({})), "/choose-role");
});
