# Codebase Map

Visual map of all source files and their relationships. Use with Obsidian Graph View or Nexus plugin.

## File Tree

```
src/
├── middleware.ts              → Auth token refresh
├── types/supabase.ts          → Database type definitions
├── utils/supabase/
│   ├── server.ts              → SSR Supabase client
│   ├── client.ts              → Browser Supabase client
│   └── middleware.ts          → updateSession helper
├── lib/
│   ├── stripe.ts              → Stripe SDK instance
│   ├── admin-auth.ts          → requireAdmin() middleware
│   ├── travel-math.ts         → Geocode → geohash → Google Maps
│   └── scheduling-agent.ts   → Layer 2 AI team assignment
├── components/
│   └── Header.tsx             → Shared header
└── app/
    ├── layout.tsx / page.tsx  → Root layout + landing
    ├── book/
    │   ├── page.tsx           → 3-step booking flow
    │   └── success/page.tsx   → Payment confirmation
    ├── admin/
    │   ├── layout.tsx         → Admin nav
    │   ├── page.tsx           → Dashboard
    │   ├── bookings/page.tsx  → Bookings table
    │   └── teams/page.tsx     → Team management
    └── api/
        ├── slots/route.ts         → Slot availability
        ├── booking-locks/route.ts → Lock management
        ├── checkout/route.ts      → Stripe checkout
        ├── webhooks/stripe/route.ts → Payment webhooks
        └── admin/
            ├── stats/route.ts     → Dashboard data
            ├── bookings/route.ts  → Bookings API
            └── teams/route.ts     → Teams API
```

## Dependency Graph

### Booking Flow (data path)
[[Frontend Pages#/book|/book page]] → [[API Routes#GET /api/slots|/api/slots]] → [[Database Schema|team_schedules, bookings, booking_locks]]
[[Frontend Pages#/book|/book page]] → [[API Routes#POST /api/booking-locks|/api/booking-locks]] → [[Database Schema|booking_locks]]
[[Frontend Pages#/book|/book page]] → [[API Routes#POST /api/checkout|/api/checkout]] → [[Core Libraries#stripe.ts|Stripe]] → [[Database Schema|customers, bookings]]
Stripe → [[API Routes#POST /api/webhooks/stripe|/api/webhooks/stripe]] → [[Core Libraries#scheduling-agent.ts|scheduling-agent]] → [[Database Schema|bookings, slot_locks]]

### Admin Flow
[[Frontend Pages#/admin|Admin pages]] → [[API Routes#Admin Routes|Admin API routes]] → [[Core Libraries#admin-auth.ts|admin-auth]] → [[Database Schema]]

### Library Dependencies
- [[Core Libraries#scheduling-agent.ts|scheduling-agent]] depends on: Supabase client, [[Database Schema|bookings, team_schedules, slot_locks]]
- [[Core Libraries#travel-math.ts|travel-math]] depends on: Supabase client, Google Maps API, ngeohash, [[Database Schema|travel_cache]]
- [[API Routes#GET /api/slots|slots route]] depends on: Supabase client, [[Database Schema|team_schedules, bookings, booking_locks]]

#codebase #architecture
