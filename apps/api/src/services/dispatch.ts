import { prisma } from "../plugins/prisma.js";
import { resolveRoute } from "./routing.js";

export class SendError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function parseSendPayload(input: unknown): {
  to: string;
  body: string;
  deviceId?: string;
  simId?: string;
} {
  const raw = (input ?? {}) as Record<string, unknown>;
  const to = typeof raw.to === "string" ? raw.to.trim() : "";
  const body = typeof raw.message === "string" ? raw.message.trim() : "";

  if (!to || !body) {
    throw new SendError(400, "VALIDATION", "Missing required 'to' or 'message' parameters");
  }
  if (body.length > 1600) {
    throw new SendError(400, "VALIDATION", "Message body must be 1600 characters or fewer");
  }

  const deviceId = typeof raw.deviceId === "string" && raw.deviceId ? raw.deviceId : undefined;
  const simId = typeof raw.simId === "string" && raw.simId ? raw.simId : undefined;
  return { to, body, deviceId, simId };
}

// shortcut: one message per request, no batching — upgrade when bulk send is requested
export async function queueMessage(
  userId: string,
  apiKeyId: string | null,
  payload: { to: string; body: string; deviceId?: string; simId?: string }
) {
  const route = await resolveRoute(userId, payload.deviceId, payload.simId);
  if (!route) {
    throw new SendError(503, "NO_DEVICE", "No online gateway phone available");
  }

  return prisma.message.create({
    data: {
      userId,
      apiKeyId,
      deviceId: route.device.id,
      simId: route.sim.id,
      to: payload.to,
      body: payload.body,
      status: "queued",
    },
  });
}
