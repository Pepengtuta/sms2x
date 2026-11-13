-- ssmmss seed data
-- Apply: psql -U postgres -d ssmmss -f database/seed.sql
-- Seeds the default administrator: email admin@ssmmss.local, password "admin".

INSERT INTO "User" ("id", "email", "passwordHash", "name", "createdAt")
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@ssmmss.local',
    '$2b$10$dDTh0krqe/1A2A.SIQozEO6C2T4w4Y9DQLpIFxwSDPjwNnoBNW1fC',
    'Administrator',
    CURRENT_TIMESTAMP
) ON CONFLICT ("email") DO NOTHING;
