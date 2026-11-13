import "dotenv/config";

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:123456@localhost:5432/ssmmss?schema=public",
  JWT_SECRET: process.env.JWT_SECRET || "ssmmss-default-secret-change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin",
  PORT: parseInt(process.env.PORT || "3000", 10),
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",
};

