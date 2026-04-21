# Build Context

> Full copy at `docs/BUILD_CONTEXT.md`

Complete build state document. Read this before touching any code.

## Completed Phases

### Phase 1: Foundation & Database
- Next.js 14 + TypeScript + Tailwind CSS
- Supabase SSR clients
- Full [[Database Schema|database schema]] (9 tables, triggers, views, RLS)
- [[API Routes#GET /api/slots|Basic slot availability API]]

### Phase 2: Core Backend
- [[Core Libraries#travel-math.ts|Travel math utility]]
- Enhanced [[API Routes#GET /api/slots|slot filter]] (two-pass)

### Phase 3: Stripe + Layer 2 Agent
- [[Core Libraries#stripe.ts|Stripe SDK]]
- [[API Routes#POST /api/checkout|Checkout endpoint]]
- [[API Routes#POST /api/webhooks/stripe|Webhook handler]]
- [[Core Libraries#scheduling-agent.ts|Layer 2 scheduling agent]]

### Phase 4: Booking UI + Admin Dashboard
- DB migrations (email UNIQUE, payment_failed status)
- [[API Routes#POST /api/booking-locks|Booking locks API]]
- [[Frontend Pages#/book|Full booking flow]]
- [[Frontend Pages#/admin|Admin dashboard]] (3 pages, 3 API routes)

## Known Limitations

1. Slot filter uses **flat 20-min buffer** instead of real travel time
2. **Stripe uses LIVE keys** - handle with care
3. **OpenRouter API key not set** - agent uses deterministic fallback
4. **Stripe webhook URL** points to `ductly.vercel.app` but app not deployed yet

## TypeScript Workarounds

- `Array.from(new Set(...))` instead of spread (strict mode)
- `.returns<Type[]>()` on all Supabase queries
- `as never` casts on insert/update/upsert

See [[Remaining Work]] for what's left.

#docs
