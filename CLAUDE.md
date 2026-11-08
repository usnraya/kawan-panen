# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

AgriLink Bali is a Bali DigiFest 2026 demo. The hero scenario remains a buyer requesting 300 kg of tomatoes, rule-based allocation to primary and backup farmers, then fallback when a primary supplier fails. Work follows milestones M0–M6, plus the M7 commerce extension, in [AGRILINK_SYSTEM_FLOW.md](AGRILINK_SYSTEM_FLOW.md).

M0–M6 (forecasts, matching/scoring, confirm/decline, fallback, scoring/dashboard, PWA polish) are implemented. **M7 (buyer cart, checkout, and real Midtrans Snap payment)** is an explicitly approved scope addition on top of the original simulated-MVP spec — see "M7 commerce extension" below. It is the only part of this project where real money and a real payment provider are in scope.

## Commands

Run from `D:\kawan_panen`:

```powershell
npm install
npm run dev
npm run lint
npm run build
npm run start
```

Open `http://localhost:3000` after `npm run dev`. The project uses npm and Next.js 16 App Router. Vitest is planned for M2; no test script exists until then.

To seed the three simulated Supabase accounts after configuring `.env.local`:

```powershell
node scripts/seed-auth.mjs
```

Required seed-script variables: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Architecture

- `app/` is the root App Router. Route folders map directly to the Indonesian role routes from the build spec.
- `components/` holds shared UI; `components/ui/` contains shadcn/ui primitives. Keep static pages as Server Components; add `"use client"` only for browser state or event handlers.
- `lib/supabase/browser.ts` creates the browser client. `lib/supabase/server.ts` creates the request-scoped server client. `lib/supabase/middleware.ts` refreshes auth cookies and is used by `middleware.ts`.
- `supabase/schema.sql` is the source of truth for Postgres types, tables, indexes, helper functions, and RLS policies. `supabase/seed.sql` contains simulation settings/data; `scripts/seed-auth.mjs` creates auth users and corresponding profiles because auth users cannot be seeded with ordinary client SQL.
- Matching and scoring must remain pure TypeScript in `lib/matching.ts` and `lib/scoring.ts`; database access belongs outside those functions. These files are introduced in M2.
- `AGRILINK_SYSTEM_FLOW.md` is the authoritative product and state-machine specification. UI text is Indonesian; code identifiers and database names are English.

## Non-negotiable product constraints

- Every page must show the permanent `DATA SIMULASI` banner.
- All data is fictional. Never add real people, businesses, phone numbers, or addresses.
- Matching is rule-based. Do not describe or implement it as AI/ML.
- No fleet tracking, official WhatsApp API, or embedded hub location in the MVP. Payment is in scope only through the M7 commerce extension below, and only via Midtrans.
- Assumptions, weights, thresholds, distances, and defaults belong in the `settings` table, not hidden constants.
- Apply and test RLS for all Supabase tables, including the M7 commerce tables. Role boundaries are `farmer`, `buyer`, and `coordinator`.

## M7 commerce extension (approved scope addition)

Buyer-facing cart, checkout, and real payment via **Midtrans Snap**, layered on top of the existing buyer-request/matching flow (M7 does not replace or change M0–M6).

- Cart, order, and payment state live in new tables (`carts`, `cart_items`, `orders`, `order_items`, `payment_transactions`, `payment_webhook_events`, `stock_reservations`) added to `supabase/schema.sql`, with RLS scoped to the owning buyer or coordinator, same pattern as `buyer_requests`.
- All cart/checkout/order writes happen server-side (Server Actions or route handlers), never from client components directly against Supabase.
- `MIDTRANS_SERVER_KEY` (and `MIDTRANS_CLIENT_KEY` if needed client-side for Snap.js) are server/public env vars only — the server key is never sent to the browser, logged, or committed. Use sandbox keys (`SB-Mid-server-...`) until a verified merchant account is configured for production.
- Order totals and item snapshots (name, grade, supplier label, unit price, qty) are computed and frozen server-side at checkout time from trusted data, never trusted from client input.
- Payment status transitions only on a verified Midtrans server-to-server webhook (signature-checked) or a verified `transaction status` API call — never from a client-side redirect/callback alone.
- Checkout creation is idempotent (idempotency key per cart/attempt) to prevent duplicate orders or double charges on retry.
- Stock reservation on checkout follows the same `reserved_kg` pattern as `harvest_forecasts`/matching, with an expiry so abandoned carts release stock.
- Keep the `DATA SIMULASI` banner and existing simulated-data rules (seed names, no real people/phone/address) everywhere except the real Midtrans transaction itself; the checkout UI should still make clear this is a sandbox/demo payment until production credentials are configured.
- `lib/matching.ts`/`lib/scoring.ts` stay pure and untouched by M7; checkout consumes the catalog/commodity data, it does not alter the matching engine.

## Next.js notes

This repository uses Next.js 16 with `cacheComponents` and `partialPrefetching` enabled in `next.config.ts`. Read relevant guides under `node_modules/next/dist/docs/` before changing framework conventions. Dynamic route `params` and other request APIs are promises in this version.
