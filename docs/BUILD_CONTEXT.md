# DUCTLY — Complete Build Context

> This document captures the FULL state of everything built, every decision made, every bug fixed, and every known limitation.
> **Read this BEFORE touching any code.** Cross-reference with `docs/MASTER_REFERENCE.md` for architecture and business rules.

---

## 1. PROJECT OVERVIEW

**What**: Ductly is a duct-cleaning automation platform for UAE field service operators.
**Target Launch**: April 15, 2026
**Stack**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase + Stripe + OpenRouter
**Working Directory**: `c:\Users\alexj\OneDrive\Desktop\DUCTLY`
**No Git repo initialized** — project lives on OneDrive Desktop.

---

## 2. ENVIRONMENT & CREDENTIALS

### .env.local
See `.env.example` for all required and optional variables. Store actual keys in `.env.local` (gitignored).

### Supabase Connection (for direct DB access via pg)
- **Host**: See Supabase Dashboard → Settings → Database
- **Port**: 5432
- **Database**: postgres
- **SSL**: { rejectUnauthorized: false }

### Stripe Webhook
- Endpoint URL set to: `https://ductly.vercel.app/api/webhooks/stripe` (placeholder — update after Vercel deploy)
- Events: `checkout.session.completed`, `payment_intent.payment_failed`
- API version: 2025-09-30.clover

---

