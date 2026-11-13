import { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "crypto";
import { prisma } from "../plugins/prisma.js";
import { requireJwt } from "../middleware/auth.js";
import { parseSendPayload, queueMessage } from "../services/dispatch.js";
import { isDeviceOnline, DEVICE_STALE_MS } from "../services/routing.js";
import { deriveReadiness } from "../services/readiness.js";
import { computeHealth } from "../services/health.js";
import { sendOtp, verifyOtp, otpSendValidation } from "../services/otp.js";
import { checkRateLimit, RATE_LIMITS } from "../services/rateLimit.js";
import { createPairingToken } from "./gateway.js";

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /dashboard/summary
  app.get("/summary", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const [total, sent, failed, devices] = await Promise.all([
      prisma.message.count({ where: { userId: user.id } }),
      prisma.message.count({ where: { userId: user.id, status: "sent" } }),
      prisma.message.count({ where: { userId: user.id, status: "failed" } }),
      prisma.device.count({
        where: {
          userId: user.id,
          status: "online",
          gatewayEnabled: true,
          lastSeenAt: { gte: new Date(Date.now() - DEVICE_STALE_MS) },
        },
      }),
    ]);
    return reply.send({ total, sent, failed, devicesOnline: devices });
  });

  // GET /dashboard/api-keys
  app.get("/api-keys", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({
      apiKeys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        createdAt: k.createdAt.getTime(),
        ...(k.lastUsedAt ? { lastUsedAt: k.lastUsedAt.getTime() } : {}),
        ...(k.revokedAt ? { revokedAt: k.revokedAt.getTime() } : {}),
      })),
    });
  });

  // POST /dashboard/api-keys
  app.post("/api-keys", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const { name } = (request.body as any) ?? {};
    const keyName = typeof name === "string" && name.trim() ? name.trim() : "API Key";

    const secret = `sms_live_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(secret).digest("hex");
    const keyPrefix = secret.slice(0, 16);

    const apiKey = await prisma.apiKey.create({
      data: { name: keyName, keyHash, keyPrefix, userId: user.id },
    });

    return reply.status(201).send({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt.getTime(),
      secret, // shown once
    });
  });

  // POST /dashboard/api-keys/:id/revoke
  app.post("/api-keys/:id/revoke", { preHandler: requireJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const key = await prisma.apiKey.findFirst({ where: { id, userId: user.id } });
    if (!key) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "API key not found" } });
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return reply.send({ success: true });
  });

  // GET /dashboard/devices
  app.get("/devices", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const devices = await prisma.device.findMany({
      where: { userId: user.id },
      include: { _count: { select: { simCards: true } }, simCards: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({
      devices: devices.map((d) => {
        const readiness = deriveReadiness({
          status: d.status,
          gatewayEnabled: d.gatewayEnabled,
          lastSeenAt: d.lastSeenAt,
          serviceRunning: d.serviceRunning,
          permissions: (d.permissions as Record<string, unknown> | null) ?? null,
          revokedAt: d.revokedAt,
          sims: d.simCards,
        });
        return {
          id: d.id,
          name: d.name,
          status: isDeviceOnline(d) ? "online" : "offline",
          ready: readiness.ready,
          state: readiness.state,
          summary: readiness.summary,
          gatewayEnabled: d.gatewayEnabled,
          androidVersion: d.androidVersion ?? undefined,
          serviceRunning: d.serviceRunning ?? undefined,
          revokedAt: d.revokedAt ? d.revokedAt.getTime() : undefined,
          simCount: d._count.simCards,
          isDefault: user.defaultDeviceId === d.id,
          lastSeenAt: d.lastSeenAt.getTime(),
        };
      }),
    });
  });

  // GET /dashboard/devices/:id — full device detail
  app.get("/devices/:id", { preHandler: requireJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const device = await prisma.device.findFirst({ where: { id, userId: user.id } });
    if (!device) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Device not found" } });

    const sims = await prisma.simCard.findMany({ where: { deviceId: device.id }, orderBy: { slotIndex: "asc" } });

    const readiness = deriveReadiness({
      status: device.status,
      gatewayEnabled: device.gatewayEnabled,
      lastSeenAt: device.lastSeenAt,
      serviceRunning: device.serviceRunning,
      permissions: (device.permissions as Record<string, unknown> | null) ?? null,
      revokedAt: device.revokedAt,
      sims,
    });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [counts, perSim, failureRows, recent, timelineRows] = await Promise.all([
      prisma.message.groupBy({ by: ["status"], where: { deviceId: device.id }, _count: { _all: true } }),
      prisma.message.groupBy({ by: ["simId", "status"], where: { deviceId: device.id }, _count: { _all: true } }),
      prisma.message.groupBy({
        by: ["failureReason", "errorMessage"],
        where: { deviceId: device.id, status: "failed" },
        _count: { _all: true },
      }),
      prisma.message.findMany({
        where: { deviceId: device.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.$queryRaw<{ day: Date; status: string; count: number }[]>`
        SELECT date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS day,
               status,
               COUNT(*)::int AS count
        FROM "Message"
        WHERE "deviceId" = ${device.id} AND "createdAt" >= ${since}
        GROUP BY 1, 2
      `,
    ]);

    const countFor = (status: string) =>
      counts.find((c) => c.status === status)?._count._all ?? 0;

    const simCounts = sims.map((s) => ({
      simId: s.id,
      carrierName: s.carrierName,
      sent: perSim.find((p) => p.simId === s.id && p.status === "sent")?._count._all ?? 0,
      failed: perSim.find((p) => p.simId === s.id && p.status === "failed")?._count._all ?? 0,
    }));

    // Group by the structured reason; fall back to raw text for older rows.
    const failures = failureRows
      .map((f) => ({
        reason: (f.failureReason as string | null) ?? (f.errorMessage as string) ?? "UNCLASSIFIED",
        count: f._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // One entry per day for the last 7 days, oldest first.
    const days: { day: string; sent: number; failed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      days.push({
        day: key,
        sent: timelineRows.filter((r) => r.day.toISOString().slice(0, 10) === key && r.status === "sent").reduce((a, r) => a + r.count, 0),
        failed: timelineRows.filter((r) => r.day.toISOString().slice(0, 10) === key && r.status === "failed").reduce((a, r) => a + r.count, 0),
      });
    }

    return reply.send({
      device: {
        id: device.id,
        name: device.name,
        status: isDeviceOnline(device) ? "online" : "offline",
        ready: readiness.ready,
        state: readiness.state,
        verdict: readiness.verdict,
        checks: readiness.checks,
        summary: readiness.summary,
        gatewayEnabled: device.gatewayEnabled,
        androidVersion: device.androidVersion ?? undefined,
        serviceRunning: device.serviceRunning ?? undefined,
        permissions: (device.permissions as Record<string, unknown> | null) ?? undefined,
        isDefault: user.defaultDeviceId === device.id,
        lastSeenAt: device.lastSeenAt.getTime(),
        pairedAt: device.createdAt.getTime(),
        revokedAt: device.revokedAt ? device.revokedAt.getTime() : undefined,
      },
      sims: sims.map((s) => ({
        id: s.id,
        subscriptionId: s.subscriptionId,
        slotIndex: s.slotIndex,
        carrierName: s.carrierName,
        phoneNumber: s.phoneNumber,
        enabled: s.enabled,
        isDefault: s.isDefault,
      })),
      messageCounts: {
        total: counts.reduce((a, c) => a + c._count._all, 0),
        sent: countFor("sent"),
        failed: countFor("failed"),
        queued: countFor("queued") + countFor("sending"),
      },
      simCounts,
      failures,
      timeline: days,
      recentMessages: recent.map((m) => ({
        id: m.id,
        to: m.to,
        body: m.body,
        status: m.status,
        errorMessage: m.errorMessage ?? undefined,
        createdAt: m.createdAt.getTime(),
      })),
    });
  });

  // PATCH /dashboard/devices/:id — rename / enable / disable
  app.patch("/devices/:id", { preHandler: requireJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const device = await prisma.device.findFirst({ where: { id, userId: user.id } });
    if (!device) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Device not found" } });

    const body = (request.body ?? {}) as { name?: unknown; gatewayEnabled?: unknown };
    const data: { name?: string; gatewayEnabled?: boolean } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.gatewayEnabled === "boolean") data.gatewayEnabled = body.gatewayEnabled;
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "Nothing to update" } });
    }

    const updated = await prisma.device.update({ where: { id }, data });
    return reply.send({ success: true, device: { id: updated.id, name: updated.name, gatewayEnabled: updated.gatewayEnabled } });
  });

  // PATCH /dashboard/devices/:id/sims/:simId — enable / default
  app.patch("/devices/:id/sims/:simId", { preHandler: requireJwt }, async (request, reply) => {
    const { id, simId } = request.params as { id: string; simId: string };
    const user = (request as any).user;
    const device = await prisma.device.findFirst({ where: { id, userId: user.id } });
    if (!device) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Device not found" } });

    const body = (request.body ?? {}) as { enabled?: unknown; isDefault?: unknown };
    const data: { enabled?: boolean; isDefault?: boolean } = {};
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body.isDefault === "boolean") data.isDefault = body.isDefault;
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "Nothing to update" } });
    }

    // Only one default SIM per device.
    if (data.isDefault === true) {
      await prisma.simCard.updateMany({ where: { deviceId: device.id }, data: { isDefault: false } });
    }

    const updated = await prisma.simCard.update({ where: { id: simId }, data });
    return reply.send({ success: true, sim: { id: updated.id, enabled: updated.enabled, isDefault: updated.isDefault } });
  });

  // POST /dashboard/devices/:id/revoke
  app.post("/devices/:id/revoke", { preHandler: requireJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const device = await prisma.device.findFirst({ where: { id, userId: user.id } });
    if (!device) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Device not found" } });

    await prisma.device.update({ where: { id }, data: { revokedAt: new Date() } });
    return reply.send({ success: true });
  });

  // GET /dashboard/devices/:id/sims
  app.get("/devices/:id/sims", { preHandler: requireJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const device = await prisma.device.findFirst({ where: { id, userId: user.id } });
    if (!device) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Device not found" } });

    const sims = await prisma.simCard.findMany({
      where: { deviceId: device.id },
      orderBy: { slotIndex: "asc" },
    });
    return reply.send({
      sims: sims.map((s) => ({
        id: s.id,
        slotIndex: s.slotIndex,
        carrierName: s.carrierName,
        name: s.carrierName || `SIM ${s.slotIndex + 1}`,
        phoneNumber: s.phoneNumber,
        enabled: s.enabled,
        isDefault: s.isDefault,
      })),
    });
  });

  // POST /dashboard/messages/send
  app.post("/messages/send", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const payload = parseSendPayload(request.body);
    const message = await queueMessage(user.id, null, payload);
    return reply.send({ id: message.id, status: "queued" });
  });

  // POST /dashboard/devices/default
  app.post("/devices/default", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const { deviceId } = (request.body as any) ?? {};
    if (!deviceId) return reply.status(400).send({ error: { code: "VALIDATION", message: "deviceId required" } });

    const device = await prisma.device.findFirst({ where: { id: deviceId, userId: user.id } });
    if (!device) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Device not found" } });

    await prisma.user.update({ where: { id: user.id }, data: { defaultDeviceId: deviceId } });
    return reply.send({ success: true });
  });

  // GET /dashboard/messages
  app.get("/messages", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const { page = "1", limit = "20", status } = request.query as {
      page?: string;
      limit?: string;
      status?: string;
    };
    const take = Math.min(Number(limit), 100);
    const skip = (Number(page) - 1) * take;
    const where = {
      userId: user.id,
      ...(status && status !== "all" ? { status } : {}),
    };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.message.count({ where }),
    ]);

    return reply.send({
      messages: messages.map((m) => ({
        id: m.id,
        to: m.to,
        body: m.body,
        status: m.status,
        createdAt: m.createdAt.getTime(),
        ...(m.claimedAt ? { claimedAt: m.claimedAt.getTime() } : {}),
        ...(m.sentAt ? { sentAt: m.sentAt.getTime() } : {}),
        ...(m.failedAt ? { failedAt: m.failedAt.getTime() } : {}),
        ...(m.errorMessage ? { errorMessage: m.errorMessage } : {}),
        ...(m.failureReason ? { failureReason: m.failureReason } : {}),
      })),
      pagination: { total, page: Number(page), limit: take },
    });
  });

  // GET /dashboard/messages/:id — full message with its lifecycle
  app.get("/messages/:id", { preHandler: requireJwt }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const message = await prisma.message.findFirst({
      where: { id, userId: user.id },
      include: { device: true, sim: true, apiKey: true },
    });
    if (!message) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
    }

    return reply.send({
      id: message.id,
      to: message.to,
      body: message.body,
      status: message.status,
      correlationId: message.correlationId,
      errorMessage: message.errorMessage ?? undefined,
      failureReason: message.failureReason ?? undefined,
      createdAt: message.createdAt.getTime(),
      claimedAt: message.claimedAt?.getTime() ?? undefined,
      sendingAt: message.sendingAt?.getTime() ?? undefined,
      sentAt: message.sentAt?.getTime() ?? undefined,
      failedAt: message.failedAt?.getTime() ?? undefined,
      device: message.device ? { id: message.device.id, name: message.device.name } : null,
      sim: message.sim
        ? {
            id: message.sim.id,
            carrierName: message.sim.carrierName,
            slotIndex: message.sim.slotIndex,
            phoneNumber: message.sim.phoneNumber,
          }
        : null,
      apiKey: message.apiKey ? { id: message.apiKey.id, name: message.apiKey.name } : null,
    });
  });

  // GET /dashboard/health
  app.get("/health", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    return reply.send(await computeHealth(user.id));
  });

  // POST /dashboard/otp/send
  app.post("/otp/send", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const { to, deviceId, simId } = (request.body ?? {}) as {
      to?: string;
      deviceId?: string;
      simId?: string;
    };
    if (!to?.trim()) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "Recipient is required" } });
    }
    otpSendValidation(to);

    const limit = checkRateLimit(`otp:phone:${to.trim()}`, RATE_LIMITS.otpSendPerPhone.limit, RATE_LIMITS.otpSendPerPhone.windowMs);
    if (!limit.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many codes requested for that number" },
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const result = await sendOtp(
      user.id,
      null,
      to.trim(),
      typeof deviceId === "string" ? deviceId : undefined,
      typeof simId === "string" ? simId : undefined
    );
    return reply.status(201).send(result);
  });

  // POST /dashboard/otp/verify
  app.post("/otp/verify", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const { to, code } = (request.body ?? {}) as { to?: string; code?: string };
    if (!to?.trim() || !code?.trim()) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "Recipient and code are required" } });
    }
    const result = await verifyOtp(user.id, to.trim(), code.trim());
    return reply.send(result);
  });

  // POST /dashboard/pairing-token  — QR code flow
  app.post("/pairing-token", { preHandler: requireJwt }, async (request, reply) => {
    const user = (request as any).user;
    const limit = checkRateLimit(
      `pairing:${user.id}`,
      RATE_LIMITS.pairingToken.limit,
      RATE_LIMITS.pairingToken.windowMs
    );
    if (!limit.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many pairing tokens requested" },
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
    const token = createPairingToken(user.id);
    return reply.status(201).send({ token });
  });
}

