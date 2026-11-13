import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveReadiness } from "./readiness.js";

const now = Date.now();

function input(overrides: Record<string, unknown> = {}) {
  return {
    status: "online",
    gatewayEnabled: true,
    lastSeenAt: new Date(now - 5_000),
    serviceRunning: true,
    permissions: { sms: "granted", phoneState: "granted" },
    revokedAt: null,
    sims: [{ enabled: true, isDefault: true }],
    now,
    ...overrides,
  } as any;
}

test("a healthy gateway is ready", () => {
  const r = deriveReadiness(input());
  assert.equal(r.state, "ready");
  assert.equal(r.ready, true);
  assert.equal(r.checks.filter((c) => !c.ok).length, 0);
  assert.match(r.verdict, /Ready to dispatch/);
});

test("a stale heartbeat reads as stale, not ready", () => {
  const r = deriveReadiness(input({ lastSeenAt: new Date(now - 120_000) }));
  assert.equal(r.state, "stale");
  assert.equal(r.ready, false);
  assert.equal(r.checks.find((c) => c.id === "heartbeat")?.ok, false);
});

test("an offline device reads as offline", () => {
  const r = deriveReadiness(input({ status: "offline" }));
  assert.equal(r.state, "offline");
});

test("a revoked device reads as revoked and wins over other blockers", () => {
  const r = deriveReadiness(input({ revokedAt: new Date(), status: "offline" }));
  assert.equal(r.state, "revoked");
  assert.match(r.verdict, /Revoked/);
});

test("a missing SMS permission blocks the gateway", () => {
  const r = deriveReadiness(input({ permissions: { sms: "denied" } }));
  assert.equal(r.state, "unknown");
  assert.equal(r.ready, false);
  const check = r.checks.find((c) => c.id === "sms-permission");
  assert.equal(check?.ok, false);
  assert.match(check!.detail, /denied/);
});

test("a stopped foreground service blocks the gateway", () => {
  const r = deriveReadiness(input({ serviceRunning: false }));
  assert.equal(r.ready, false);
  assert.equal(r.checks.find((c) => c.id === "service")?.ok, false);
});

test("no SIMs blocks the gateway", () => {
  const r = deriveReadiness(input({ sims: [] }));
  assert.equal(r.ready, false);
  assert.equal(r.checks.find((c) => c.id === "sim-inventory")?.ok, false);
});

test("a SIM that is enabled but not default blocks the gateway", () => {
  const r = deriveReadiness(input({ sims: [{ enabled: true, isDefault: false }] }));
  assert.equal(r.ready, false);
  assert.equal(r.checks.find((c) => c.id === "sim-selection")?.ok, false);
});

test("unknown permissions are reported as unknown, not denied", () => {
  const r = deriveReadiness(input({ permissions: null }));
  const check = r.checks.find((c) => c.id === "sms-permission");
  assert.equal(check?.ok, false);
  assert.equal(check?.detail, "Unknown");
});

test("the summary lists every readiness dimension", () => {
  const r = deriveReadiness(input());
  for (const part of ["Heartbeat", "Gateway", "Foreground service", "SMS permission", "SIM", "Credential"]) {
    assert.match(r.summary, new RegExp(part));
  }
});
