# Session Log - Code Reviews

> From 2026-04-11 session. Ran bmad adversarial + edge-case-hunter reviews.

## Adversarial Review (12 findings)

Reviewed entire codebase for security and robustness issues.

### Fixed (all 12)
1. **UAE timezone handling** - `timestampToMins()` wasn't converting UTC→UAE. Added `UAE_OFFSET_HOURS=4`
2. **Date range queries** - Supabase queries used bare date strings instead of `+04:00` offset
3. **Day-of-week calculation** - `new Date(date)` was off by a day. Fixed to `new Date(date + "T12:00:00+04:00")`
4. **Buffer filter was one-directional** - Only checked forward gap. Added backward gap check
5. **Booking status filter** - Used `.not("status", "in", ...)` instead of explicit `.in("status", ["pending", "confirmed"])`
6. **Stripe metadata not on PaymentIntent** - Added `payment_intent_data.metadata` for failure webhook access
7. **Webhook idempotency** - No guard against Stripe retries. Added status check before processing
8. **Slot lock comparison** - Used string equality instead of epoch ms comparison
9. **Scheduling agent redundant status update** - `assignBookingToTeam` was setting status:confirmed again
10. **Admin API unprotected** - Added `requireAdmin()` middleware to all admin routes
11. **Admin PATCH no field whitelist** - Added whitelist for `active`, `name`, `whatsapp_number` only
12. **Booking locks no duplicate guard** - Added check for existing active lock from same session

## Edge-Case Hunter Review (10 findings)

### Fixed (10 critical)
1. **Date validation** - Added `isNaN(parsedDate.getTime())` check in slots API
2. **Bedrooms validation** - Added integer + non-negative check in checkout
3. **Villa 0-bedroom guard** - Reject villa with 0 bedrooms
4. **Booking lock cleanup** - Added expired lock deletion before new lock insert
5. **Lock release on "Change time"** - Frontend now sends DELETE request
6. **Double-click guard** - `if (submitting) return` at top of checkout handler
7. **Slot state guard** - Check `selectedDate && selectedSlot` before checkout
8. **Villa bedroom reset** - If switching to villa and bedrooms=0, auto-set to 1
9. **Slots response null safety** - `?? []` fallback on slots and total_teams
10. **Fetch error handling** - Added `res.ok` check before parsing JSON

## Result
All builds pass clean after both review rounds.

#session #history #review
