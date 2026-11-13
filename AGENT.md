# AGENT.md — Master Architecture & Implementation Blueprint

> **System Name:** `ssmmss` (**S**mart **S**IM **M**ulti-phone **M**essaging **S**ender **S**ervice)  
> **Workspace:** `D:\tutorials\repo\ssmmss`  
> **Mission:** A high-performance, minimalist SMS gateway that turns physical Android devices with SIM cards into a self-hosted SMS dispatch API.

---

## 1. Core Principles & Philosophy

1. **Self-Contained & Original:** This repository is an independent, greenfield project. It contains zero references to external repositories or legacy frameworks.
2. **Minimalist & Lean:** No bloat, no unused telemetry matrices, no synthetic sampling engines, and no complex auth verification loops.
3. **No Brittle Type Guards:** Use standard TypeScript interfaces and safe object traversal (`data?.status || 'queued'`). Never reject API responses because of extra fields or null values.
4. **Pure Native Kotlin for Android:** The Android client is **100% native Kotlin with Jetpack Compose**. Do not use React Native, Expo, or JavaScript bridges on Android. It must build a single lightweight APK (< 5MB) with a durable foreground service.
5. **Visual System (Bootstrap 5.3 + explicit palette):**
   - **Framework:** Bootstrap 5.3.8, vendored locally in `apps/web/public/bootstrap/`. **Do not use Tailwind** — one CSS framework only.
   - **Palette** — declared once in `apps/web/src/index.css` and applied through Bootstrap's `--bs-*-rgb` variables:

     | Name | Color | Typical use |
     |---|---|---|
     | primary | blue `#0d6efd` | main action (Save, Submit) |
     | secondary | gray `#6c757d` | less important action (Cancel) |
     | success | green `#198754` | done, resolved |
     | danger | red `#dc3545` | delete, critical, errors |
     | warning | yellow `#ffc107` | caution, pending |
     | info | light blue `#0dcaf0` | notes, extra information |
     | light | very light gray `#f8f9fa` | backgrounds |
     | dark | near black `#212529` | navbar, dark sections |

   - **Zero Icons:** no icon libraries and no inline SVG icons. Use text labels only (`Dashboard`, `Send SMS`, `Devices`, `API Keys`, `Online`, `Offline`, `Sent`, `Failed`).
6. **Local Developer Reference:** If `LOCAL_REFERENCE.md` exists in this folder (ignored by git), consult it for exact file paths to working logic on this PC. Never copy legacy bloat or mention external project names.

7. **Always use the ponytail skill**

8. **Fast Commands Only (no multi-minute tool calls):**
   - Any single verification command must finish in **under ~60 seconds**. If a command would run longer, **say so before running it** and get the user's go-ahead.
   - **Never** run a Gradle build, a cold `npm install`, or a dependency-resolution task just to *inspect* something. Read the cached artifact, the POM on the repo, the lockfile, or the existing source instead.
   - Prefer one batched command that answers several questions over many sequential ones.
   - **Batch the builds:** make every code change first, then run the build **once** at the end. Do not build between edits.
   - Prefer the cheapest proof: a `Select-String` on the source beats a Gradle `dependencies` task; reading a file beats running a build.

---

## 2. Monorepo Structure

```text
ssmmss/
├── apps/
│   ├── api/                     # Fastify + Prisma Node.js Backend
│   │   ├── prisma/
│   │   │   └── schema.prisma    # 5-table clean schema
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts      # Simple JWT Login & Registration
│   │   │   │   ├── public.ts    # Public /v1 external REST API
│   │   │   │   ├── gateway.ts   # /gateway polling & heartbeat API
│   │   │   │   └── dashboard.ts # /dashboard web admin API
│   │   │   ├── services/
│   │   │   │   └── routing.ts   # Device & SIM selection logic
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts      # Bearer API Key & JWT token verification
│   │   │   ├── app.ts           # Fastify setup & permissive CORS
│   │   │   └── server.ts        # Server entrypoint (Port 3000)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/                     # Vite + React 18 + Bootstrap 5.3 Dashboard
│   │   ├── public/bootstrap/    # Vendored Bootstrap 5.3.8 (css + js)
│   │   ├── src/
│   │   │   ├── pages/           # Overview, Send SMS, Messages, Devices, API Keys, Login
│   │   │   ├── components/      # Layout (navbar + routing shell)
│   │   │   ├── lib/api.ts       # Clean fetch client
│   │   │   ├── index.css        # Palette variables + Bootstrap theme overrides
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── android/                 # Pure Kotlin Android App (Jetpack Compose)
│       ├── app/
│       │   ├── src/main/java/com/ssmmss/gateway/
│       │   │   ├── service/     # GatewayForegroundService.kt (SmsManager)
│       │   │   ├── network/     # ApiClient.kt (Polling & Status updates)
│       │   │   ├── data/        # Preferences & local store
│       │   │   ├── ui/          # Compose UI (SettingsScreen, StatusScreen)
│       │   │   └── MainActivity.kt
│       │   ├── src/main/AndroidManifest.xml
│       │   └── build.gradle.kts
│       └── build.gradle.kts
│
├── AGENT.md                     # This document
├── README.md                    # Public documentation
├── docker-compose.yml           # Local PostgreSQL container
└── package.json                 # Monorepo orchestrator scripts
```

