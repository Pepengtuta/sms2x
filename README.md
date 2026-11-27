# ssmmss — Smart SIM Multi-phone Messaging Sender Service

> A lightweight, self-hosted SMS Gateway that turns physical Android phones into a personal, high-speed SMS API.

---

## What is ssmmss?

**ssmmss** allows you to send SMS messages from your own web applications, servers, or test tools through real SIM cards hosted on one or more Android phones.

### Key Highlights:
- **No Third-Party SMS Costs:** Uses your phone's active carrier plans and SIMs.
- **Multi-Phone & Multi-SIM:** Connect multiple phones with dual SIMs and route SMS through specific SIMs or default devices.
- **REST API:** Simple HTTP endpoints (`/v1/messages/send`) compatible with developer tools and test suites like `smstest`.
- **Bootstrap 5.3 Dashboard:** Clean, zero-dependency web dashboard (Bootstrap is vendored locally) with a clear colour system.
- **Native Android Engine:** Pure Kotlin app (< 1 MB release APK) designed for 24/7 background reliability.

---

## Project Status & Documentation

For technical specs, database schemas, and AI agent instructions, see:
- 📖 [**`AGENT.md`](./AGENT.md) — Comprehensive technical architecture, API contracts, and implementation plan.

---

## Setup

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 14+ (running on `localhost:5432`)
- Android Studio / JDK 17 + Android SDK (only for building the phone app)

### 2. Install & configure

```bash
npm install
```

Create `apps/api/.env` (copy `apps/api/.env.example`):

```env
DATABASE_URL="postgresql://postgres:123456@localhost:5432/ssmmss?schema=public"
JWT_SECRET="change-this-to-a-long-random-string"
JWT_EXPIRES_IN="24h"
ADMIN_PASSWORD="admin"
PORT=3000
HOST="0.0.0.0"
```

> The database **must run in UTC**. Prisma writes UTC into `timestamp` columns; a
> non-UTC server silently skews every timestamp. The API refuses to start if it
> detects this, and tells you how to fix it:
> `ALTER DATABASE ssmmss SET timezone TO 'UTC';`

Import the database schema, set its timezone to UTC, and generate the Prisma client (do **not** run `npm run prisma:push`, as inbound SMS columns are managed via SQL):

```bash
psql -U postgres -c "CREATE DATABASE ssmmss;"
psql -U postgres -d ssmmss -c "ALTER DATABASE ssmmss SET timezone TO 'UTC';"
psql -U postgres -d ssmmss -f database/ssmmss.sql
npm --prefix apps/api run prisma:generate
```

### 3. Run

Two terminals:

```bash
npm run dev:api    # API  -> http://localhost:3000
npm run dev        # Web  -> http://localhost:5173
```

Open http://localhost:5173 and sign in:

| Username | Password |
|---|---|
| `admin` | `admin` |

