import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

export const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });

// Prisma writes UTC into `timestamp without time zone` columns. If the database
// server runs on a non-UTC timezone, CURRENT_TIMESTAMP defaults and raw SQL
// write local time instead, skewing every timestamp by the UTC offset.
export async function assertDatabaseTimezoneUtc(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
  const tz = rows[0]?.tz;
  if (!tz) {
    throw new Error("Could not read the database timezone.");
  }
  if (["utc", "etc/utc", "gmt", "etc/gmt", "universal", "zulu"].includes(tz.toLowerCase())) {
    return;
  }
  throw new Error(
    `Database timezone is "${tz}" but ssmmss requires UTC. ` +
      `Run: ALTER DATABASE ssmmss SET timezone TO 'UTC';`
  );
}