---

## 3. Database Schema (`apps/api/prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String
  name            String
  defaultDeviceId String?
  createdAt       DateTime  @default(now())

  devices         Device[]
  apiKeys         ApiKey[]
  messages        Message[]
}

model Device {
  id             String    @id @default(uuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name           String    // e.g. "Xiaomi 23021RAAEG"
  deviceToken    String    @unique // Bearer token generated on pairing
  status         String    @default("offline") // "online" | "offline"
  lastSeenAt     DateTime  @default(now())
  gatewayEnabled Boolean   @default(true)
  createdAt      DateTime  @default(now())

  simCards       SimCard[]
  messages       Message[]
}

model SimCard {
  id             String    @id @default(uuid())
  deviceId       String
  device         Device    @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  subscriptionId Int       // Android SubscriptionManager ID
  slotIndex      Int       // 0 = SIM 1, 1 = SIM 2
  carrierName    String    // e.g. "TNT", "Smart", "Globe"
  phoneNumber    String?
  enabled        Boolean   @default(true)
  isDefault      Boolean   @default(false)
  updatedAt      DateTime  @updatedAt

  messages       Message[]

  @@unique([deviceId, subscriptionId])
}

model ApiKey {
  id             String    @id @default(uuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name           String    // e.g. "Production Web App"
  keyPrefix      String    // e.g. "sms_live_8f3a"
  keyHash        String    @unique // SHA-256 hash of secret
  createdAt      DateTime  @default(now())
  lastUsedAt     DateTime?
  revokedAt      DateTime?

  messages       Message[]
}

model Message {
  id             String    @id @default(uuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  apiKeyId       String?
  apiKey         ApiKey?   @relation(fields: [apiKeyId], references: [id], onDelete: SetNull)
  deviceId       String?
  device         Device?   @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  simId          String?
  sim            SimCard?  @relation(fields: [simId], references: [id], onDelete: SetNull)

  to             String    // Recipient (+639xxxxxxxxx)
  body           String    // SMS text
  status         String    @default("queued") // queued | sending | sent | failed
  errorMessage   String?
  correlationId  String    @default(uuid())

  createdAt      DateTime  @default(now())
  claimedAt      DateTime?
  sendingAt      DateTime?
  sentAt         DateTime?
  failedAt       DateTime?
}
```

---

## 4. Key Implementation Patterns & Algorithms

### A. Routing Resolver (`apps/api/src/services/routing.ts`)
Resolves which physical phone and SIM to use for an SMS:
```typescript
export async function resolveRoute(
  prisma: any,
  userId: string,
  explicitDeviceId?: string,
  explicitSimId?: string
) {
  let device = null;

  if (explicitDeviceId) {
    device = await prisma.device.findFirst({
      where: { id: explicitDeviceId, userId }
    });
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.defaultDeviceId) {
      device = await prisma.device.findFirst({
        where: { id: user.defaultDeviceId, status: "online", gatewayEnabled: true }
      });
    }
    if (!device) {
      device = await prisma.device.findFirst({
        where: { userId, status: "online", gatewayEnabled: true },
        orderBy: { lastSeenAt: "desc" }
      });
    }
  }

  if (!device) throw new Error("No online gateway phone available");

  let sim = null;
  if (explicitSimId) {
    sim = await prisma.simCard.findFirst({
      where: { id: explicitSimId, deviceId: device.id, enabled: true }
    });
  } else {
    sim = await prisma.simCard.findFirst({
      where: { deviceId: device.id, isDefault: true, enabled: true }
    }) || await prisma.simCard.findFirst({
      where: { deviceId: device.id, enabled: true },
      orderBy: { slotIndex: "asc" }
    });
  }

  if (!sim) throw new Error("No enabled SIM card available on selected phone");

  return { device, sim };
}
```

### B. API Key Generation & Hashing
```typescript
import crypto from "node:crypto";

export function generateApiKey() {
  const secret = `sms_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyPrefix = secret.slice(0, 16);
  const keyHash = crypto.createHash("sha256").update(secret).digest("hex");
  return { secret, keyPrefix, keyHash };
}
```

### C. Android Native SMS Dispatch (`GatewaySmsSender.kt`)
The exact Kotlin implementation for dual-SIM dispatch using Android's `SmsManager`:
```kotlin
package com.ssmmss.gateway.service

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

class SmsSender(private val context: Context) {

    fun getActiveSimCards(): List<SimInfo> {
        val subManager = context.getSystemService(SubscriptionManager::class.java) ?: return emptyList()
        return try {
            val list = subManager.activeSubscriptionInfoList ?: emptyList()
            list.map { sub ->
                SimInfo(
                    subscriptionId = sub.subscriptionId,
                    slotIndex = sub.simSlotIndex,
                    carrierName = sub.carrierName?.toString() ?: "Unknown",
                    phoneNumber = sub.number
                )
            }
        } catch (e: SecurityException) {
            emptyList()
        }
    }

    fun sendSms(
        destination: String,
        body: String,
        subscriptionId: Int,
        onResult: (success: Boolean, error: String?) -> Unit
    ) {
        val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)?.createForSubscriptionId(subscriptionId)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
        } ?: run {
            onResult(false, "SmsManager unavailable for subscription $subscriptionId")
            return
        }

        val action = "com.ssmmss.gateway.SMS_SENT_${System.currentTimeMillis()}"
        val sentIntent = PendingIntent.getBroadcast(
            context,
            0,
            Intent(action),
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                context.unregisterReceiver(this)
                if (resultCode == Activity.RESULT_OK) {
                    onResult(true, null)
                } else {
                    onResult(false, "Send failed with radio code: $resultCode")
                }
            }
        }

        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(action),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        val parts = smsManager.divideMessage(body)
        if (parts.size > 1) {
            val intents = ArrayList<PendingIntent>().apply { add(sentIntent) }
            while (intents.size < parts.size) intents.add(sentIntent)
            smsManager.sendMultipartTextMessage(destination, null, parts, intents, null)
        } else {
            smsManager.sendTextMessage(destination, null, body, sentIntent, null)
        }
    }
}

data class SimInfo(
    val subscriptionId: Int,
    val slotIndex: Int,
    val carrierName: String,
    val phoneNumber: String?
)
```

---

## 5. API Contracts

### Integration API (`/v1/*` with `Authorization: Bearer <apiKey>`)
- `POST /v1/messages/send`:
  - Body: `{ "to": "+639...", "message": "Hello", "deviceId": "optional", "simId": "optional" }`
  - Empty body returns `400 Bad Request` (connectivity check).
  - Success returns `200 OK` `{ "id": "msg-id", "status": "queued" }`.
- `GET /v1/devices`:
  - Returns `{ "devices": [{ "id": "...", "name": "...", "status": "online", "ready": true, "isDefault": true }] }`.
- `GET /v1/devices/:id/sims`:
  - Returns `{ "sims": [{ "id": "...", "slotIndex": 0, "carrierName": "TNT", "name": "TNT", "enabled": true, "isDefault": true }] }`.
- `GET /v1/messages/:id`:
  - Returns `{ "id": "...", "to": "...", "body": "...", "status": "sent", "sentAt": 1730000000 }`.
- `POST /v1/otp/send`:
  - Body: `{ "to": "+639..." }` — optional `deviceId` / `simId`.
  - Queues a six-digit code by SMS and stores only its hash. The code is **never** returned.
  - Returns `201` `{ "id": "...", "messageId": "...", "correlationId": "...", "status": "queued", "expiresAt": 1730000000 }`.
- `POST /v1/otp/verify`:
  - Body: `{ "to": "+639...", "code": "123456" }`.
  - Returns `{ "verified": true }` or `{ "verified": false, "reason": "..." }`. Codes expire after 5 minutes and allow 5 attempts.
- **Rate limits** (in memory, no schema): 60 sends/min per API key, 30 OTP/min per key, 3 OTP/hour per phone number, 10 logins/min per address, 10 pairing tokens/min per user. A blocked request returns `429` with `retryAfterSeconds`.

### Gateway Android API (`/gateway/*` with `Authorization: Bearer <deviceToken>`)
- `POST /gateway/heartbeat`:
  - Body: `{ "status": "online", "sims": [{ "subscriptionId": 1, "slotIndex": 0, "carrierName": "Smart", "phoneNumber": "" }], "androidVersion": "14", "serviceRunning": true, "permissions": { "sms": "granted", "phoneState": "granted", "notifications": "granted", "foregroundService": "granted", "batteryOptimization": "denied" } }`
  - Rows for SIMs the phone no longer reports are disabled automatically — Android reassigns `subscriptionId` when a SIM is reinserted, and a stale row would otherwise be picked for routing forever.
  - Returns `200 OK` `{ "success": true }`.
- `GET /gateway/poll`:
  - Returns `{ "message": { "id": "...", "to": "+639...", "body": "...", "subscriptionId": 1 } }` or `{ "message": null }`.
- `POST /gateway/messages/:id/status`:
  - Body: `{ "status": "sending" | "sent" | "failed", "error": "optional" }`
  - Returns `200 OK`.

---

## 6. Execution Roadmap for Building `ssmmss`

1. **Step 1 — Monorepo Init:** Setup root `package.json`, workspaces (`apps/api`, `apps/web`), and `docker-compose.yml` for PostgreSQL.
2. **Step 2 — Fastify Backend:** Setup Prisma schema, run migrations, create JWT auth, and build `/v1`, `/gateway`, and `/dashboard` routes. Enable permissive CORS.
3. **Step 3 — React Dashboard:** Build the Bootstrap 5.3 UI (palette in §1.5, zero icons) with Overview, Send SMS, Messages, Devices, and API Keys pages.
4. **Step 4 — Kotlin Android App:** Setup native Android app with foreground polling service, `SubscriptionManager` sync, and `SmsManager` dispatch.