## 3. DEPENDENCIES (package.json)

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.9.0",
    "@supabase/supabase-js": "^2.100.0",
    "@tailwindcss/postcss": "^4.2.2",
    "@types/node": "^25.5.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "autoprefixer": "^10.4.27",
    "next": "^14.2.35",
    "ngeohash": "^0.6.3",
    "postcss": "^8.5.8",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "stripe": "^22.0.0",
    "tailwindcss": "^4.2.2",
    "typescript": "^5.9.3"
  },
  "devDependencies": {
    "@types/ngeohash": "^0.6.8",
    "pg": "^8.20.0"
  }
}
```

---

## 4. FILE TREE (every file that exists)

```
DUCTLY/
├── .env.local
├── package.json
├── tsconfig.json
├── postcss.config.mjs
├── next.config.mjs
├── vitest.config.ts
├── docs/
│   ├── MASTER_REFERENCE.md          # Architecture, schema, pricing, decisions
│   ├── PHASE_1_PLAN.md              # Phase 1 action plan (completed)
│   └── BUILD_CONTEXT.md             # THIS FILE — full build state
├── scripts/
│   ├── seed.js                      # Seeds 3 teams + Sun-Thu schedules
│   ├── 003_rate_limit.sql           # Rate limit table migration
│   └── 004_contact_newsletter.sql   # Contact + newsletter tables migration
├── supabase/
│   └── schema.sql                   # Full DDL — run in Supabase SQL Editor (ALREADY RUN)
└── src/
    ├── middleware.ts                 # Auth token refresh + admin route protection
    ├── instrumentation.ts           # Next.js instrumentation hook
    ├── types/
    │   └── supabase.ts              # Full Database type definitions (9 tables)
    ├── utils/supabase/
    │   ├── server.ts                # SSR createClient (cookies-based)
    │   ├── client.ts                # Browser createClient
    │   ├── admin.ts                 # Service role client (supabaseAdmin)
    │   └── middleware.ts            # updateSession helper
    ├── lib/
    │   ├── stripe.ts                # Stripe instance
    │   ├── travel-math.ts           # getTravelTime() — geocode → geohash → cache → Google Maps
    │   ├── travel-math.test.ts      # Travel math unit tests
    │   ├── scheduling-agent.ts      # Layer 2 AI agent (GPT-4o via OpenRouter) + fallback
    │   ├── scheduling-agent.test.ts # Scheduling agent unit tests
    │   ├── admin-auth.ts            # requireAdmin() — cookie + API key auth check
    │   ├── admin-auth.test.ts       # Admin auth unit tests
    │   ├── rate-limit.ts            # In-memory rate limiter
    │   ├── rate-limit.test.ts       # Rate limit unit tests
    │   ├── slot-helpers.ts          # Slot calculation helpers
    │   ├── slot-helpers.test.ts     # Slot helpers unit tests
    │   ├── env.ts                   # Environment variable helpers
    │   └── env.test.ts              # Env helpers unit tests
    ├── components/
    │   └── Header.tsx               # Shared header with "Book Now" link
    ├── __tests__/
    │   ├── setup.ts                 # Test setup file
    │   ├── middleware.test.ts        # Middleware tests
    │   └── api/
    │       ├── admin-auth.test.ts    # Admin auth route tests
    │       ├── admin-routes.test.ts  # Admin bookings/teams/stats route tests
    │       ├── admin-stats.test.ts   # Admin stats route tests
    │       ├── admin-travel.test.ts  # Admin travel calc route tests
    │       ├── booking-details.test.ts # Booking details route tests
    │       ├── booking-locks.test.ts # Booking locks route tests
    │       ├── checkout.test.ts      # Checkout route tests
    │       ├── contact.test.ts       # Contact form route tests
    │       ├── health.test.ts        # Health check route tests
    │       ├── manage-cancel.test.ts # Customer cancel route tests
    │       ├── manage-reschedule.test.ts # Customer reschedule route tests
    │       ├── newsletter.test.ts    # Newsletter route tests
    │       ├── rate-limit.test.ts    # Rate limit route tests
    │       ├── slots.test.ts         # Slots route tests
    │       └── webhook-stripe.test.ts # Stripe webhook tests
    ├── app/
    │   ├── globals.css              # @import "tailwindcss";
    │   ├── layout.tsx               # Root layout (Inter font, metadata)
    │   ├── page.tsx                 # Landing page
    │   ├── loading.tsx              # Global loading state
    │   ├── error.tsx                # Global error boundary
    │   ├── not-found.tsx            # 404 page
    │   ├── actions.ts               # Server action: getActiveTeams()
    │   ├── privacy/
    │   │   └── page.tsx             # Privacy policy page
    │   ├── terms/
    │   │   └── page.tsx             # Terms of service page
    │   ├── book/
    │   │   ├── layout.tsx           # Booking layout with Header
    │   │   ├── page.tsx             # Full booking flow orchestrator
    │   │   ├── CalendarStep.tsx      # Step 1: Date picker
    │   │   ├── DetailsStep.tsx       # Step 2: Customer details form
    │   │   ├── CheckoutStep.tsx      # Step 3: Payment / Stripe redirect
    │   │   ├── shared.tsx           # Shared booking types + styles
    │   │   └── success/
    │   │       └── page.tsx         # Post-payment confirmation page
    │   ├── my-booking/
    │   │   └── manage/
    │   │       └── page.tsx         # Customer self-service booking management
    │   ├── admin/
    │   │   ├── layout.tsx           # Admin layout: sidebar nav (8 items) + top bar
    │   │   ├── page.tsx             # Dashboard (stats, recent bookings, workloads)
    │   │   ├── login/
    │   │   │   ├── layout.tsx       # Login page layout (no sidebar)
    │   │   │   └── page.tsx         # Admin login form (Supabase Auth)
    │   │   ├── bookings/
    │   │   │   ├── page.tsx         # Bookings list: filters, pagination, clickable rows
    │   │   │   └── [id]/
    │   │   │       └── page.tsx     # Booking detail: customer, payment, team, actions
    │   │   ├── customers/
    │   │   │   └── page.tsx         # Customer list: search, booking counts, pagination
    │   │   ├── teams/
    │   │   │   └── page.tsx         # Team management (schedules, activate/deactivate)
    │   │   ├── feedback/
    │   │   │   └── page.tsx         # Reviews: ratings, team summaries, filters
    │   │   ├── contacts/
    │   │   │   └── page.tsx         # Inbox: contact forms + newsletter subscribers
    │   │   ├── errors/
    │   │   │   └── page.tsx         # Error log: expandable entries, flow filter
    │   │   └── travel/
    │   │       └── page.tsx         # Travel time calculator with history
    │   └── api/
    │       ├── health/
    │       │   └── route.ts         # GET /api/health — system health check
    │       ├── slots/
    │       │   └── route.ts         # GET /api/slots — Layer 1 slot filter
    │       ├── booking-locks/
    │       │   └── route.ts         # POST + DELETE /api/booking-locks
    │       ├── booking-details/
    │       │   └── route.ts         # GET /api/booking-details — public booking lookup
    │       ├── checkout/
    │       │   └── route.ts         # POST /api/checkout — Stripe Checkout session
    │       ├── contact/
    │       │   └── route.ts         # POST /api/contact — contact form submission
    │       ├── newsletter/
    │       │   └── route.ts         # POST /api/newsletter — newsletter signup
    │       ├── manage/
    │       │   └── [token]/
    │       │       ├── route.ts     # GET /api/manage/[token] — customer booking lookup
    │       │       ├── cancel/
    │       │       │   └── route.ts # POST — customer self-cancel + refund
    │       │       └── reschedule/
    │       │           └── route.ts # POST — customer self-reschedule
    │       ├── admin/
    │       │   ├── auth/
    │       │   │   └── route.ts     # POST (login) + DELETE (logout) /api/admin/auth
    │       │   ├── stats/
    │       │   │   └── route.ts     # GET /api/admin/stats — dashboard data
    │       │   ├── bookings/
    │       │   │   ├── route.ts     # GET /api/admin/bookings — paginated list
    │       │   │   └── [id]/
    │       │   │       ├── route.ts # GET + PATCH /api/admin/bookings/[id] — detail + actions
    │       │   │       └── cancel/
    │       │   │           └── route.ts # POST — admin cancel + refund
    │       │   ├── customers/
    │       │   │   └── route.ts     # GET /api/admin/customers — search + paginated list
    │       │   ├── teams/
    │       │   │   └── route.ts     # GET + PATCH /api/admin/teams
    │       │   ├── feedback/
    │       │   │   └── route.ts     # GET /api/admin/feedback — reviews + team summaries
    │       │   ├── contacts/
    │       │   │   └── route.ts     # GET /api/admin/contacts — submissions + newsletter
    │       │   ├── errors/
    │       │   │   └── route.ts     # GET /api/admin/errors — error log viewer
    │       │   └── travel/
    │       │       └── route.ts     # POST /api/admin/travel — travel time calculator
    │       └── webhooks/stripe/
    │           └── route.ts         # POST /api/webhooks/stripe — payment handler
