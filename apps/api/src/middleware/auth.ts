import { FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "crypto";
import { prisma } from "../plugins/prisma.js";

// ── JWT auth (dashboard users) ──────────────────────────────────────────────
export async function requireJwt(request: FastifyRequest, reply: FastifyReply) {
  let payload: any;
  try {
    payload = await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid or missing token" } });
  }

  // A token outlives its account: if the user was deleted (or the database was
  // reset) the signature still verifies, but writes would fail with a foreign
  // key error. Reject it here so the client re-authenticates instead.
  const account = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, name: true, defaultDeviceId: true },
  });
  if (!account) {
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Your account no longer exists. Please log in again." },
    });
  }

  (request as any).user = account;
}

// ── API key auth (v1 public endpoints) ──────────────────────────────────────
export async function requireApiKey(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "API key required" } });
  }

  const rawKey = auth.slice(7).trim();
  if (!rawKey.startsWith("sms_live_")) {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid API key format" } });
  }

  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKey || apiKey.revokedAt) {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "API key not found or revoked" } });
  }

  // Update lastUsedAt without blocking the request
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  (request as any).apiKey = apiKey;
  (request as any).user = apiKey.user;
}

// ── Device token auth (Android gateway) ─────────────────────────────────────
export async function requireDeviceToken(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Device token required" } });
  }

  const token = auth.slice(7).trim();
  const device = await prisma.device.findUnique({ where: { deviceToken: token } });

  if (!device || device.revokedAt) {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Device token not recognized or revoked" } });
  }

  (request as any).device = device;
}

