# Phase 1: Foundation & Backend Architecture (Action Plan)

**Goal:** Establish a rock-solid, type-safe Next.js environment connected to a perfectly structured Supabase PostgreSQL database.

## Steps

### Step 1: Next.js & Environment Initialization
- Next.js 14 with App Router, Tailwind CSS, TypeScript
- Install shadcn/ui, @supabase/ssr, @supabase/supabase-js
- Create Supabase client utilities (server.ts, client.ts)
- Set up .env.local with required environment variables

### Step 2: Core Database Schema Generation
- All tables with timestamp columns (created_at, updated_at)
- teams, customers, bookings, booking_locks, slot_locks, team_schedules, travel_cache, feedback, error_log
- booking_locks: constraint allowing concurrent locks up to total active teams count
- slot_locks: UNIQUE(team_id, slot_start)
- travel_cache: composite PK (origin_geohash, dest_geohash, time_bucket)
- Enable RLS on all tables

### Step 3: Database TypeScript Types & Next.js Sync
- Generate types from Supabase schema into src/types/supabase.ts
- Create sample Server Action to verify type-safety

### Step 4: Layer 1 API Skeleton (Slot Availability)
- GET /api/slots?date=YYYY-MM-DD
- Query team_schedules for active teams
- Generate 90-minute candidate slots
- Subtract locked/booked slots
- Return available slots where locks < active team count

### Step 5: Webhook & Background Task Pre-Wiring
- POST /api/webhooks/stripe - Stripe webhook receiver boilerplate
- Signature verification, event switch for checkout.session.completed

## Definition of Done
- Project deploys to Vercel preview
- DB tables exist in Supabase
- WhatsApp templates submitted for review
- Slot availability API returns correct data
- Stripe webhook endpoint accepts POST requests
