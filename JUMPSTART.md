# DUCTly — Project State (July 16, 2026 — Pre-Production)

## Project Overview

Next.js 14.2 app deployed on Plesk at `staging.ductly.ae` and `ductly.ae`. Stripe for payments. n8n at `n8n.ductly.ae` for WhatsApp/email automation. Supabase for database (Postgres). Twilio for WhatsApp Business API. GitHub Actions CI/CD.

| Layer | Technology |
|---|---|
| **App** | Next.js 14.2, React 18, TypeScript, Tailwind CSS 4 |
| **DB** | Supabase Postgres (`xmukqwscunwjfnfhllcl.supabase.co`) |
| **Payments** | Stripe (live keys) |
| **Automation** | n8n at `n8n.ductly.ae` (9 active workflows) |
| **WhatsApp** | Twilio Business API sender `+15559870195` |
| **Email** | Resend SMTP via n8n at `noreply@ductly.ae` |
| **CI/CD** | GitHub Actions: lint → typecheck → test:coverage → build → deploy on push to main |
| **Server** | Plesk at `136.144.243.31:8443` |
| **Sentry** | Not installed yet (planned) |

## Test State

- **42 test files, 381 tests, 0 failures**
- Coverage: 68% statements / 70% functions / 70% lines (thresholds: 60/60/60)
- Typecheck: PASS
- Run: `npx vitest run --coverage`

## Test Phone Numbers

| Role | Number | WhatsApp |
|---|---|---|
| Primary test / Owner | `+91 70420 09519` | `whatsapp:+917042009519` |
| Colleague | `+971 56 111 3186` | `whatsapp:+971561113186` |

## Database State

| Table | Key Data |
|---|---|
| `teams` | "Elite Cleaners" (whatsapp:+917042009519), "Test" (+971561113186), both active |
| `team_schedules` | 7 days for Elite Cleaners, 08:00-20:00 daily |
| `customers` | Test data present |
| `bookings` | Test data present |
| `error_log` | Active, records webhook failures + replay payloads |

## Key Files

| File | Purpose |
|---|---|
| `src/lib/pricing.ts` | **Single source of truth** for plan pricing (349/549/649), durations, labels, taglines |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook — booking confirmation, team assignment, n8n dispatch, ops alerts |
| `src/app/api/checkout/route.ts` | Checkout API — pricing, Stripe session creation, slot locking |
| `src/lib/ops-alert.ts` | 8 alert types: new_booking, reschedule, cancellation, blackout, blackout_removed, job_not_completed, payment_orphan, invoice_failed |
| `src/lib/job-completion.ts` | Team WhatsApp replies → job completion + FTA invoice issuance |
| `src/lib/twilio-whatsapp.ts` | Shared WhatsApp Content Template sender (used by Next.js, not n8n) |
| `src/lib/scheduling-agent.ts` | AI team assignment (OpenRouter GPT-4o + deterministic fallback) |
| `src/lib/dispatch-format.ts` | UAE-local time formatting, Google Maps links, address quality |
| `src/lib/n8n.ts` | Fire-and-forget n8n webhook caller with error_log fallback |
| `.env.local` | Local dev env (gitignored, manually set on Plesk) |
| `.env.example` | Template (committed) |
| `n8n/*.json` | 9 n8n workflow definitions (source of truth for imports) |
| `src/app/admin/**` | Admin panel (bookings, teams, calendar, customers, feedback, errors, travel, revenue, settings) |

## Pricing (Single Source: `src/lib/pricing.ts`)

| Plan | Rate (AED/thermostat) | Setup | Per Thermostat | VAT |
|---|---|---|---|---|
| Essential | 349 | 45 min | 45 min | +5% |
| Signature | 549 | 80 min | 45 min | +5% |
| Elite | 649 | 80 min | 60 min | +5% |

All prices display as VAT-exclusive (VAT added at Stripe checkout). All 7 files that reference pricing now import from `src/lib/pricing.ts` — single source of truth.

## WhatsApp Templates — All 11 Approved & Working

