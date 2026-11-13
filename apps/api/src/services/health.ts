import { prisma } from "../plugins/prisma.js";
import { deriveReadiness } from "./readiness.js";
import { isDeviceOnline } from "./routing.js";

const STUCK_AFTER_MS = 120_000;

export interface HealthReport {
  latency: { p50: number | null; p95: number | null; max: number | null; samples: number };
  queue: {
    queued: number;
    sending: number;
    stuck: number;
    oldestQueuedAgeMs: number | null;
  };
  devices: {
    total: number;
    fresh: number;
    ready: number;
    stale: number;
    offline: number;
    blocked: number;
    revoked: number;
  };
  deviceRows: {
    id: string;
    name: string;
    state: string;
    heartbeatAgeMs: number | null;
    gatewayEnabled: boolean;
    serviceRunning: boolean | null;
    smsPermission: string | null;
    simCount: number;
  }[];
  failures: { reason: string; count: number }[];
  volume: { day: string; sent: number; failed: number }[];
}

/**
 * Operational health for the account, computed from data already stored.
 *
 * Deliberately excludes historical heartbeat availability: that would need a
 * sampled heartbeat history table, which AGENT.md forbids.
 */
export async function computeHealth(userId: string): Promise<HealthReport> {
  const now = Date.now();

  const [latencyRows, devices, queued, sending, stuck, oldestQueued, failureRows, timelineRows] =
    await Promise.all([
      prisma.$queryRaw<
        { samples: number; p50: number | null; p95: number | null; max: number | null }[]
      >`
        SELECT COUNT(*)::int AS samples,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("sentAt" - "createdAt")) * 1000) AS p50,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("sentAt" - "createdAt")) * 1000) AS p95,
               MAX(EXTRACT(EPOCH FROM ("sentAt" - "createdAt")) * 1000)::float8 AS max
        FROM "Message"
        WHERE "userId" = ${userId} AND status = 'sent' AND "sentAt" IS NOT NULL
      `,
      prisma.device.findMany({ where: { userId }, include: { simCards: true } }),
      prisma.message.count({ where: { userId, status: "queued" } }),
      prisma.message.count({ where: { userId, status: "sending" } }),
      prisma.message.count({
        where: { userId, status: "sending", sendingAt: { lt: new Date(now - STUCK_AFTER_MS) } },
      }),
      prisma.message.findFirst({
        where: { userId, status: "queued" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.message.groupBy({
        by: ["failureReason"],
        where: { userId, status: "failed" },
        _count: { _all: true },
      }),
      prisma.$queryRaw<{ day: Date; status: string; count: number }[]>`
        SELECT date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS day,
               status,
               COUNT(*)::int AS count
        FROM "Message"
        WHERE "userId" = ${userId}
          AND "createdAt" >= ${new Date(now - 7 * 24 * 60 * 60 * 1000)}
        GROUP BY 1, 2
      `,
    ]);

  const latency = latencyRows[0];
  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  const failures = failureRows
    .map((f) => ({
      reason: (f.failureReason as string | null) ?? "UNCLASSIFIED",
      count: f._count._all,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const volume: { day: string; sent: number; failed: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    volume.push({
      day: key,
      sent: timelineRows
        .filter((r) => r.day.toISOString().slice(0, 10) === key && r.status === "sent")
        .reduce((a, r) => a + r.count, 0),
      failed: timelineRows
        .filter((r) => r.day.toISOString().slice(0, 10) === key && r.status === "failed")
        .reduce((a, r) => a + r.count, 0),
    });
  }

  const readiness = devices.map((d) =>
    deriveReadiness({
      status: d.status,
      gatewayEnabled: d.gatewayEnabled,
      lastSeenAt: d.lastSeenAt,
      serviceRunning: d.serviceRunning,
      permissions: (d.permissions as Record<string, unknown> | null) ?? null,
      revokedAt: d.revokedAt,
      sims: d.simCards,
    })
  );

  // Per-device rows so a multi-phone account can see which phone is unhealthy.
  // `readiness` was built from `devices` in the same order, so index them together.
  const deviceRows = devices
    .map((d, index) => {
      const sms = (d.permissions as Record<string, unknown> | null)?.sms;
      return {
        id: d.id,
        name: d.name,
        state: readiness[index]?.state ?? "unknown",
        heartbeatAgeMs: now - d.lastSeenAt.getTime(),
        gatewayEnabled: d.gatewayEnabled,
        serviceRunning: d.serviceRunning ?? null,
        smsPermission: typeof sms === "string" ? sms : null,
        simCount: d.simCards.length,
      };
    })
    .sort((a, b) => b.heartbeatAgeMs - a.heartbeatAgeMs);

  return {
    latency: {
      p50: num(latency?.p50),
      p95: num(latency?.p95),
      max: num(latency?.max),
      samples: latency?.samples ?? 0,
    },
    queue: {
      queued,
      sending,
      stuck,
      oldestQueuedAgeMs: oldestQueued ? now - oldestQueued.createdAt.getTime() : null,
    },
    devices: {
      total: devices.length,
      fresh: devices.filter((d) => isDeviceOnline(d)).length,
      // These five are a disjoint set: ready + stale + offline + blocked + revoked === total.
      ready: readiness.filter((r) => r.ready).length,
      stale: readiness.filter((r) => r.state === "stale").length,
      offline: readiness.filter((r) => r.state === "offline").length,
      blocked: readiness.filter((r) => r.state === "unknown").length,
      revoked: readiness.filter((r) => r.state === "revoked").length,
    },
    deviceRows,
    failures,
    volume,
  };
}
