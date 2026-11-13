import { createHash, randomInt } from "node:crypto";
import { prisma } from "../plugins/prisma.js";
import { queueMessage } from "./dispatch.js";
import { SendError } from "./dispatch.js";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

export interface OtpSendResult {
  id: string;
  messageId: string;
  correlationId: string;
  status: string;
  expiresAt: number;
}

function hashCode(code: string): string {
  return createHash("sha256").update(`${code}:ssmmss-otp`).digest("hex");
}

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Generates a one-time code, stores only its hash, and queues it for delivery.
 * The code is never returned to the caller.
 */
export async function sendOtp(
  userId: string,
  apiKeyId: string | null,
  to: string,
  deviceId?: string,
  simId?: string
): Promise<OtpSendResult> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const message = await queueMessage(userId, apiKeyId, {
    to,
    // The code is delimited by spaces and an em dash so it can be copied cleanly.
    body: `Your verification code is ${code} — it expires in 5 minutes.`,
    deviceId,
    simId,
  });

  const request = await prisma.otpRequest.create({
    data: {
      userId,
      to,
      codeHash: hashCode(code),
      expiresAt,
      messageId: message.id,
    },
  });

  return {
    id: request.id,
    messageId: message.id,
    correlationId: message.correlationId,
    status: message.status,
    expiresAt: expiresAt.getTime(),
  };
}

/**
 * Checks a submitted code against the newest live request for that number.
 * A request is consumed on the first successful verification.
 */
export async function verifyOtp(
  userId: string,
  to: string,
  code: string
): Promise<{ verified: boolean; reason?: string }> {
  const request = await prisma.otpRequest.findFirst({
    where: { userId, to, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!request) return { verified: false, reason: "No active code for that number" };

  if (request.expiresAt.getTime() < Date.now()) {
    return { verified: false, reason: "The code has expired" };
  }

  if (request.attempts >= OTP_MAX_ATTEMPTS) {
    return { verified: false, reason: "Too many attempts — request a new code" };
  }

  if (request.codeHash !== hashCode(code.trim())) {
    await prisma.otpRequest.update({
      where: { id: request.id },
      data: { attempts: { increment: 1 } },
    });
    return { verified: false, reason: "The code is not correct" };
  }

  await prisma.otpRequest.update({
    where: { id: request.id },
    data: { consumedAt: new Date() },
  });
  return { verified: true };
}

export function otpSendValidation(to: string): void {
  if (!/^\+[0-9]{8,15}$/.test(to.trim())) {
    throw new SendError(400, "VALIDATION", "Recipient must be E.164, e.g. +639XXXXXXXXX");
  }
}