| Template | Content SID | Type | Vars | Status |
|---|---|---|---|---|
| booking_confirmed | HXee77d5031bbe740812f80af9b58bed7f | text | 4 | ✓ Approved |
| booking_reminder_24h | HX2f72159ca0479088dc89ed6d534d75fe | text | 4 | ✓ Approved |
| booking_reminder_1h | HX515f7ed987c7c9fa8c7af420d1a19ab8 | text | 3 | ✓ Approved |
| feedback_request | HX1cb2650480bc7e0b5e5709eba5f0bb54 | text | 2 | ✓ Approved |
| no_show_followup | HX047858a56c27cb0bb9c987f7f4904dd1 | text | 2 | ✓ Approved |
| team_dispatch | HX64fee64ee53d14b02137fb188ea17cd3 | text | 10 | ✓ Approved |
| ductly_ops_alert | HX3d8c4a4e06a7aa812209e1e64b64055a | text | 6 | ✓ Approved |
| ductly_job_status | HX7ab7ed05d0e43e8380282170fd6fdc29 | quick-reply | 3 | ✓ Approved |
| ductly_invoice | HX00f8163e4f20584eb40a54861ec7d8c8 | text | 6 | ✓ Approved |
| ductly_ping | HX6b16842dafd4a38b6307af821e9f341e | text | 1 | ✓ Approved |
| ductly_verify | HX69bddd2f8f60e27d3b1e65c380880da8 | auth | 1 | ✓ Approved |

## n8n — 9 Active Workflows

### Webhook-Triggered (modular: values from Next.js payload)

| Workflow | Trigger | WhatsApp To | ContentSid |
|---|---|---|---|
| Booking Confirmed | `POST /booking-confirmed` | `$json.body.customer_phone` | `$json.body.content_sid` |
| Team Dispatch | `POST /team-dispatch` | `$json.body.team_whatsapp` | `$json.body.content_sid` |
| Ops Alerts | `POST /ops-alert-v2` | `$json.body.owner_phone` | `$json.body.content_sid` |
| Payment Failed | `POST /payment-failed` | Email only | — |
| Verify Email | `POST /verify-email` | Email only | — |

### Cron-Triggered (hardcoded values — unavoidable in n8n community edition)

| Workflow | Schedule | WhatsApp To |
|---|---|---|
| Booking Reminders (24h + 1h) | Every 30 min | `$json.customer_phone` (from SQL) |
| Feedback Request | Every 1 hour | `$json.customer_phone` (from SQL) |
| No-Show Follow-Up | Every 1 hour | `$json.customer_phone` (from SQL) |
| Job Status Prompt | Every 15 min | `$json.team_whatsapp` (from SQL) |

### Credential IDs (all active, no CONFIGURE_ME placeholders)
```
Twilio:   4RkcGDN9X6hNuKWv  (httpBasicAuth)
Postgres: KEEnB64Vep0U1RKJ
SMTP:     woEEVaaZgFFtA1gv   (Resend)
```

