-- Migration: Add inbound SMS and thread support to Message
-- Apply: psql -U postgres -d ssmmss -f database/migrations/001_inbound_sms.sql

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS "fromNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "peer" TEXT,
  ADD COLUMN IF NOT EXISTS "contactName" TEXT,
  ADD COLUMN IF NOT EXISTS "androidSmsId" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);

UPDATE "Message" SET "peer" = "to" WHERE "peer" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Message_deviceId_androidSmsId_key"
  ON "Message"("deviceId", "androidSmsId");

CREATE INDEX IF NOT EXISTS "Message_userId_peer_createdAt_idx"
  ON "Message"("userId", "peer", "createdAt");