A built-in `admin` account is created automatically on first API start — no
registration needed. Change it by setting `ADMIN_PASSWORD` in `apps/api/.env`
(the account's password is re-synced to that value on every API start).

You can also create additional accounts with `POST /auth/register`:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword!","name":"You"}'
```

---

## Building the Android gateway app

```bash
npm run android:release     # -> apps/android/app/build/outputs/apk/release/app-release.apk
npm run android:debug       # -> apps/android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a phone with `adb install -r <path-to-apk>`, or copy the APK and open
it (enable "install from unknown sources").

Requires `ANDROID_HOME` pointing at your SDK (`apps/android/local.properties` already
has the SDK path). The Gradle wrapper is **9.1.0**, which runs on JDK 17 through 25 —
your system's JDK 25 works as-is, no `JAVA_HOME` juggling needed.

### Signing

This is a personal, sideloaded app — it is not published to the Play Store.
Signing keys live in `apps/android/keystore.jks` and are **gitignored**. If you
lose them, generate a new pair and update `apps/android/keystore.properties`
(see `keystore.properties.example`):

```bash
keytool -genkeypair -v -keystore apps/android/keystore.jks \
  -alias ssmmss -keyalg RSA -keysize 2048 -validity 10000
```

If no keystore is configured, the release build falls back to the debug key so
the project always produces an installable APK.

### First-time setup on the phone

1. Open the app. Grant **Send SMS**, **Phone**, **Camera**, and **Notifications** permissions.
2. **The app finds the API by itself.** On first launch it broadcasts a discovery
   request on your local network and fills in the Server URL with whichever
   `ssmmss` server answers. Press **\[ Find Server On Network ]** to run it again.
   - Nothing to type, and it works the same on any phone you install it on.
   - If your network blocks broadcast traffic, set the **Server URL** by hand
     (e.g. `http://192.168.1.50:3000`).
3. On the dashboard go to **Devices**:
   - **Phone server URL** is pre-filled with the API's LAN address — leave it as is.
   - Press **\[ Generate Pairing Token \]** — a QR code appears.
4. On the phone, in **SETTINGS**, press **\[ Scan QR Code ]** and point the camera
   at the dashboard's QR code. The app reads the token *and* the server URL and
   pairs itself.
   - You can also press **\[ Scan QR Code ]** with the phone's own camera app,
     which opens the `ssmmss://pair?...` link directly in the app.
   - Or enter the token by hand in the **Pairing token** field and press
     **\[ Pair Device ]**.
5. Go to **STATUS** and press **\[ Start Gateway ]**. The service keeps running
   with the screen off and survives a reboot.

Pairing tokens expire after 5 minutes — generate a fresh one if the scan fails.

### Network notes

- The API must be bound to `0.0.0.0` (the default `HOST` in `apps/api/.env`) so
  phones on the LAN can reach it.
- Discovery uses UDP broadcast on port **41234**. If that is blocked, the phone
  can still reach the API directly — only auto-discovery is affected.
- Discovery is LAN-only; it does not work across the internet or a router that
  isolates clients from each other.

---

## API

### Integration API (`/v1/*`) — `Authorization: Bearer <apiKey>`

To integrate, you need exactly two things, both copyable from the dashboard:

1. **The base URL** — the **Docs** tab shows it with a **Copy** button
   (e.g. `http://192.168.123.36:3000`). It is your PC's LAN address — other
   machines must not use `localhost`.
2. **An API key** — create one in the **API Keys** tab. The secret is shown once,
   with a **Copy** button.

Then send:

```bash
curl -X POST "http://192.168.123.36:3000/v1/messages/send" \
  -H "Authorization: Bearer sms_live_..." \
  -H "Content-Type: application/json" \
  -d '{"to":"+639XXXXXXXXX","message":"Hello"}'
```

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/messages/send` | Queue a message. Body `{to, message, deviceId?, simId?}` |
| POST | `/v1/otp/send` | Queue a one-time verification code. Body `{to, deviceId?, simId?}` |
| POST | `/v1/otp/verify` | Check a submitted code. Body `{to, code}` |
| GET | `/v1/messages/:id` | Message status |
| GET | `/v1/devices` | List paired devices |
| GET | `/v1/devices/:id/sims` | List SIM cards on a device |

Rate limits (in memory, per API key or per address): 60 sends/min, 30 OTP/min per key,
3 OTP/hour per phone number, 10 logins/min per address. A blocked request returns
`429` with `retryAfterSeconds`.

### Gateway API (`/gateway/*`) — `Authorization: Bearer <deviceToken>`

| Method | Path | Purpose |
|---|---|---|
| POST | `/gateway/pair` | Exchange a pairing token for a device token |
| POST | `/gateway/heartbeat` | Report liveness, SIM list and permissions (every 30s) |
| GET | `/gateway/poll` | Claim the next queued message |
| POST | `/gateway/messages/:id/status` | Report `sending` / `sent` / `failed` + `failureReason` |

### Dashboard API (`/dashboard/*`) — `Authorization: Bearer <jwt>`

`/dashboard/summary`, `/dashboard/messages` (with `?status=` filter),
`/dashboard/messages/:id`, `/dashboard/messages/send`, `/dashboard/devices`,
`/dashboard/devices/:id`, `/dashboard/devices/:id/sims`,
`/dashboard/devices/:id/sims/:simId` (PATCH), `/dashboard/devices/:id` (PATCH),
`/dashboard/devices/:id/revoke`, `/dashboard/devices/default`, `/dashboard/health`,
`/dashboard/otp/send`, `/dashboard/otp/verify`, `/dashboard/api-keys`,
`/dashboard/pairing-token`

**Device details** — `GET /dashboard/devices/:id` returns the device, its SIMs,
message counts, per-SIM counts, failure reasons, a 7-day timeline and recent
messages. The dashboard renders a readiness checklist (heartbeat freshness,
gateway enabled, foreground service, SMS permission, SIM inventory, enabled/default
SIM, credential) so you can see exactly why a phone is or isn't dispatching.

**Health** — `GET /dashboard/health` returns queue→sent latency percentiles, queue
health (queued / sending / stuck), device freshness, failure-reason counts and a
7-day volume.

**One-time codes** — `POST /v1/otp/send` generates a six-digit code, queues it by
SMS and stores only its hash; the code is never returned. `POST /v1/otp/verify`
checks a submitted code. Codes expire after 5 minutes and allow 5 attempts.

### Auth API (`/auth/*`)

`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`

Access tokens expire after 24h. The dashboard refreshes them silently using the
`refreshToken` returned at login; you are only logged out when the refresh token
also expires or is revoked.

---

## Notes & limits

- **One phone belongs to one account at a time.** The Android app generates a
  stable `deviceIdentifier` on first run and sends it when pairing. If the same
  physical phone is re-paired to a different account, the previous owner's
  device is **revoked** — their token stops working and their dashboard shows the
  phone as `revoked` rather than falsely "online".
- **Unpairing actually releases the device.** Pressing **\[ Unpair Device ]** on
  the phone calls the server, so the device token dies immediately and both
  dashboards show it as `revoked`. Message history and per-device stats are
  kept. Re-pairing the same phone restores the existing row rather than
  creating a duplicate.
- **The dashboard auto-refreshes every 15 seconds** (overview, devices, device detail,
  send page), so a phone that drops offline is reflected without reloading. A
  **Refresh** button and an "updated Xs ago" timestamp are shown on those pages.
  Polling pauses while the browser tab is hidden and catches up when you return.
- **A device is "online" only if it heartbeated in the last 90 seconds.** A dead
  phone is never routed to, so messages never silently vanish.
- **A message claimed but not reported on within 2 minutes is requeued** and
  redelivered, so a gateway crash mid-send does not strand it.
- **Pairing tokens live in memory** and are lost on API restart — generate a new
  one if pairing fails.
- **Rate limits are in place:** 60 sends/min per API key, 30 OTP/min per key,
  3 OTP/hour per phone number, 10 logins/min per address, 10 pairing
  tokens/min per user. Blocked requests get `429` with `retryAfterSeconds`. Put
  the API behind a reverse proxy if you expose it publicly.


## SCREENSHOTS!!

### Web dashboard

| ![image alt](screenshots/webdashboard.png) | ![image alt](screenshots/webdevices.png) |
|---|---|
| ![image alt](screenshots/websendsms.png) | ![image alt](screenshots/webmobileview.png) |
| ![image alt](screenshots/webapikeys.png) | ![image alt](screenshots/webdocs.png) |
| ![image alt](screenshots/webhealth.png) | ![image alt](screenshots/weblogin.png) |
| ![image alt](screenshots/webmessages.png) | ![image alt](screenshots/webotp.png) |

### Android gateway app

| ![image alt](screenshots/apkscreenshot1.jpg) | ![image alt](screenshots/apkscreenshot2.jpg) |
|---|---|
