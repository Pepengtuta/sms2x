import { DEVICE_STALE_MS } from "./routing.js";

export type DeviceState = "ready" | "offline" | "stale" | "revoked" | "unknown";

export interface ReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface Readiness {
  state: DeviceState;
  ready: boolean;
  checks: ReadinessCheck[];
  verdict: string;
  summary: string;
}

export interface ReadinessInput {
  status: string;
  gatewayEnabled: boolean;
  lastSeenAt: Date;
  serviceRunning?: boolean | null;
  permissions?: Record<string, unknown> | null;
  revokedAt?: Date | null;
  sims: { enabled: boolean; isDefault: boolean }[];
  now?: number;
}

function permissionState(permissions: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = permissions?.[key];
  return typeof value === "string" ? value : null;
}

/**
 * Derives whether a gateway can actually dispatch, and why not.
 *
 * Ported in spirit from the legacy dashboard, but deliberately simpler: one
 * state, a flat list of checks, and a verdict. No blocker taxonomy and no
 * runtime type guards.
 */
export function deriveReadiness(input: ReadinessInput): Readiness {
  const now = input.now ?? Date.now();
  const ageMs = Math.max(0, now - input.lastSeenAt.getTime());
  const ageSeconds = Math.floor(ageMs / 1000);
  const fresh = ageMs < DEVICE_STALE_MS;

  const sms = permissionState(input.permissions, "sms");
  const hasDefaultSim = input.sims.some((s) => s.enabled && s.isDefault);

  const checks: ReadinessCheck[] = [
    {
      id: "heartbeat",
      label: "Heartbeat freshness",
      ok: fresh,
      detail: fresh ? `Fresh · ${ageSeconds}s ago` : `Stale · ${ageSeconds}s ago`,
    },
    {
      id: "gateway",
      label: "Gateway enabled",
      ok: input.gatewayEnabled,
      detail: input.gatewayEnabled ? "Enabled" : "Disabled",
    },
    {
      id: "service",
      label: "Foreground service",
      ok: input.serviceRunning === true,
      detail: input.serviceRunning === true ? "Running" : "Not running",
    },
    {
      id: "sms-permission",
      label: "SMS permission",
      ok: sms === "granted",
      detail: sms === "granted" ? "Granted" : sms ? `Not granted (${sms})` : "Unknown",
    },
    {
      id: "sim-inventory",
      label: "SIM inventory",
      ok: input.sims.length > 0,
      detail: input.sims.length > 0 ? `${input.sims.length} SIM${input.sims.length === 1 ? "" : "s"} reported` : "No SIMs reported",
    },
    {
      id: "sim-selection",
      label: "Enabled/default SIM",
      ok: hasDefaultSim,
      detail: hasDefaultSim ? "Selected SIM is enabled and default" : "No enabled default SIM",
    },
    {
      id: "credential",
      label: "Credential",
      ok: !input.revokedAt,
      detail: input.revokedAt ? "Revoked; re-pair required" : "Active",
    },
  ];

  const failed = checks.filter((c) => !c.ok);

  let state: DeviceState;
  if (input.revokedAt) state = "revoked";
  else if (input.status !== "online") state = "offline";
  else if (!fresh) state = "stale";
  else if (failed.length === 0) state = "ready";
  else state = "unknown";

  const verdict =
    state === "ready"
      ? "Ready to dispatch."
      : state === "revoked"
        ? "Revoked. Pair the device again."
        : state === "offline"
          ? "Gateway offline. It has not heartbeated recently."
          : state === "stale"
            ? "Heartbeat is stale. The gateway may be asleep or blocked."
            : `Blocked: ${failed[0].detail}.`;

  const summary = [
    `Heartbeat ${fresh ? "fresh" : "stale"}`,
    `Gateway ${input.gatewayEnabled ? "enabled" : "disabled"}`,
    `Foreground service ${input.serviceRunning === true ? "running" : "not running"}`,
    `SMS permission ${sms === "granted" ? "granted" : "not granted"}`,
    `${input.sims.length} SIM${input.sims.length === 1 ? "" : "s"}`,
    `Credential ${input.revokedAt ? "revoked" : "active"}`,
  ].join(" · ");

  return { state, ready: state === "ready", checks, verdict, summary };
}
