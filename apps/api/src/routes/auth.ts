import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../plugins/prisma.js";
import { resolveLoginIdentifier } from "../services/admin.js";
import { checkRateLimit, RATE_LIMITS } from "../services/rateLimit.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character"),
  name: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const REFRESH_EXPIRES_IN = "30d";

function issueTokens(app: FastifyInstance, user: { id: string; email: string; name: string }) {
  const token = app.jwt.sign({ id: user.id, email: user.email, name: user.name });
  const refreshToken = app.jwt.sign(
    { id: user.id, type: "refresh" },
    { expiresIn: REFRESH_EXPIRES_IN }
  );
  return { token, refreshToken, user: { id: user.id, email: user.email, name: user.name } };
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post("/register", async (request, reply) => {
    const ip = request.ip || "unknown";
    const limit = checkRateLimit(
      `register:${ip}`,
      RATE_LIMITS.register.limit,
      RATE_LIMITS.register.windowMs
    );
    if (!limit.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many registrations from this address" },
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: parsed.error.issues[0].message } });
    }

    const { email, password, name } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: { code: "CONFLICT", message: "Email already registered" } });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name ?? email.split("@")[0] },
    });

    return reply.status(201).send(issueTokens(app, user));
  });

  // POST /auth/login
  app.post("/login", async (request, reply) => {
    const ip = request.ip || "unknown";
    const limit = checkRateLimit(`login:${ip}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
    if (!limit.allowed) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many login attempts from this address" },
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: parsed.error.issues[0].message } });
    }

    const { email, password } = parsed.data;
    const identifier = resolveLoginIdentifier(email);
    const user = await prisma.user.findUnique({ where: { email: identifier } });
    if (!user) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
    }

    return reply.send(issueTokens(app, user));
  });

  // POST /auth/refresh — exchange a refresh token for a new access token
  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = (request.body as { refreshToken?: string }) ?? {};
    if (!refreshToken) {
      return reply.status(400).send({ error: { code: "VALIDATION", message: "refreshToken required" } });
    }

    let payload: any;
    try {
      payload = app.jwt.verify(refreshToken);
    } catch {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid or expired refresh token" } });
    }

    if (payload?.type !== "refresh") {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid refresh token" } });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "User no longer exists" } });
    }

    return reply.send(issueTokens(app, user));
  });
}
