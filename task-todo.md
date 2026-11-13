## 1 make  android SafeArea it should not covered  the status bar (time, battery, notification icons),

- **DONE.** `targetSdk = 36` makes Android 15+ enforce edge-to-edge, so the app drew
  behind the status bar with no inset handling at all.
  - `enableEdgeToEdge()` in `MainActivity` — transparent bars, light icons over the
    dark tab bar, dark icons over the white content.
  - `statusBarsPadding()` on the tab row so the dark bar extends behind the status
    bar while its labels sit below the clock.
  - `navigationBarsPadding()` on `Screen()` and on the QR scanner's action row so
    content clears the gesture bar.
  - `statusBarColor` / `navigationBarColor` removed from `themes.xml` (ignored from
    API 35).

## 2 in web add device details same in ugyon gateway

- **DONE.** Full parity, plus what the legacy dashboard did not have.
  - **Schema:** `Device` gains `androidVersion`, `serviceRunning`, `permissions` (Json),
    `revokedAt`.
  - **Android:** `PermissionSnapshot` reports `sms` / `phoneState` / `notifications` /
    `foregroundService` / `batteryOptimization`; the heartbeat now sends
    `androidVersion`, `serviceRunning` and `permissions`.
  - **API:** `GET /dashboard/devices/:id` (detail), `PATCH /dashboard/devices/:id`
    (rename / enable / disable), `PATCH /dashboard/devices/:id/sims/:simId`
    (enable / set default), `POST /dashboard/devices/:id/revoke`.
    Revoked devices are rejected by `requireDeviceToken` and never routed to.
  - **Web:** `/devices/:id` page — readiness checklist (7 checks), verdict, message
    counts, 7-day sent/failed chart, failure-reason breakdown, SIM table with
    enable/default controls, recent messages, and device actions.
    The `/devices` list rows now link to it and show a readiness summary.
  - **Extra beyond the legacy dashboard:** failure-reason breakdown, per-SIM message
    counts, 7-day timeline, recent messages, and working enable/disable + default-SIM
    controls (both fields existed but were never written).

## 3 next

- [ ] Verify the Android app on the phone: status bar no longer overlaps the tabs,
      camera QR scan pairs, and the readiness checklist fills in.

## 4 live device status in the web

- **DONE.** The web fetched once per page load, so a phone that dropped offline
  still showed "Online" until a manual reload.
  - New `apps/web/src/lib/usePolling.ts` — `usePolling(fn, 15000)`: fires
    immediately, then every 15s; **pauses while the tab is hidden** and catches up
    on `visibilitychange`; **serialises calls** so a poll cannot race a mutation's
    reload and paint stale data.
  - New `apps/web/src/components/RelativeTime.tsx` — "updated just now / 12s ago".
  - Overview, Devices, Device detail and Send SMS now poll, with a **Refresh**
    button and an "updated Xs ago" label.
  - Two bugs the polling would have caused, fixed in the same change:
    Send SMS reset the chosen device to the default every tick, and a poll landing
    mid-rename wiped what you typed.
  - Verified in Chrome: badge flipped `unknown -> revoked` within 18s with no
    reload; rename text survived a poll; 3 requests in 46s while visible; 1 request
    in 50s while hidden.

## 5 Ugyon parity — tier 1 (the cheap wins)

- **DONE.**
  - **Message detail + lifecycle trace** — `GET /dashboard/messages/:id` and a
    `/messages/:id` page showing queued → sending → sent/failed with timestamps
    (all five timestamps were already stored).
  - **Status filters + masked numbers** — `?status=` on the messages list; the
    list shows `••••7766`, the detail shows the full number.
  - **API docs page** — `/docs` with curl examples and ssmmss's *actual* error
    vocabulary.
  - **Structured `failureReason`** — new `Message.failureReason` column. The
    Android app maps radio codes to `NO_SIGNAL` / `SEND_FAILED` / `NO_SIM` /
    `PERMISSION_DENIED` / `INVALID_NUMBER` / `UNKNOWN`. The failure breakdown now
    groups by code instead of raw text.
  - **Health view** — `GET /dashboard/health` + `/health` page: queue→sent latency
    p50/p95/max, queue health, device freshness, failure reasons, 7-day volume.
    Historical heartbeat availability is deliberately excluded — it needs a sampled
    heartbeat table, which AGENT.md forbids.
  - **Navbar collapse toggle** — the nav grew to 8 items and had no hamburger.

## 6 Ugyon parity — tier 2

- **DONE.**
  - **OTP send + verify** — new `OtpRequest` table (code stored only as a hash),
    `POST /v1/otp/send` + `/v1/otp/verify`, dashboard equivalents, and an `/otp`
    page. Codes expire in 5 minutes, allow 5 attempts, and the code is never
    returned by the API.
  - **Rate limiting** — in memory, no schema: 60 sends/min per API key, 30 OTP/min
    per key, 3 OTP/hour per phone, 10 logins/min per address, 10 pairing
    tokens/min per user. Returns `429` with `retryAfterSeconds`.

## 7 bug fix — stale SIM rows after an Android subscription ID change

- **DONE.** Android reassigns `subscriptionId` when a SIM is reinserted or moved.
  The heartbeat only upserted, so the old row stayed `enabled` + `isDefault` and
  routing kept picking a SIM that no longer existed — every send failed with
  "SmsManager unavailable" while the dashboard still looked healthy.
  The heartbeat now reconciles: rows the phone no longer reports are disabled, and
  the default flag is carried across by `slotIndex` so a dual-SIM phone keeps
  routing through the same physical SIM.

## 8 next

- [ ] Verify the Android app on the phone: status bar no longer overlaps the tabs,
      camera QR scan pairs, and the readiness checklist fills in.
- [ ] Reinstall the APK to pick up the `failureReason` reporting, the SIM
      reconciliation, the stable `deviceIdentifier` and the real unpair.

## 9 device ownership — one owner only

- **DONE.** A device belongs to exactly one account at a time.
  - **Root cause:** ssmmss had no stable device identity, so re-pairing the same
    phone to a second account left the first owner's device row **live** — their
    old token still worked, their dashboard said "ready", and their messages were
    queued to a phone that would never pick them up.
  - **Fix:** the Android app generates a persistent `deviceIdentifier` and sends
    it when pairing. The server now revokes any other account's device for that
    phone (their token dies, their dashboard shows `revoked`) and reuses this
    account's existing row on re-pair.
  - **Unpair now tells the server** — new `POST /gateway/unpair` revokes the row.
    The phone calls it first; if the server is unreachable it still clears
    locally but says the device will show as offline.
  - **Pairing logic extracted** to `services/pairing.ts` (`planPairing`) with unit
    tests — 6 new tests, 38 total.
  - Web and phone both label the action **Unpair Device**; the row state still
    reads `revoked`.
  - Verified: unpair kills the token; re-pair reuses the row (1 row, no
    duplicates); cross-account pairing revokes the previous owner; taking the
    phone back revives the original row and revokes the other account's.
  - Sharing was deliberately **not** added: one gateway phone means one sender
    ID, one balance and one carrier plan — and a shared phone could read
    another account's OTP codes from its message history.
