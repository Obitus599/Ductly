# Database Schema

Supabase PostgreSQL. Schema executed on live instance. RLS enabled on all tables.

## Tables (9)

| Table | Key Columns | Notes |
|-------|------------|-------|
| **teams** | id, name, whatsapp_number, active | 3 seeded teams |
| **customers** | id, name, phone, email (UNIQUE), whatsapp_opt_in | Upserted on checkout |
| **bookings** | id, team_id (FK nullable), customer_id (FK), slot_start, slot_end, address, status, payment_intent_id | Status CHECK: pending/confirmed/completed/cancelled/no_show/payment_failed |
| **[[booking-locks\|booking_locks]]** | id, slot_start, session_id, locked_at, expires_at | Pre-payment, 10-min TTL |
| **slot_locks** | id, team_id (FK), slot_start, booking_id (FK) | Post-payment, UNIQUE(team_id, slot_start) |
| **team_schedules** | id, team_id (FK), day_of_week (0-6), start_time, end_time, active | UNIQUE(team_id, day_of_week) |
| **travel_cache** | PK(origin_geohash, dest_geohash, time_bucket), duration_mins | 7-day TTL |
| **feedback** | id, booking_id, customer_id, rating (1-5), comment | |
| **error_log** | id, flow_name, error_message, payload (JSONB) | service_role only |

## Views (2)

- **team_workloads** - bookings_this_week / bookings_this_month per team
- **feedback_summary** - avg_rating / review_count per team per month

## Triggers (5)

- **trg_check_booking_lock_limit** on booking_locks - max concurrent locks = active teams
- **trg_teams_updated_at** / **trg_customers_updated_at** / **trg_bookings_updated_at** / **trg_team_schedules_updated_at** - auto-update updated_at

## Functions (2)

- **check_booking_lock_limit()** - trigger function
- **cleanup_expired_booking_locks()** - call periodically

## Seed Data

- 3 teams: Team 1, 2, 3 (all active)
- 15 team_schedules: Sun-Thu (days 0-4), 08:00-18:00 each
- 1 test customer, 3 test bookings (April 5, 2026)

## Migrations Applied

- [x] UNIQUE constraint on `customers.email`
- [x] `payment_failed` added to bookings status CHECK

#database #codebase