### Import Rules
- Never use PUT — it corrupts connections
- Use POST import from `n8n/*.json` files
- Webhook workflows get `twilio_from` + `content_sid` from Next.js payload
- Cron workflows have hardcoded From/ContentSid (n8n community edition can't use $env.*)

## Admin Panel — `/admin`

| Page | Status | Notes |
|---|---|---|
| Dashboard | ✓ | Stats, recent bookings, team workloads |
| Bookings | ✓ | List, filter, create, detail, cancel+refund |
| Teams | ✓ | Add, toggle active, test-ping. No schedule edit UI yet |
| Calendar | ✓ | Day view, blackout management |
| Customers | ✓ | Searchable, paginated |
| Feedback | ✓ | Ratings, team filter |
| Revenue | ✓ | Period-selectable booking counts |
| Error Log | ✓ | Filter by flow, expandable payload |
| Travel Calc | ✓ | Google Maps distance/time calculator |
| Settings | ✓ | Read-only config reference |
| Contacts | ✓ | Contact forms + newsletter |

### Known Admin Gaps
- No team schedule editing UI (schedules must be managed via DB)
- No team delete (only deactivate)
- Calendar may miss bookings spanning midnight
- Feedback pagination breaks with team filter
- 9 admin read routes at 0% test coverage

## Production Readiness — Completed Fixes (July 16)

- [x] NEXT_PUBLIC_APP_URL set to https://ductly.ae
- [x] GA4 wrapped in conditional (no crash if env unset)
- [x] ADMIN_API_KEY configured
- [x] Admin booking create: `any` → typed `CreateBookingBody` interface
- [x] All n8n JSONs cleaned (no staticData/tags/pinData/versionId)
- [x] CONFIGURE_ME credentials replaced with real IDs in all 9 workflows
- [x] 3 webhook workflows modularized (twilio_from + content_sid from payload)
- [x] Pricing consolidated to single module (`src/lib/pricing.ts`)
- [x] AI chat system prompt built dynamically from pricing
- [x] Landing page FAQ + pricing from shared config
- [x] Version bumped to 1.0.0
- [x] All 11 WhatsApp templates Meta-approved and tested on 2 numbers
- [x] Typecheck: PASS, Tests: 381/381 PASS

## Remaining Pre-Launch Work

### Blocker (must fix)
- Nothing blocking — app is deployable

### High Priority
- Add team schedule editing UI
- Fix admin cancel button silently swallowing refund failures
- Fix booking detail error masking (shows "not found" for all errors)
- Install Sentry for production error monitoring
- Add loading.tsx + error.tsx for admin routes

### Medium Priority
- Console.log cleanup (89+ statements, wrap in dev-only)
- Admin route test coverage (9 routes at 0%)
- Split 1009-line page.tsx into components
- CSP unsafe-eval verification/removal
- Fix feedback pagination with team filter

### Low Priority
- Team delete functionality
- Trustpilot reviews → dynamic
- Arabic RTL i18n
- Recurring bookings
- Cookie consent banner for GA4

## File Structure

```
src/
  app/
    api/
      checkout/route.ts           Stripe checkout session creation
      webhooks/
        stripe/route.ts           Stripe webhook handler (booking confirm + dispatch + ops alert)
        twilio/route.ts           Twilio WhatsApp inbound webhook (job status replies)
      admin/
        auth/route.ts             Admin login/logout
        bookings/route.ts         List bookings
        bookings/[id]/route.ts    Booking detail + update
        bookings/[id]/cancel/route.ts   Cancel + refund
        bookings/create/route.ts  Manual booking creation
        teams/route.ts            Teams CRUD
        teams/test-ping/route.ts  WhatsApp reachability test
        calendar/route.ts         Calendar data
        schedule-blackouts/route.ts  Blackout management
        stats/route.ts            Dashboard stats
        customers/route.ts        Customer list
        feedback/route.ts         Feedback list
        revenue/route.ts          Revenue/overview
        contacts/route.ts         Contact forms + newsletter
        errors/route.ts           Error log
        export/route.ts           CSV export
        travel/route.ts           Travel time calculator
      slots/route.ts              Available time slots
      verify/send/route.ts        OTP send (email + WhatsApp)
      verify/check/route.ts       OTP verification
      chat/route.ts               AI chatbot
      booking-details/route.ts    Post-payment booking details
      booking-locks/route.ts      Slot locking
      manage/[token]/route.ts     Customer manage booking
      manage/[token]/cancel/route.ts  Customer self-cancel
      manage/[token]/reschedule/route.ts  Customer self-reschedule
      contact/route.ts            Contact form submission
      newsletter/route.ts         Newsletter signup
      me/delete/route.ts          GDPR data deletion
      me/export/route.ts          GDPR data export
      health/route.ts             Health check
    admin/
      page.tsx                    Dashboard
      bookings/                   Bookings management
      teams/                      Teams management
      calendar/                   Calendar view
      customers/                  Customer list
      feedback/                   Feedback/reviews
      revenue/                    Revenue overview
      errors/                     Error log
      travel/                     Travel calculator
      settings/                   Configuration reference
      contacts/                   Contact forms
      login/                      Admin login
    book/                         Public booking flow (details → calendar → checkout → success)
    page.tsx                      Landing page
  lib/
    pricing.ts                    Single source: plan rates, durations, labels, taglines
    ops-alert.ts                  8 alert event types + fireOpsAlert()
    job-completion.ts             Team job status replies → completion + invoice
    n8n.ts                        n8n webhook fire-and-forget
    twilio-whatsapp.ts            WhatsApp Content Template sender
    scheduling-agent.ts           AI team assignment
    dispatch-format.ts            UAE time formatting, maps links
    stripe.ts                     Stripe client
    email.ts                      Resend email sender
    email-templates.ts            Verification email HTML
    vat.ts                        UAE VAT calculations (5%)
    slot-helpers.ts               Slot generation, operating hours (08:00-18:00)
    rate-limit.ts                 IP-based rate limiting
    admin-auth.ts                 requireAdmin() + requireSameOrigin() CSRF
    consent.ts                    PDPL consent versioning
    verification.ts               OTP generation + verification
    phone-uae.ts                  UAE phone normalization
    invoice.ts                    FTA tax invoice PDF generation
    travel-math.ts                Google Maps distance/time
    supabase/                     Supabase client (server + browser)
  components/
    ChatWidget.tsx                AI customer service chat
    ... UI components
  __tests__/                      42 test files
n8n/                              9 workflow JSON definitions
```

## Development Commands

```bash
npm run dev              # Start dev server (port 3003)
npm run build            # Production build (runs vitest first via prebuild hook)
npx vitest run           # Run tests
npx vitest run --coverage  # Tests with coverage
npx tsc --noEmit          # TypeScript typecheck
```
