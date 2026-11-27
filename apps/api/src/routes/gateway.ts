import { FastifyInstance } from "fastify";
import { randomBytes, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma.js";
import { requireDeviceToken } from "../middleware/auth.js";
import { planPairing } from "../services/pairing.js";
import { normalizePeer } from "../services/dispatch.js";

// shortcut: pairing tokens stored in-memory, lost on restart — upgrade to DB column if multi-instance
const pairingTokens = new Map<string, { userId: string; expiresAt: number }>();

// A message claimed by a gateway but never reported on for this long is requeued.
const MESSAGE_STUCK_MS = 120_000;

export function createPairingToken(userId: string): string {
  const token = randomBytes(16).toString("hex");
  pairingTokens.set(token, { userId, expiresAt: Date.now() + 5 * 60_000 }); // 5 min TTL
  return token;
}

export async function gatewayRoutes(app: FastifyInstance) {
  // POST /gateway/pair
  app.post("/pair", async (request, reply) => {
    const { pairingToken, deviceName, deviceIdentifier } = request.body as {
      pairingToken?: string;
      deviceName?: string;
      deviceIdentifier?: string;
    };
    if (!pairingToken || !deviceName) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "pairingToken and deviceName required" } });
    }

    const entry = pairingTokens.get(pairingToken);
    if (!entry || entry.expiresAt < Date.now()) {
      pairingTokens.delete(pairingToken);
      return reply.status(401).send({ error: { code: "INVALID_TOKEN", message: "Pairing token invalid or expired" } });
    }
    pairingTokens.delete(pairingToken);

    const identifier = typeof deviceIdentifier === "string" && deviceIdentifier.trim()
      ? deviceIdentifier.trim()
      : null;

    // The same physical phone may already be paired — possibly to another
    // account. Revoke the other holder so their token stops working and their
    // dashboard does not keep showing a phone that is no longer theirs.
    const existing = identifier
      ? await prisma.device.findMany({ where: { deviceIdentifier: identifier } })
      : [];

    const plan = planPairing(existing, entry.userId);
    if (plan.revokeIds.length > 0) {
      await prisma.device.updateMany({
        where: { id: { in: plan.revokeIds } },
        data: { revokedAt: new Date() },
      });
    }

    // Re-pairing under the same account reuses the existing row.
    const deviceToken = randomBytes(32).toString("hex");
    const device = plan.reuseId
      ? await prisma.device.update({
          where: { id: plan.reuseId },
          data: {
            deviceToken,
            name: deviceName,
            status: "offline",
            revokedAt: null,
            ...(identifier ? { deviceIdentifier: identifier } : {}),
          },
        })
      : await prisma.device.create({
          data: {
            name: deviceName,
            deviceToken,
            status: "offline",
            gatewayEnabled: true,
            userId: entry.userId,
            ...(identifier ? { deviceIdentifier: identifier } : {}),
          },
        });

    return reply.status(201).send({ deviceToken, deviceId: device.id });
  });

  // POST /gateway/unpair — the phone releases itself from the account
  app.post("/unpair", { preHandler: requireDeviceToken }, async (request, reply) => {
    const device = (request as any).device;
    await prisma.device.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });
    return reply.send({ success: true });
  });

  // POST /gateway/heartbeat
  app.post("/heartbeat", { preHandler: requireDeviceToken }, async (request, reply) => {
    const device = (request as any).device;
    const { sims, androidVersion, serviceRunning, permissions } = (request.body as any) ?? {};

    await prisma.device.update({
      where: { id: device.id },
      data: {
        status: "online",
        lastSeenAt: new Date(),
        ...(typeof androidVersion === "string" && androidVersion
          ? { androidVersion }
          : {}),
        ...(typeof serviceRunning === "boolean" ? { serviceRunning } : {}),
        ...(permissions && typeof permissions === "object"
          ? { permissions: permissions as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (Array.isArray(sims)) {
      // Android reassigns subscription IDs when a SIM is reinserted or moved, so
      // remember which physical slots were default and carry that across.
      const previousDefaults = await prisma.simCard.findMany({
        where: { deviceId: device.id, isDefault: true },
        select: { slotIndex: true },
      });
      const defaultSlots = previousDefaults.map((s) => s.slotIndex);

      const reported: number[] = [];
      for (const sim of sims) {
        const subscriptionId = Number(sim.subscriptionId);
        if (!Number.isFinite(subscriptionId)) continue;
        const slotIndex = sim.slotIndex ?? 0;
        reported.push(subscriptionId);
        await prisma.simCard.upsert({
          where: { deviceId_subscriptionId: { deviceId: device.id, subscriptionId } },
          update: {
            slotIndex,
            carrierName: sim.carrierName ?? "Unknown",
            phoneNumber: sim.phoneNumber ?? null,
            enabled: sim.enabled ?? true,
          },
          create: {
            deviceId: device.id,
            subscriptionId,
            slotIndex,
            carrierName: sim.carrierName ?? "Unknown",
            phoneNumber: sim.phoneNumber ?? null,
            enabled: sim.enabled ?? true,
            isDefault: defaultSlots.includes(slotIndex),
          },
        });
      }

      // Android reassigns subscription IDs when a SIM is reinserted or moved.
      // Disable rows the phone no longer reports, otherwise routing keeps picking
      // a SIM that no longer exists and every send fails.
      if (reported.length > 0) {
        await prisma.simCard.updateMany({
          where: { deviceId: device.id, subscriptionId: { notIn: reported } },
          data: { enabled: false, isDefault: false },
        });

        // Reconciliation can clear the last default. Restore one so routing
        // stays deterministic on a dual-SIM phone.
        const enabled = await prisma.simCard.findMany({
          where: { deviceId: device.id, enabled: true },
          orderBy: { slotIndex: "asc" },
        });
        if (enabled.length > 0 && !enabled.some((s) => s.isDefault)) {
          await prisma.simCard.update({
            where: { id: enabled[0].id },
            data: { isDefault: true },
          });
        }
      }
    }

    return reply.send({ success: true });
  });

  // GET /gateway/poll
  app.get("/poll", { preHandler: requireDeviceToken }, async (request, reply) => {
    const device = (request as any).device;

    // Requeue messages this device claimed but never reported on (crashed mid-send).
    await prisma.message.updateMany({
      where: {
        deviceId: device.id,
        status: "sending",
        sendingAt: { lt: new Date(Date.now() - MESSAGE_STUCK_MS) },
      },
      data: { status: "queued", claimedAt: null, sendingAt: null, errorMessage: "Requeued: gateway did not report status in time" },
    });

    const message = await prisma.message.findFirst({
      where: { deviceId: device.id, status: "queued" },
      orderBy: { createdAt: "asc" },
      include: { sim: true },
    });

    if (!message) return reply.send({ message: null });

    await prisma.message.update({
      where: { id: message.id },
      data: { status: "sending", claimedAt: new Date(), sendingAt: new Date() },
    });

    return reply.send({
      message: {
        id: message.id,
        to: message.to,
        body: message.body,
        subscriptionId: message.sim?.subscriptionId ?? null,
        correlationId: message.correlationId,
        createdAt: message.createdAt.getTime(),
      },
    });
  });

  // POST /gateway/messages/:id/status
  app.post("/messages/:id/status", { preHandler: requireDeviceToken }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, errorMessage, error, failureReason } = (request.body as any) ?? {};
    const failureReasonValue = typeof failureReason === "string" ? failureReason : null;
    const failureMessage = errorMessage ?? error;
    const device = (request as any).device;

    const message = await prisma.message.findFirst({ where: { id, deviceId: device.id } });
    if (!message) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
    }

    const validStatuses = ["sending", "sent", "failed"];
    if (!validStatuses.includes(status)) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: `status must be one of: ${validStatuses.join(", ")}` } });
    }

    await prisma.message.update({
      where: { id },
      data: {
        status,
        ...(status === "sent" ? { sentAt: new Date() } : {}),
        ...(status === "failed"
          ? {
              failedAt: new Date(),
              errorMessage: failureMessage ?? "Unknown error",
              ...(failureReasonValue ? { failureReason: failureReasonValue } : {}),
            }
          : {}),
      },
    });

    return reply.send({ success: true });
  });

  // POST /gateway/sms/sync — upload inbound SMS from the phone
  app.post("/sms/sync", { preHandler: requireDeviceToken }, async (request, reply) => {
    const device = (request as any).device;
    const { messages } = (request.body as { messages?: unknown }) ?? {};
    if (!Array.isArray(messages) || messages.length > 100) {
      return reply.status(400).send({
        error: { code: "VALIDATION", message: "messages must be an array of at most 100 items" },
      });
    }

    const sims = await prisma.simCard.findMany({ where: { deviceId: device.id } });
    const simBySub = new Map(sims.map((s) => [s.subscriptionId, s]));

    let synced = 0;
    for (const raw of messages) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const androidSmsId = typeof item.androidSmsId === "string" ? item.androidSmsId.trim() : "";
      const from = typeof item.from === "string" ? item.from.trim() : "";
      const body = typeof item.body === "string" ? item.body : "";
      const ts = typeof item.timestamp === "number" && Number.isFinite(item.timestamp) ? item.timestamp : Date.now();
      if (!androidSmsId || !from || !body) continue;

      const subId = typeof item.subscriptionId === "number" ? item.subscriptionId : null;
      const sim = subId !== null ? simBySub.get(subId) : undefined;
      const contactName = typeof item.contactName === "string" && item.contactName.trim() ? item.contactName.trim() : null;
      const receivedAt = new Date(ts);
      const peer = normalizePeer(from);

      // shortcut: raw SQL until inbound columns are added to schema.prisma
      const affected = await prisma.$executeRaw`
        INSERT INTO "Message" (
          "id", "userId", "deviceId", "simId", "to", "body", "status",
          "correlationId", "direction", "fromNumber", "peer", "contactName",
          "androidSmsId", "receivedAt", "createdAt"
        ) VALUES (
          ${randomUUID()}, ${device.userId}, ${device.id}, ${sim?.id ?? null},
          ${sim?.phoneNumber ?? "device"}, ${body}, 'received',
          ${randomUUID()}, 'inbound', ${from}, ${peer}, ${contactName},
          ${androidSmsId}, ${receivedAt}, ${receivedAt}
        )
        ON CONFLICT ("deviceId", "androidSmsId") DO NOTHING
      `;
      if (affected > 0) synced++;
    }

    return reply.send({ synced });
  });
}