```

---

## 5. DATABASE STATE (Supabase — LIVE, schema.sql already executed)

### Tables (9)
1. **teams** — id, name, whatsapp_number, active, created_at, updated_at
2. **customers** — id, name, phone, email, whatsapp_opt_in, last_booking, created_at, updated_at
3. **bookings** — id, team_id (FK nullable), customer_id (FK), slot_start, slot_end, address, status (CHECK: pending/confirmed/completed/cancelled/no_show), payment_intent_id, created_at, updated_at
4. **booking_locks** — id, slot_start, session_id, locked_at, expires_at
5. **slot_locks** — id, team_id (FK), slot_start, booking_id (FK), created_at. UNIQUE(team_id, slot_start)
6. **team_schedules** — id, team_id (FK), day_of_week (0-6), start_time (TIME), end_time (TIME), active, created_at, updated_at. UNIQUE(team_id, day_of_week)
7. **travel_cache** — PK(origin_geohash, dest_geohash, time_bucket), duration_mins, fetched_at, expires_at
8. **feedback** — id, booking_id (FK), customer_id (FK), rating (1-5), comment, created_at
9. **error_log** — id, flow_name, error_message, payload (JSONB), created_at

### Views (2)
- **team_workloads**: bookings_this_week / bookings_this_month per team
- **feedback_summary**: avg_rating / review_count per team per month

### Triggers (5)
- **trg_check_booking_lock_limit** on booking_locks — prevents more concurrent locks than active teams
- **trg_teams_updated_at** — auto-updates updated_at
- **trg_customers_updated_at** — auto-updates updated_at
- **trg_bookings_updated_at** — auto-updates updated_at
- **trg_team_schedules_updated_at** — auto-updates updated_at

### Functions (2)
- **check_booking_lock_limit()** — trigger function for booking lock limit
- **cleanup_expired_booking_locks()** — deletes expired locks (call periodically)

### RLS Policies (active on all tables)
- teams: public read for active teams
- team_schedules: public read for active schedules
- booking_locks: public insert/select/delete
- bookings: public select
- customers: public select
- slot_locks: public select
- feedback: public select
- error_log: no public policy (service_role only)
- travel_cache: RLS enabled but no public policies (service_role only)

### Seed Data (CURRENTLY IN DATABASE)
- **3 teams**: Team 1, Team 2, Team 3 (all active)
  - Team 1 ID: 4cf4deda-fdb3-42f9-80c6-01652283b208
  - Team 2 ID: dccfc42f-0494-4f9f-8266-2ee25c399075
  - Team 3 ID: bfb960af-19d3-49d7-957f-45981e5781a5
- **15 team_schedules**: Each team has Sun-Thu (days 0-4), 08:00-18:00
- **1 test customer**: Test Customer, +971501234567, test@example.com
- **3 test bookings** (for April 5, 2026 scenario test):
  - Team 1: 10:30-12:00 UTC at Al Nahda, Sharjah (confirmed)
  - Team 2: 09:00-10:30 UTC at Dubai Marina (confirmed)
  - Team 2: 13:00-14:30 UTC at Business Bay (confirmed)
- **1 slot_lock**: Team 1 locked at 10:30 on April 5

---

## 6. API ROUTES — DETAILED SPECIFICATIONS

### GET /api/slots?date=YYYY-MM-DD&job_duration_mins=90

**File**: `src/app/api/slots/route.ts`
**Purpose**: Layer 1 Deterministic Slot Filter — returns available booking slots for a date.
**Parameters**:
- `date` (required): YYYY-MM-DD format
- `job_duration_mins` (optional): defaults to 90

**Logic (Two-Pass Filter)**:
1. Queries team_schedules for active teams on the requested day_of_week
2. Generates candidate slots every 30 minutes from 08:00 to 18:00
3. **Pass 1 (DB Filter)**: For each candidate, counts overlapping bookings + active booking_locks. If `occupied >= totalActiveTeams`, removes slot.
4. **Pass 2 (Buffer Filter)**: Ensures at least 20-minute gap between any existing booking's end time and candidate start. **KNOWN LIMITATION**: Uses flat 20-min buffer, NOT real travel time from Google Maps.

**Response**: `{ date, slots: ["08:00", "08:30", ...], total_teams: 3 }`

**Tested**: YES — returns correct data for seeded scenarios. Friday (no schedules) returns empty. 120-min job duration correctly truncates late slots.

### POST /api/checkout

**File**: `src/app/api/checkout/route.ts`
**Purpose**: Creates a Stripe Checkout Session for a duct cleaning booking.

**Request body**:
```json
{
  "customer_name": "string",
  "customer_email": "string",
  "customer_phone": "string",
  "address": "string",
  "property_type": "villa" | "apartment",
  "bedrooms": 0-N,
  "slot_start": "ISO string",
  "slot_end": "ISO string",
  "session_id": "booking lock session ID"
}
```

**Pricing Logic** (from Master Reference):
- Villa: 1500 AED base + 800 AED per bedroom
- Apartment: Studio (0 bedrooms) = 750 AED flat, 1+ bedrooms = 850 AED per bedroom

**Flow**:
1. Validates all required fields
2. Verifies booking_lock is still active (not expired)
3. Upserts customer by email
4. Creates booking in "pending" status
5. Calculates price, creates Stripe Checkout Session in AED
6. Returns `{ checkout_url, booking_id, price_aed }`

**Metadata stored in Stripe session**: booking_id, customer_id, session_id, slot_start, address, property_type, bedrooms

### POST /api/webhooks/stripe

**File**: `src/app/api/webhooks/stripe/route.ts`
**Purpose**: Handles Stripe webhook events after payment.

**Events handled**:
1. **checkout.session.completed**:
   - Extracts booking_id, session_id, slot_start, address from session.metadata
   - Updates booking status to "confirmed" + stores payment_intent_id
   - Deletes temporary booking_lock
   - Triggers Layer 2 AI Agent (`assignTeamToBooking()`)
   - Logs agent errors to error_log table
   - TODO: Trigger n8n webhook for WhatsApp/Email notifications

2. **payment_intent.payment_failed**:
   - Releases booking_lock
   - Updates booking status to "payment_failed"
   - Logs failure to error_log table
   - TODO: Trigger n8n webhook for failure notification

**Security**: Full Stripe signature verification via `stripe.webhooks.constructEvent()`

### POST + DELETE /api/admin/auth

**File**: `src/app/api/admin/auth/route.ts`
**Purpose**: Admin login/logout via Supabase Auth.

**POST (login)**: Accepts `{ email, password }`. Calls `supabase.auth.signInWithPassword()`. Sets `admin-token` (httpOnly, 8h TTL) and `admin-refresh` (httpOnly, 7d TTL) cookies.

**DELETE (logout)**: Clears both cookies by setting `maxAge: 0`.

### GET /api/manage/[token]

**File**: `src/app/api/manage/[token]/route.ts`
**Purpose**: Customer looks up their booking by manage token (e.g. `bk_xxx`).
**Returns**: Booking details + customer info for the self-service management page.

### POST /api/manage/[token]/cancel

**File**: `src/app/api/manage/[token]/cancel/route.ts`
**Purpose**: Customer self-cancels their booking.
**Rules**: Must be "confirmed" status. Must be 24+ hours before slot_start. Issues Stripe refund automatically. Rate limited (5 attempts per 5 minutes per IP).

### POST /api/manage/[token]/reschedule

**File**: `src/app/api/manage/[token]/reschedule/route.ts`
**Purpose**: Customer reschedules to a new time slot.
**Body**: `{ new_slot_start, new_slot_end? }`. If `new_slot_end` omitted, defaults to +90 minutes.
**Rules**: Must be "confirmed" status. Must be 24+ hours before current slot. New slot must be in the future. Checks for slot conflicts. Clears old slot_lock, re-runs team assignment. Rate limited.

### GET + PATCH /api/admin/bookings/[id]

**File**: `src/app/api/admin/bookings/[id]/route.ts`

**GET**: Returns full booking detail including customer info, assigned team, all active teams (for reassignment dropdown), and slot lock.

**PATCH**: Updates booking status or team assignment.
- **Body**: `{ status?, team_id? }`
- **Allowed statuses**: pending, confirmed, completed, cancelled, no_show
- **Team reassignment**: Validates team is active, deletes old slot_lock, creates new slot_lock
- Sets `completed_at` or `no_show_at` timestamps when marking those statuses

### POST /api/admin/bookings/[id]/cancel

**File**: `src/app/api/admin/bookings/[id]/cancel/route.ts`
**Purpose**: Admin cancels a booking. No 24-hour restriction (unlike customer cancel).
**Body**: `{ reason?, issue_refund? }`. Defaults: empty reason, issue_refund=true.
**Flow**: Issues Stripe refund if requested, updates status to "cancelled", records cancellation metadata, releases slot_lock.

### GET /api/admin/customers?search=&page=1

**File**: `src/app/api/admin/customers/route.ts`
**Purpose**: Paginated customer list with search.
**Search**: Matches against name, email, or phone (case-insensitive `ilike`).
**Enrichment**: Fetches booking count per customer from bookings table.

### GET /api/admin/errors?page=1&flow=

**File**: `src/app/api/admin/errors/route.ts`
**Purpose**: Paginated error log viewer.
**Filters**: Optional `flow` param filters by `flow_name`.
**Returns**: Error entries + list of distinct flow names for the filter dropdown.

### GET /api/admin/feedback?page=1&team_id=&min_rating=

**File**: `src/app/api/admin/feedback/route.ts`
**Purpose**: Feedback/reviews with enriched data.
**Enrichment**: Joins feedback → bookings → customers → teams to get customer name, team name, address.
**Summary**: Returns `feedback_summary` view data (avg_rating + review_count per team).
**Filters**: Optional `team_id` filter, optional `min_rating` filter.

### GET /api/admin/contacts?page=1&tab=submissions|newsletter

**File**: `src/app/api/admin/contacts/route.ts`
**Purpose**: View contact form submissions and newsletter subscribers.
**Tab=submissions** (default): Returns `contact_submissions` table (name, email, phone, message).
**Tab=newsletter**: Returns `newsletter_subscribers` table (email, subscribed_at).

### POST /api/admin/travel

**File**: `src/app/api/admin/travel/route.ts`
**Purpose**: Admin travel time calculator. Geocodes origin/destination, calls Google Maps Distance Matrix, returns distance, duration (normal + traffic), buffer, geohashes, and total blocked time for slot scheduling.

### POST /api/contact

**File**: `src/app/api/contact/route.ts`
**Purpose**: Public contact form submission. Rate limited. Stores in `contact_submissions` table.

### POST /api/newsletter

**File**: `src/app/api/newsletter/route.ts`
**Purpose**: Newsletter email signup. Stores in `newsletter_subscribers` table.

### GET /api/health

**File**: `src/app/api/health/route.ts`
**Purpose**: System health check. Verifies Supabase connectivity.

---

## 7. CORE MODULES — DETAILED SPECIFICATIONS

### src/lib/travel-math.ts — Travel Time Calculator

**Exported function**: `getTravelTime(originAddress, destAddress, date): Promise<number>`

**Flow**:
1. Geocodes both addresses via Google Maps Geocoding API
2. Converts lat/lng to precision-6 geohashes (~1.2km grid) using `ngeohash`
3. Determines time_bucket: `DAY_0600` (6am-12pm), `DAY_1200` (12pm-5pm), `DAY_1700` (5pm+)
4. Checks `travel_cache` table for valid (non-expired) cached result
5. On cache miss: calls Google Maps Distance Matrix API with `traffic_model=pessimistic`
6. Saves result to cache with 7-day TTL via upsert
7. Returns duration in minutes. **Default: 30 mins if all APIs fail.**

**Constants**:
- `DEFAULT_TRAVEL_MINS = 30`
- `CACHE_TTL_DAYS = 7`
- `GEOHASH_PRECISION = 6`

**Status**: Built but NOT wired into the slot filter yet. Currently the slot filter uses a flat 20-min buffer. Wiring travel-math into slots requires knowing the customer's address at query time.

### src/lib/scheduling-agent.ts — Layer 2 AI Agent

**Exported function**: `assignTeamToBooking(bookingId, slotStart, address): Promise<{ teamId, method }>`

**Agent Architecture**:
- Model: GPT-4o via OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
- Timeout: 30 seconds
- Max turns: 6
- Falls back to deterministic if: no API key, timeout, API error, agent doesn't call assign_booking

**5 Tool Functions**:
1. `get_team_schedules(day_of_week)` — returns team schedules for a day
2. `get_team_workloads(week_start)` — returns booking counts per team for the week
3. `get_existing_bookings(date)` — returns all confirmed bookings with addresses
4. `get_slot_locks(date)` — returns permanent slot locks
5. `assign_booking(booking_id, team_id, slot_start)` — assigns team and creates slot_lock

**Deterministic Fallback** (`deterministicAssign()`):
- Gets available teams (not locked for this slot)
- Counts bookings per team for the day
- Picks the least-booked team
- Assigns and creates slot_lock

**Current Status**: Agent will fall back to deterministic because `OPENROUTER_API_KEY` is not set yet. Once key is provided, agent will use GPT-4o.

### src/lib/stripe.ts — Stripe Instance
```typescript
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
  typescript: true,
});
```

---

## 8. SUPABASE CLIENT SETUP

### Server Client (`src/utils/supabase/server.ts`)
- Uses `createServerClient` from `@supabase/ssr`
- Cookie-based session management via `next/headers`
- Typed with `Database` generic from `src/types/supabase.ts`

### Browser Client (`src/utils/supabase/client.ts`)
- Uses `createBrowserClient` from `@supabase/ssr`
- Typed with `Database` generic

### Middleware (`src/utils/supabase/middleware.ts` + `src/middleware.ts`)
- Refreshes auth token on every request
- Matcher excludes static assets

---

## 9. KNOWN BUGS & WORKAROUNDS

### TypeScript Issues (ALL RESOLVED)
1. **`Set` iteration**: TypeScript strict mode doesn't allow `[...new Set()]`. 
   **Fix**: Use `Array.from(new Set(...))` everywhere.

2. **Supabase `never` type on query results**: `.select()` returns `never` type when table types don't match.
   **Fix**: Add `.returns<{ column: type }[]>()` to every Supabase query chain.

3. **Supabase `never` type on `.upsert()` / `.insert()` / `.update()`**: Same issue with write operations.
   **Fix**: Cast the object as `as never` (e.g., `{ ... } as never`).

4. **ngeohash missing types**: No built-in TypeScript declarations.
   **Fix**: `npm install --save-dev @types/ngeohash`

5. **`.next` cache corruption**: `EINVAL: invalid argument, readlink` during build.
   **Fix**: `rm -rf .next` and rebuild.

6. **`create-next-app` failure**: Directory name "DUCTLY" has capital letters + interactive prompts.
   **Fix**: Created project structure manually (package.json, tsconfig, etc.)

### Known Limitations
1. **Slot filter uses flat 20-min buffer** instead of real travel time. The `travel-math.ts` module exists but is NOT connected to the slot filter. To connect it, `/api/slots` would need the customer's address as a parameter so it can calculate travel from each team's last job location.

2. **Customer upsert in checkout uses `onConflict: "email"`** but the customers table does NOT have a UNIQUE constraint on email. This may need a migration: `ALTER TABLE customers ADD CONSTRAINT customers_email_unique UNIQUE (email);`

3. **Booking status "payment_failed"** is used in the webhook but is NOT in the CHECK constraint on the bookings table. The constraint is: `CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'))`. This needs a migration: `ALTER TABLE bookings DROP CONSTRAINT bookings_status_check; ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'payment_failed'));`

