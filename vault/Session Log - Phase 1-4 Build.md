# Session Log - Phase 1-4 Build

> Compacted from Claude Code conversation history (sessions up to 2026-04-11)

## What Was Built

Over multiple sessions, the entire Ductly platform was built from scratch:

### Phase 1: Foundation
- Scaffolded Next.js 14 project manually (DUCTLY directory has capitals, `create-next-app` fails)
- Created Supabase clients (server, browser, middleware)
- Wrote full SQL schema (9 tables, 5 triggers, 2 views, 2 functions)
- Executed schema on live Supabase instance
- Seeded 3 teams with Sun-Thu schedules
- Built basic slot availability API

### Phase 2: Backend Logic
- Built `travel-math.ts` (geocode → geohash → cache → Google Maps)
- Enhanced slot filter with two-pass algorithm (DB filter + buffer filter)
- Tested with seed data and real Al Nahda → JBR scenario

### Phase 3: Payments + AI
- Integrated Stripe (LIVE keys)
- Built checkout endpoint with full pricing logic
- Built webhook handler with signature verification
- Built Layer 2 scheduling agent (GPT-4o + deterministic fallback)

### Phase 4: UI + Admin
- Ran 2 DB migrations (customers.email UNIQUE, payment_failed status)
- Built booking locks API (POST + DELETE)
- Built full 3-step booking page (date → slots → form → Stripe)
- Built success confirmation page
- Built admin dashboard (stats, bookings list, team management)
- Built 3 admin API routes with auth middleware

## Key Decisions Made

- All timestamps use `+04:00` UAE offset
- Booking locks have 10-min TTL, enforced by DB trigger
- Stripe metadata copied to both CheckoutSession AND PaymentIntent
- Admin auth via `x-admin-key` header (open in dev)
- Pricing: Villa = 1500 + 800/BR, Apartment = Studio 750 / 850/BR

## Issues Encountered

- TypeScript strict mode breaks `[...new Set()]` → use `Array.from()`
- Supabase queries return `never` type → add `.returns<Type[]>()`
- `.next` cache corruption on Windows/OneDrive → `rm -rf .next`
- `create-next-app` fails with capital directory names

#session #history
