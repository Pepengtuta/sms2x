import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSendPayload } from "./dispatch.js";

test("rejects missing to/message", () => {
  assert.throws(() => parseSendPayload({}), /Missing required/);
  assert.throws(() => parseSendPayload({ to: "+639123" }), /Missing required/);
  assert.throws(() => parseSendPayload({ message: "hi" }), /Missing required/);
});

test("rejects whitespace-only message", () => {
  assert.throws(() => parseSendPayload({ to: "+639123", message: "   " }), /Missing required/);
});

test("rejects body over 1600 characters", () => {
  assert.throws(
    () => parseSendPayload({ to: "+639123", message: "x".repeat(1601) }),
    /1600 characters/
  );
});

test("trims and normalizes optional ids", () => {
  const p = parseSendPayload({
    to: "  +639123  ",
    message: "  hello  ",
    deviceId: "",
    simId: "sim-1",
  });
  assert.equal(p.to, "+639123");
  assert.equal(p.body, "hello");
  assert.equal(p.deviceId, undefined);
  assert.equal(p.simId, "sim-1");
});