4. **Stripe uses LIVE keys** (`sk_live_`, `pk_live_`), not test keys. Be careful with real charges during development.

5. **OpenRouter API key is not set** — the scheduling agent will always use the deterministic fallback until the user provides an API key.

6. **Stripe webhook endpoint** is set to `https://ductly.vercel.app/api/webhooks/stripe` but the app is NOT deployed to Vercel yet. Webhook will not receive events until deployment or Stripe CLI local forwarding.

---

## 10. COMPLETED PHASES

### Phase 1: Initialization & Database (DONE)
- [x] Next.js 14 project with TypeScript, Tailwind CSS, src directory
- [x] Supabase SSR clients (server, browser, middleware)
- [x] Full database schema (9 tables, triggers, views, RLS)
- [x] Schema executed on live Supabase instance
- [x] TypeScript types for all tables
- [x] .env.local with all credentials
- [x] Stub pages (/book, /admin)
- [x] Stripe webhook stub
- [x] Basic slot availability API

### Phase 2: Core Backend Logic (DONE)
- [x] Travel math utility (geocode → geohash → cache → Google Maps)
- [x] Enhanced slot filter (30-min intervals, two-pass: DB filter + buffer filter)
- [x] Tested with seed data and real scenarios

### Phase 3: Stripe + Layer 2 Agent (DONE)
- [x] Stripe SDK installed and configured
- [x] POST /api/checkout — creates checkout session with pricing logic
- [x] POST /api/webhooks/stripe — full signature verification + event handling
- [x] Layer 2 scheduling agent (GPT-4o tools + deterministic fallback)
- [x] Build passes clean

