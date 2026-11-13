import Fastify, { FastifyError } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import { env } from "./config/env.js";
import { lanUrl } from "./services/network.js";
import { authRoutes } from "./routes/auth.js";
import { publicRoutes } from "./routes/public.js";
import { gatewayRoutes } from "./routes/gateway.js";
import { dashboardRoutes } from "./routes/dashboard.js";

export function buildApp() {
  const app = Fastify({ logger: { level: env.NODE_ENV === "production" ? "warn" : "info" } });

  app.register(fastifyCors, { origin: true, credentials: true });
  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  // Global error handler
  app.setErrorHandler((err: FastifyError & { statusCode?: number; code?: string }, _req, reply) => {
    // Prisma foreign key violation — the referenced account no longer exists.
    if (err.code === "P2003") {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Your account no longer exists. Please log in again." },
      });
    }
    const status = err.statusCode ?? 500;
    reply.status(status).send({ error: { code: err.code ?? "INTERNAL", message: err.message } });
  });

  app.get("/health", async () => ({ status: "ok" }));

  // The address a phone on the same network can use to reach this API.
  // Kept separate from /health so the dashboard's own /health route does not
  // collide with it in the dev proxy.
  app.get("/server-info", async () => ({ lanUrl: lanUrl(env.PORT) }));

  app.register(authRoutes, { prefix: "/auth" });
  app.register(publicRoutes, { prefix: "/v1" });
  app.register(gatewayRoutes, { prefix: "/gateway" });
  app.register(dashboardRoutes, { prefix: "/dashboard" });

  return app;
}

