import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLoginIdentifier, ADMIN_EMAIL } from "./admin.js";

test("'admin' resolves to the admin account", () => {
  assert.equal(resolveLoginIdentifier("admin"), ADMIN_EMAIL);
});

test("'admin' is matched case-insensitively and trimmed", () => {
  assert.equal(resolveLoginIdentifier("ADMIN"), ADMIN_EMAIL);
  assert.equal(resolveLoginIdentifier("  Admin  "), ADMIN_EMAIL);
});

test("a normal email is passed through untouched", () => {
  assert.equal(resolveLoginIdentifier("me@example.com"), "me@example.com");
  assert.equal(resolveLoginIdentifier("  me@example.com  "), "me@example.com");
});

test("a similar-looking name is not treated as admin", () => {
  assert.equal(resolveLoginIdentifier("administrator"), "administrator");
  assert.equal(resolveLoginIdentifier("admin2"), "admin2");
});