### Phase 4: Booking UI + Admin Dashboard (DONE)
- [x] DB migrations: customers.email UNIQUE constraint, payment_failed status in CHECK
- [x] POST /api/booking-locks — creates 10-min temp lock (with expired lock cleanup)
- [x] DELETE /api/booking-locks — releases lock
- [x] `/book` page — full 3-step flow: date picker → slot grid → customer form with lock countdown → Stripe redirect
- [x] `/book/success` page — post-payment confirmation
- [x] GET /api/admin/stats — dashboard stats (today/pending/confirmed counts, workloads, recent bookings)
- [x] GET /api/admin/bookings — paginated bookings list with status + date filters
- [x] GET /api/admin/teams — teams with schedules + workloads merged
- [x] PATCH /api/admin/teams — toggle team active status
- [x] `/admin` dashboard — stat cards, recent bookings, team workloads
- [x] `/admin/bookings` — filterable paginated bookings table
- [x] `/admin/teams` — team cards with schedules, workload, activate/deactivate toggle
- [x] Admin layout with nav (Dashboard, Bookings, Teams)
- [x] Build passes clean

### Phase 5: Customer Self-Service + Public Pages (DONE)
- [x] `/privacy` — privacy policy page
- [x] `/terms` — terms of service page
- [x] Landing page redesign with hero, services, pricing, FAQ sections
- [x] GET /api/manage/[token] — customer booking lookup by manage token
- [x] POST /api/manage/[token]/cancel — customer self-cancel with 24h window + Stripe refund
- [x] POST /api/manage/[token]/reschedule — customer self-reschedule with 24h window + slot conflict check
- [x] `/my-booking/manage` — customer self-service page (view, cancel, reschedule)
- [x] POST /api/contact — contact form with rate limiting
- [x] POST /api/newsletter — newsletter signup
- [x] GET /api/health — system health check
- [x] GET /api/booking-details — public booking lookup
- [x] Rate limiting module (`src/lib/rate-limit.ts`) — in-memory rate limiter
- [x] Admin auth module (`src/lib/admin-auth.ts`) — cookie + API key authentication
- [x] POST /api/admin/auth — Supabase Auth login, sets httpOnly cookie (8h TTL)
- [x] DELETE /api/admin/auth — logout, clears cookies
- [x] `/admin/login` — admin login page (email + password via Supabase Auth)
- [x] Admin middleware — protects /admin routes, redirects to login
- [x] POST /api/admin/bookings/[id]/cancel — admin cancel (no 24h restriction) + optional refund
- [x] POST /api/admin/travel — travel time calculator endpoint
- [x] `/admin/travel` — travel time calculator UI with history
- [x] Full test suite: 179 tests across 22 test files, all passing
- [x] Build passes clean

