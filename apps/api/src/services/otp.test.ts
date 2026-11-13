import { test } from "node:test";
import assert from "node:assert/strict";
import { otpSendValidation } from "./otp.js";
import { SendError } from "./dispatch.js";

test("accepts a valid E.164 number", () => {
  assert.doesNotThrow(() => otpSendValidation("+63917123456"));
  assert.doesNotThrow(() => otpSendValidation("  +63917123456  "));
  assert.doesNotThrow(() => otpSendValidation("+12025550123"));
});

test("rejects numbers that are not E.164", () => {
  for (const bad of ["63917123456", "0917123456", "+639", "+1234567", "+1234567890123456", "abc", ""]) {
    assert.throws(() => otpSendValidation(bad), SendError, `expected "${bad}" to be rejected`);
  }
});

test("the error carries a 400 and a VALIDATION code", () => {
  try {
    otpSendValidation("nope");
    assert.fail("should have thrown");
  } catch (e: any) {
    assert.equal(e.statusCode, 400);
    assert.equal(e.code, "VALIDATION");
  }
});
