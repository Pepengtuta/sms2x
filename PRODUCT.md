# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** Solo self-hosters and developers running ssmmss on their own infrastructure. They use their own Android phones and SIM cards to send SMS (and OTPs) from their applications, servers, or test tools through a simple HTTP API and a local web dashboard.

## Product Purpose

- **What it is:** A lightweight, self-hosted SMS gateway that turns physical Android devices with SIM cards into a personal SMS dispatch API (Smart SIM Multi-phone Messaging Sender Service).
- **Why it exists:** To send SMS without third-party SMS providers or per-message fees, using the owner’s active carrier plans and SIMs with full control over data and routing.
- **Success:** A paired phone reliably receives queued messages, dispatches them via the chosen SIM, and the owner can monitor/send/manage devices, messages, keys, and health from the API and dashboard.

## Positioning

- **Self-hosted and lean:** No third-party SMS costs, minimal/bloat-free implementation, and direct control via your own phones/SIMs.
- **Simple integration:** Straightforward REST API (`/v1/*`) and a clear, text-labeled dashboard for operating one or more personal gateway phones.

## Operating Context

- **Deployment:** Run locally or on self-managed infrastructure (Node.js API + PostgreSQL, web dashboard). Phones connect over the LAN/network to the API; pairing and discovery are designed for local-network use.
- **Core workflow:** Sign in → pair Android gateway phone(s) → generate API keys → queue/send SMS or OTPs via dashboard or `/v1` → gateway app polls, sends with Android `SmsManager`, and reports status → owner reviews messages/devices/health.
- **Surfaces in this repo:** Web dashboard (`apps/web`, Vite + React 18 + Bootstrap 5.3) and native Android gateway app (`apps/android`, pure Kotlin + Jetpack Compose) backed by a Fastify/Prisma API (`apps/api`).

## Capabilities and Constraints

- **Capabilities:** Multi-phone and multi-SIM routing, device pairing/revocation, API keys, message queueing/lifecycle trace, OTP send/verify (hash stored, never returned), health/latency/failure visibility, dashboard management (devices, SIMs, messages, keys, docs).
- **Constraints:** Single owner per physical device at a time (stable device identity); online means heartbeat within freshness window; messages can be requeued on missed reporting; pairing tokens are in-memory; rate limits are in-memory (see README/API). No icon libraries; text-only controls in the dashboard.
- **Terminology:** “Device” = paired Android gateway phone; “SIM” = enabled SIM/subscription on a device; message statuses queued/sending/sent/failed with structured failure reasons.
- **Technical stack (incumbent):** `apps/api` (Fastify, Prisma, PostgreSQL), `apps/web` (Vite, React, Bootstrap 5.3 vendored locally), `apps/android` (native Kotlin, Jetpack Compose foreground service). Database timestamps must remain UTC-consistent.
- **Open/undecided:** Public self-service signup vs restricted/admin-provisioned or invite/approval account creation (under discussion; default posture leans restricted for a gateway controlling real SIMs).

## Brand Commitments

- **Name:** `ssmmss` (Smart SIM Multi-phone Messaging Sender Service).
- **Dashboard visual system (binding, per AGENT.md):** Bootstrap 5.3 (vendored, no Tailwind) with explicit palette — primary `#0d6efd`, secondary `#6c757d`, success `#198754`, danger `#dc3545`, warning `#ffc107`, info `#0dcaf0`, light `#f8f9fa`, dark `#212529`. **Zero icons** (no icon libraries/SVG icons); text labels only. Monospace-leaning UI treatment as currently implemented.

## Evidence on Hand

- Repo docs: `AGENT.md`, `README.md`, `task-todo.md`, `database/` schema/seed artifacts.
- Working implementation across `apps/api`, `apps/web`, `apps/android` (routes, pages, Kotlin gateway service/sender, Prisma schema).
- Screenshots referenced in `README.md` under `screenshots/` (web dashboard views and Android app captures). No fabricated customer/testimonial/benchmark claims.

## Product Principles

1. **Own your sending:** Prefer real phones/SIMs and self-hosting over third-party SMS dependencies.
2. **Stay lean:** Minimal dependencies and no bloat; favor clear, inspectable behavior over complex frameworks or telemetry.
3. **Be explicit and reliable:** Routing, device readiness, and message lifecycle/failures must be understandable and traceable.
4. **Respect gateway risk:** Pairing, credentials, and account creation should protect control of real SIMs (safe defaults over convenience).
5. **Simple to operate:** Text-clear UI and a small, predictable API surface for solo developers.

## Accessibility & Inclusion

- **Dashboard:** Maintain readable contrast and clear text labels/status cues (aligned with the existing palette and text-only controls). No additional product-specific accessibility standard recorded yet.
- **Android:** Relies on native platform affordances; no additional requirements recorded.
