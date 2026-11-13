import { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";
import { requireApiKey } from "../middleware/auth.js";
import { parseSendPayload, queueMessage } from "../services/dispatch.js";
import { isDeviceOnline } from "../services/routing.js";
import { sendOtp, verifyOtp, otpSendValidation } from "../services/otp.js";
import { checkRateLimit, RATE_LIMITS } from "../services/rateLimit.js";

export async function publicRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireApiKey);

  // POST /v1/messages/send
  app.post("/messages/send", async (request, reply) => {
    const apiKey = (request as any).apiKey;
    const limit = checkRateLimit(`send:${apiKey.id}`, RATE_LIMITS.send.limit, RATE_LIMITS.send.windowMs);
    if (!limit.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many messages sent" },
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const payload = parseSendPayload(request.body);
    const message = await queueMessage(
      (request as any).user.id,
      apiKey.id,
      payload
    );
    return reply.send({ id: message.id, status: "queued" });
  });

  // POST /v1/otp/send — queue a one-time verification code
  app.post("/otp/send", async (request, reply) => {
    const apiKey = (request as any).apiKey;
    const { to, deviceId, simId } = (request.body ?? {}) as {
      to?: string;
      deviceId?: string;
      simId?: string;
    };
    if (!to?.trim()) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "Recipient is required" } });
    }
    otpSendValidation(to);

    const perPhone = checkRateLimit(
      `otp:phone:${to.trim()}`,
      RATE_LIMITS.otpSendPerPhone.limit,
      RATE_LIMITS.otpSendPerPhone.windowMs
    );
    if (!perPhone.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many codes requested for that number" },
        retryAfterSeconds: perPhone.retryAfterSeconds,
      });
    }
    const perKey = checkRateLimit(
      `otp:key:${apiKey.id}`,
      RATE_LIMITS.otpSend.limit,
      RATE_LIMITS.otpSend.windowMs
    );
    if (!perKey.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many codes requested" },
        retryAfterSeconds: perKey.retryAfterSeconds,
      });
    }

    const result = await sendOtp(
      (request as any).user.id,
      apiKey.id,
      to.trim(),
      typeof deviceId === "string" ? deviceId : undefined,
      typeof simId === "string" ? simId : undefined
    );
    return reply.status(201).send(result);
  });

  // POST /v1/otp/verify
  app.post("/otp/verify", async (request, reply) => {
    const { to, code } = (request.body ?? {}) as { to?: string; code?: string };
    if (!to?.trim() || !code?.trim()) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "Recipient and code are required" } });
    }
    const result = await verifyOtp((request as any).user.id, to.trim(), code.trim());
    return reply.send(result);
  });

  // GET /v1/messages/:id
  app.get("/messages/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await prisma.message.findFirst({
      where: { id, userId: (request as any).user.id },
    });
    if (!message) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
    }
    return reply.send({
      id: message.id,
      to: message.to,
      body: message.body,
      status: message.status,
      createdAt: message.createdAt.getTime(),
      ...(message.claimedAt ? { claimedAt: message.claimedAt.getTime() } : {}),
      ...(message.sendingAt ? { sendingAt: message.sendingAt.getTime() } : {}),
      ...(message.sentAt ? { sentAt: message.sentAt.getTime() } : {}),
      ...(message.failedAt ? { failedAt: message.failedAt.getTime() } : {}),
      ...(message.errorMessage ? { errorMessage: message.errorMessage } : {}),
    });
  });

  // GET /v1/devices
  app.get("/devices", async (request, reply) => {
    const userId = (request as any).user.id;
    const [devices, user] = await Promise.all([
      prisma.device.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      prisma.user.findUnique({ where: { id: userId }, select: { defaultDeviceId: true } }),
    ]);

    return reply.send({
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        status: isDeviceOnline(d) ? "online" : "offline",
        ready: isDeviceOnline(d),
        gatewayEnabled: d.gatewayEnabled,
        lastSeenAt: d.lastSeenAt.getTime(),
        isDefault: user?.defaultDeviceId === d.id,
      })),
    });
  });

  // GET /v1/devices/:id/sims
  app.get("/devices/:id/sims", async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await prisma.device.findFirst({
      where: { id, userId: (request as any).user.id },
    });
    if (!device) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Device not found" } });
    }

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
}