### Phase 6: Admin Panel Expansion (DONE)
- [x] GET + PATCH /api/admin/bookings/[id] — booking detail fetch + status/team update
- [x] GET /api/admin/customers — customer list with search + booking counts
- [x] GET /api/admin/errors — error log viewer with flow filter
- [x] GET /api/admin/feedback — reviews with team enrichment + summary stats
- [x] GET /api/admin/contacts — contact submissions + newsletter subscribers
- [x] `/admin/bookings/[id]` — full booking detail page with:
  - Appointment info (slot, address, reschedule history)
  - Customer details (name, phone, email, WhatsApp opt-in)
  - Payment info (payment intent, refund status, cancellation details)
  - Team assignment with reassignment dropdown
  - Action buttons: Mark Completed, Mark No-Show, Cancel + Refund, Confirm
  - Manage token link (copyable customer self-service URL)
  - Slot lock info
- [x] `/admin/customers` — searchable customer list (name/phone/email), booking counts, WhatsApp opt-in, pagination
- [x] `/admin/errors` — error log viewer with flow filter, expandable JSON payloads, healthy state indicator
- [x] `/admin/feedback` — reviews page with star ratings, overall/per-team average cards, team filter
- [x] `/admin/contacts` — tabbed inbox: contact form submissions + newsletter subscribers
- [x] Admin sidebar updated to 8 nav items: Dashboard, Bookings, Customers, Teams, Reviews, Inbox, Error Log, Travel Calc
- [x] Bookings table rows are clickable → navigate to detail page
- [x] Fixed pre-existing test bug: reschedule test mock had `update` instead of `delete` for slot_locks + missing `assignTeamToBooking` mock
- [x] 179/179 tests passing, zero TypeScript errors

