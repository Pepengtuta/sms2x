# ssmmss database export

This folder contains everything needed to recreate and seed the ssmmss database
so anyone can run the API locally.

## Files

- `schema.sql` — DDL for all 7 tables (User, Device, SimCard, ApiKey, Message,
  OtpRequest) plus indexes and foreign keys. Generated from
  `apps/api/prisma/schema.prisma`.
- `seed.sql` — Seeds the default administrator: email `admin@ssmmss.local`,
  password `admin`.
- `README.md` — this file.

## Prerequisites

- Docker + Docker Compose (to run Postgres), or an existing Postgres 16 instance.
- Node.js (to run the API).

## Quick import

Run from the repo root. You need Postgres running on `localhost:5432` (Docker Compose at the repo root: `docker compose up -d postgres`).

Single file (schema + default admin seed):

```powershell
# 1. Create the database (connects to the `postgres` database)
psql -U postgres -c "CREATE DATABASE ssmmss;"

# 2. Import everything — tables and the admin/admin seed — in one file
psql -U postgres -d ssmmss -f database/ssmmss.sql
```

Or import in two steps:

```powershell
psql -U postgres -c "CREATE DATABASE ssmmss;"
psql -U postgres -d ssmmss -f database/schema.sql
psql -U postgres -d ssmmss -f database/seed.sql
```

In pgAdmin4, run the same SQL in its **Query Tool**: `CREATE DATABASE ssmmss;` first, then switch to the `ssmmss` database and run `ssmmss.sql` (or `schema.sql` then `seed.sql`).

After importing, copy `.env.example` to `apps/api/.env` (keep `ADMIN_PASSWORD="admin"`), then start the API: `npm --prefix apps/api run dev`. The admin account is verified at login against `ADMIN_PASSWORD`.

## Default credentials

`apps/api/.env.example` ships with:

- `ADMIN_PASSWORD="admin"` — used by the API's bootstrap/login flow.
- `DATABASE_URL="postgresql://postgres:123456@localhost:5432/ssmmss?schema=public"`

Change these before any non-local deployment.

## Notes

- No `prisma/migrations/` folder exists in this repo; `schema.prisma` is the
  source of truth. Use `prisma:push` for local dev, or apply `schema.sql`
  directly to an existing database.
- The seed includes the default `admin` / `admin` account, so no manual hash
  generation is needed.
