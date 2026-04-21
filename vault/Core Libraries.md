# Core Libraries

## scheduling-agent.ts
**File**: `src/lib/scheduling-agent.ts`
**Export**: `assignTeamToBooking(bookingId, slotStart, address)`

Layer 2 AI agent for post-payment team assignment:
- **Model**: GPT-4o via OpenRouter
- **Timeout**: 30 seconds, max 6 turns
- **5 tools**: get_team_schedules, get_team_workloads, get_existing_bookings, get_slot_locks, assign_booking
- **Fallback**: Deterministic least-booked-team rule (used when no API key or timeout)
- Slot lock comparison uses epoch ms (`new Date().getTime()`) not string equality

Called by [[stripe-webhook]] on `checkout.session.completed`.

## travel-math.ts
**File**: `src/lib/travel-math.ts`
**Export**: `getTravelTime(originAddress, destAddress, date)`

Flow: Geocode addresses → geohash (precision 6, ~1.2km) → check [[Database Schema|travel_cache]] → Google Maps Distance Matrix (pessimistic traffic) → cache result (7-day TTL)

**Default**: 30 mins if all APIs fail.
**Status**: Built but NOT wired into slot filter. Slot filter uses flat 20-min buffer instead.

## stripe.ts
**File**: `src/lib/stripe.ts`
Stripe SDK instance. API version: `2025-04-30.basil`. **Uses LIVE keys**.

## admin-auth.ts
**File**: `src/lib/admin-auth.ts`
**Export**: `requireAdmin(request)`

Checks `x-admin-key` header against `ADMIN_API_KEY` env var. Open in dev, locked in prod. Used by all [[API Routes#Admin Routes|admin API routes]].

#lib #codebase
