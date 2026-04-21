# API Routes

All routes are Next.js App Router API routes in `src/app/api/`.

## Public Routes

### [[slots-route|GET /api/slots]]
**File**: `src/app/api/slots/route.ts`
**Params**: `date` (YYYY-MM-DD, required), `job_duration_mins` (optional, default 90)

Two-pass filter:
1. **Pass 1 (DB Filter)**: Counts overlapping bookings + active [[booking-locks]] per candidate slot. Removes slot if `occupied >= totalActiveTeams`
2. **Pass 2 (Buffer Filter)**: Enforces 20-min travel gap (forward AND backward) between existing bookings and candidate slots

**Response**: `{ date, slots: ["08:00", ...], total_teams: 3 }`

Constants: `JOB_DURATION=90min`, `SLOT_INCREMENT=30min`, `BUFFER=20min`, `HOURS=08:00-18:00`, `UAE_OFFSET=+4`

### [[booking-locks|POST /api/booking-locks]]
**File**: `src/app/api/booking-locks/route.ts`
**Body**: `{ slot_start: ISO, session_id: string }`

Creates 10-min temp lock. Cleans up expired locks first. Guards against duplicate locks from same session. DB trigger enforces max concurrent locks = active team count.

### [[booking-locks|DELETE /api/booking-locks]]
**Body**: `{ session_id, slot_start }`
Releases a booking lock (used when customer clicks "Change time").

### [[checkout-route|POST /api/checkout]]
**File**: `src/app/api/checkout/route.ts`
**Body**: `{ customer_name, customer_email, customer_phone, address, property_type, bedrooms, slot_start, slot_end, session_id }`

Flow: Verify lock active → upsert customer → create pending booking → calculate price → create Stripe Checkout Session → return `checkout_url`

**Pricing**: Villa = 1500 + 800/bedroom. Apartment = Studio 750 flat, 1+ = 850/bedroom.

### [[stripe-webhook|POST /api/webhooks/stripe]]
**File**: `src/app/api/webhooks/stripe/route.ts`

Handles:
- `checkout.session.completed` → confirm booking, delete lock, trigger [[scheduling-agent|Layer 2 agent]]
- `payment_intent.payment_failed` → release lock, set status to `payment_failed`, log error

Has idempotency guard (skips if already confirmed).

## Admin Routes (protected by [[admin-auth]])

### GET /api/admin/stats
**File**: `src/app/api/admin/stats/route.ts`
Dashboard data: today's bookings, pending/confirmed counts, active teams, recent bookings, team workloads.

### GET /api/admin/bookings
**File**: `src/app/api/admin/bookings/route.ts`
Paginated bookings list with `status` and `date` filters.

### GET /api/admin/teams
**File**: `src/app/api/admin/teams/route.ts`
Teams with schedules + workloads merged.

### PATCH /api/admin/teams
**Body**: `{ id, active?, name?, whatsapp_number? }`
Whitelisted field updates only.

#api #codebase