---

## 11. WHAT'S NOT BUILT YET (remaining work)

### n8n Automation Flows (8 flows) — CRITICAL FOR LAUNCH
1. Booking confirmation (WhatsApp via 360dialog)
2. Booking confirmation (Email via Resend)
3. Team dispatch notification (WhatsApp)
4. 24-hour reminder (WhatsApp)
5. 1-hour reminder (WhatsApp)
6. Post-job feedback request
7. No-show follow-up
8. Payment failure notification

### Admin Panel — Remaining Gaps
- Calendar / timeline view (visual day schedule per team)
- Schedule CRUD (edit team working hours, block dates, create teams)
- Revenue / payments dashboard (daily/weekly/monthly totals, refund tracking)
- Global search across bookings, customers, teams
- Manual booking creation (phone-in bookings bypassing website)
- Data export (CSV/Excel for accounting)
- Settings page (reschedule window, job duration, pricing — currently hardcoded)
- Slot lock / availability monitor (current active locks, expired lock cleanup status)
- Real-time activity feed / notifications

### Admin Authentication — SETUP REQUIRED
- Admin login uses **Supabase Auth** (email/password). No admin user exists by default.
- **To create an admin user**: Go to Supabase Dashboard → Authentication → Users → Add user → Create new user with email and password.
- The login page is at `/admin/login`. Uses the email/password to authenticate via `supabase.auth.signInWithPassword()`.
- Auth token stored as httpOnly cookie (`admin-token`, 8h TTL) + refresh token (`admin-refresh`, 7d TTL).
- In development without `ADMIN_API_KEY` set, admin routes are open (no auth required).

### Deployment
- Vercel deployment
- Update Stripe webhook URL to real Vercel domain
- Update NEXT_PUBLIC_APP_URL in production env

### Database Migrations Completed (Phase 4+)
- [x] UNIQUE constraint on customers.email
- [x] "payment_failed" added to bookings status CHECK constraint
- [x] contact_submissions table (supabase/migrations/20260415171654_contact_newsletter.sql)
- [x] newsletter_subscribers table (supabase/migrations/20260415171654_contact_newsletter.sql)
- [x] rate_limits table (supabase/migrations/20260415171653_rate_limit.sql)

