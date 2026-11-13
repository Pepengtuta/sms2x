import { test } from "node:test";
import assert from "node:assert/strict";
import { planPairing } from "./pairing.js";

const ME = "user-me";
const THEM = "user-them";

const live = (id: string, userId: string) => ({ id, userId, revokedAt: null });
const revoked = (id: string, userId: string) => ({ id, userId, revokedAt: new Date() });

test("a phone held by another account is revoked", () => {
  const plan = planPairing([live("d1", THEM)], ME);
  assert.deepEqual(plan.revokeIds, ["d1"]);
  assert.equal(plan.reuseId, null);
});

test("this account's own row is reused, not duplicated", () => {
  const plan = planPairing([live("d1", ME)], ME);
  assert.deepEqual(plan.revokeIds, []);
  assert.equal(plan.reuseId, "d1");
});

test("this account's revoked row is reused so re-pairing restores it", () => {
  const plan = planPairing([revoked("d1", ME)], ME);
  assert.deepEqual(plan.revokeIds, []);
  assert.equal(plan.reuseId, "d1");
});

test("another account's already-revoked row is left alone", () => {
  const plan = planPairing([revoked("d1", THEM)], ME);
  assert.deepEqual(plan.revokeIds, []);
  assert.equal(plan.reuseId, null);
});

test("both cases together: theirs is revoked and ours is reused", () => {
  const plan = planPairing([live("theirs", THEM), live("ours", ME)], ME);
  assert.deepEqual(plan.revokeIds, ["theirs"]);
  assert.equal(plan.reuseId, "ours");
});

test("nothing paired before means nothing to revoke or reuse", () => {
  const plan = planPairing([], ME);
  assert.deepEqual(plan.revokeIds, []);
  assert.equal(plan.reuseId, null);
});
