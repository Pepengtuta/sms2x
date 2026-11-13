import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeviceOnline, DEVICE_STALE_MS } from "./routing.js";

const now = Date.now();

function device(overrides: Partial<{ status: string; gatewayEnabled: boolean; lastSeenAt: Date }> = {}) {
  return {
    status: "online",
    gatewayEnabled: true,
    lastSeenAt: new Date(now - 10_000),
    ...overrides,
  };
}

test("a fresh heartbeat is online", () => {
  assert.equal(isDeviceOnline(device(), now), true);
});

test("a stale device reads as offline", () => {
  const d = device({ lastSeenAt: new Date(now - DEVICE_STALE_MS - 1000) });
  assert.equal(isDeviceOnline(d, now), false);
});

test("a device just inside the window is still online", () => {
  const d = device({ lastSeenAt: new Date(now - DEVICE_STALE_MS + 1000) });
  assert.equal(isDeviceOnline(d, now), true);
});

test("a disabled gateway is never online", () => {
  assert.equal(isDeviceOnline(device({ gatewayEnabled: false }), now), false);
});

test("a device whose status was flipped to offline is not online", () => {
  assert.equal(isDeviceOnline(device({ status: "offline" }), now), false);
});