---

## 12. FULL BOOKING FLOW (end-to-end, how it should work)

```
1. Customer visits /book
2. Customer selects a date → GET /api/slots?date=YYYY-MM-DD
3. UI shows available time slots
4. Customer clicks a slot → POST /api/booking-locks (creates 10-min temp lock)
5. Customer fills form: name, email, phone, address, property type, bedrooms
6. Customer clicks "Pay" → POST /api/checkout
   - Validates booking lock is active
   - Creates customer + booking (pending)
   - Calculates price (villa/apartment formula)
   - Creates Stripe Checkout Session
   - Returns checkout_url
7. Customer redirected to Stripe Checkout → pays
8. Stripe fires webhook → POST /api/webhooks/stripe
   - checkout.session.completed event
   - Updates booking to "confirmed"
   - Deletes temp booking_lock
   - Triggers Layer 2 agent (GPT-4o or fallback)
   - Agent assigns team + creates permanent slot_lock
9. n8n fires notifications (WhatsApp + email to customer, WhatsApp to team)
10. Customer sees /book/success page
```

---

## 13. BUSINESS RULES (from Master Reference)

### Pricing
- **Villa**: 1500 AED base + 800 AED per bedroom
- **Apartment**: Studio = 750 AED flat, 1+ bedrooms = 850 AED per bedroom
- **Thermostat count pricing**: rate TBD (not implemented)

### Scheduling Constants
- `JOB_DURATION_MINS = 90` (each duct cleaning job takes 90 minutes)
- `MINIMUM_TRAVEL_BUFFER_MINS = 20` (minimum gap between jobs)
- `SLOT_LOCK_TTL_MINS = 10` (booking lock expires after 10 minutes)
- `SLOT_INCREMENT_MINS = 30` (slots offered every 30 minutes)
- Working hours: 08:00 to 18:00
- UAE work week: Sunday through Thursday (days 0-4)

### Two-Layer Architecture
- **Layer 1** (sync, <200ms): Deterministic slot filter. Shows available slots. Does NOT assign teams.
- **Layer 2** (async, post-payment): AI agent assigns team. 30-second timeout. Falls back to least-booked-team rule.

### Locking Mechanism
- **booking_locks**: Pre-payment, temporary (10-min TTL). Max concurrent locks per slot = number of active teams (enforced by trigger).
- **slot_locks**: Post-payment, permanent per team. UNIQUE(team_id, slot_start) prevents double team assignment.

### Travel Cache
- Geohash precision 6 (~1.2km grid)
- Time buckets: DAY_0600, DAY_1200, DAY_1700
- Cache TTL: 7 days
- Google Maps Distance Matrix with pessimistic traffic model
- Default fallback: 30 minutes if APIs fail

---

## 14. TESTING RESULTS

### /api/slots endpoint
| Test | Input | Result |
|------|-------|--------|
| Sunday (scheduled day) | date=2026-04-05 | 18 slots (08:00-16:30), 3 teams |
| Friday (no schedules) | date=2026-04-10 | 0 slots, 0 teams |
| 120-min job duration | date=2026-04-05&job_duration_mins=120 | 17 slots (16:30 drops) |
| With seed bookings | date=2026-04-05 (3 bookings seeded) | 15 slots (occupied slots removed) |

### Scenario Test: Al Nahda Sharjah → JBR Dubai
- Team 1 finishes job at 12:00 in Al Nahda, Sharjah
- Next booking at 14:00 in JBR, Dubai
- Real drive time: ~50 minutes (midday traffic)
- System correctly shows 14:00 as available (120-min gap > 20-min buffer)
- **BUT** system also shows 12:30 as available (30-min gap > 20-min buffer)
- In reality, 12:30 would be impossible (30-min gap < 50-min drive)
- This is the known limitation of using flat buffer instead of real travel time

### Build
- `npx next build` passes cleanly
- All routes compile: `/`, `/book`, `/admin`, `/api/slots`, `/api/checkout`, `/api/webhooks/stripe`

---

## 15. CRITICAL NOTES FOR FUTURE SESSIONS

1. **ALWAYS use `Array.from(new Set(...))` instead of `[...new Set(...)]`** — TypeScript strict mode doesn't support Set spread.

2. **ALWAYS add `.returns<Type[]>()` to Supabase queries** — without it, TypeScript infers `never` for query results.

3. **ALWAYS cast insert/update/upsert objects as `as never`** — same Supabase type issue.

4. **The directory has capital letters (DUCTLY)** — `create-next-app` won't work. Project was scaffolded manually.

5. **Stripe keys are LIVE** — handle with care. Consider switching to test keys for development.

6. **The dev server may still be running** in background from previous session. Kill it before starting a new one.

7. **`rm -rf .next` if build fails with EINVAL** — cache corruption is common on Windows/OneDrive.

8. **Supabase anon key format**: The keys in .env.local use `sb_publishable_` and `sb_secret_` format (newer Supabase format), not the traditional `eyJ...` JWT format.
