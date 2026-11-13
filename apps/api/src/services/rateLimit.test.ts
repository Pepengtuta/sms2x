import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, sweepRateLimits, rateLimitBucketCount, RATE_LIMITS } from "./rateLimit.js";

test("allows requests under the limit", () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(checkRateLimit(key, 3, 60_000).allowed, true);
  }
});

test("blocks once the limit is exceeded and reports a retry delay", () => {
  const key = `test:${Math.random()}`;
  checkRateLimit(key, 2, 60_000);
  checkRateLimit(key, 2, 60_000);
  const blocked = checkRateLimit(key, 2, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.ok(blocked.retryAfterSeconds <= 60);
});

test("separate keys have separate counters", () => {
  const a = `test:${Math.random()}`;
  const b = `test:${Math.random()}`;
  checkRateLimit(a, 1, 60_000);
  assert.equal(checkRateLimit(a, 1, 60_000).allowed, false);
  assert.equal(checkRateLimit(b, 1, 60_000).allowed, true);
});

test("the window resets after it expires", async () => {
  const key = `test:${Math.random()}`;
  checkRateLimit(key, 1, 50);
  assert.equal(checkRateLimit(key, 1, 50).allowed, false);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(checkRateLimit(key, 1, 50).allowed, true);
});

test("sweeping removes expired buckets", async () => {
  const key = `test:${Math.random()}`;
  checkRateLimit(key, 1, 20);
  await new Promise((r) => setTimeout(r, 40));
  const before = rateLimitBucketCount();
  sweepRateLimits();
  assert.ok(rateLimitBucketCount() < before, "expired bucket should be removed");
});

test("the shipped limits are sane", () => {
  assert.ok(RATE_LIMITS.login.limit > 0);
  assert.ok(RATE_LIMITS.send.limit > 0);
  assert.ok(RATE_LIMITS.otpSendPerPhone.limit <= 10);
  assert.ok(RATE_LIMITS.otpSendPerPhone.windowMs >= 60 * 60 * 1000);
});
