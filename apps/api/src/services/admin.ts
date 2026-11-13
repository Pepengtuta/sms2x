import bcrypt from "bcrypt";
import { prisma } from "../plugins/prisma.js";
import { env } from "../config/env.js";

export const ADMIN_LOGIN = "admin";
export const ADMIN_EMAIL = "admin@ssmmss.local";

/**
 * The admin account is a fixed, always-present account so the dashboard is
 * reachable without registering. `admin` is accepted in place of the email.
 */
export function resolveLoginIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.toLowerCase() === ADMIN_LOGIN ? ADMIN_EMAIL : trimmed;
}

/** Creates the admin account on first run and keeps its password in sync with env. */
export async function ensureAdminUser() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existing) {
    return prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
        name: "Admin",
      },
    });
  }
  if (await bcrypt.compare(env.ADMIN_PASSWORD, existing.passwordHash)) {
    return existing;
  }
  return prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12) },
  });
}
