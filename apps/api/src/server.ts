import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { assertDatabaseTimezoneUtc } from "./plugins/prisma.js";
import { ensureAdminUser } from "./services/admin.js";
import { startDiscoveryResponder } from "./services/discovery.js";

const app = buildApp();

try {
  await assertDatabaseTimezoneUtc();
  await ensureAdminUser();
  startDiscoveryResponder(env.PORT);
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
