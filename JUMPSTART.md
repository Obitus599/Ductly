# DUCTly — Jumpstart Prompt (July 14, 2026)

## Project Basics

Next.js 14 app deployed on Plesk at `staging.ductly.ae` and `ductly.ae`. Stripe for payments, n8n at `n8n.ductly.ae` for WhatsApp/email automation, Supabase for database (Postgres), Twilio for WhatsApp Business API.

| Service | Details |
|---|---|
| **App** | Next.js 14.2, React 18, TypeScript, Tailwind CSS |
| **DB** | Supabase Postgres at `xmukqwscunwjfnfhllcl.supabase.co` |
| **Payments** | Stripe (live keys in `.env.local`) |
| **Automation** | n8n at `n8n.ductly.ae` (6 legacy + 2 new workflows) |
| **WhatsApp** | Twilio sender `+15559870195` (US number, Connected) |
| **Email** | Resend SMTP at `noreply@ductly.ae` |
| **CI/CD** | GitHub Actions: lint → typecheck → test:coverage → build → deploy on push to main |
| **Server** | Plesk at `136.144.243.31:8443` (root / `!Pl3sk2026FFAA!`) |
| **Git** | `https://github.com/Obitus599/Ductly` |

## Credentials (All Active)

| Service | Key |
|---|---|
| **Twilio SID** | `ACe6bc...` |
| **Twilio Token** | `f80eaa984bca5a581d426f5a106e6063` |
| **WhatsApp From** | `whatsapp:+15559870195` |
| **Supabase DB** | `postgres:Oblivion@1` at pooler:6543 |
| **Resend SMTP** | `re_4XUVyUwe_3zVp2s8wXr9bi1g6KFG1NWM5` |
| **n8n API Key** | `eyJhbGciOiJIUzI1NiIs...` (JWT — read-only; can't activate/deactivate via API) |
| **Plesk** | `root` / `!Pl3sk2026FFAA!` at `136.144.243.31:8443` |
| **Test Phone** | `+917042009519` |
| **Stripe Test Card** | `4242 4242 4242 4242` (any future CVC/ZIP) |

## Pricing

| Plan | Rate (AED/thermostat) |
|---|---|
| Essential | 349 |
| Signature | 549 |
| Elite | 649 |

Note: User requested 699 for Elite; code currently has 649. Not yet reconciled.

## Database State

18 tables, 2 views, 3 RPC functions. Core reference data:

| Table | Rows | Notes |
|---|---|---|
| `teams` | 3 | "Elite Cleaners" (`whatsapp:+971501234567`, active), 2 test teams |
| `team_schedules` | 7 | All days 08:00-20:00 for Elite Cleaners |
| `customers` | 0 | Empty (data was wiped) |
| `bookings` | 0 | Empty |
| `error_log` | 0 | Empty |

**Schema matches all migrations.** `job_status_prompts` table exists (ready for job-completion flow).

## n8n — Workflows

### 6 Legacy Workflows (Active, Working)

| Workflow | Type | Trigger | WhatsApp To |
|---|---|---|---|
| Booking Confirmed | Webhook `booking-confirmed` | Stripe webhook via Next.js | Customer |
| Team Dispatch | Webhook `team-dispatch` | Stripe → Layer 2 agent → n8n | Field team |
| Booking Reminders (24h + 1h) | Cron 30min | SQL: upcoming bookings | Customer |
| Feedback Request | Cron 1h | SQL: completed 2h ago | Customer |
| No-Show Follow-Up | Cron 1h | SQL: no_show 30min ago | Customer + admin |
| Payment Failed | Webhook `payment-failed` | Stripe webhook | Email only |

**CRITICAL**: WhatsApp values are HARDCODED in n8n nodes, not env vars. Community edition of n8n can't add env vars. Always hardcode values in workflow JSONs. Never use PUT to update workflows — it corrupts connections. Use POST import from local JSON files.

### 2 New Workflows (Need Activation)

| Workflow | n8n ID | Webhook Path | Status |
|---|---|---|---|
| Ops Alerts | `UbdywcNYLMpiG27J` | `ops-alert-v2` | Imported, **needs activation** |
| Job Status Prompt | `ex4b2VYwxiBAj0R0` | Cron 15min | Imported, **needs activation** |

**Ops Alert** (`n8n/ops-alert.json`):
- Webhook `POST /ops-alert-v2`
- WhatsApp to `+917042009519` (hardcoded) via `ductly_ops_alert` template (SID: `HXb620...`)
- Email to `admin@ductly.ae`
- Env var: `N8N_WEBHOOK_OPS_ALERT=https://n8n.ductly.ae/webhook/ops-alert-v2`
- Fired from 8 code points: new_booking, reschedule, cancellation, blackout, job_not_completed, payment_orphan, invoice_failed, blackout_removed

**Job Status Prompt** (`n8n/job-status-prompt.json`):
- Cron every 15 minutes
- Queries bookings 45-75 min after start (status=confirmed, no existing prompt)
- Sends `ductly_job_status` Quick Reply WhatsApp to team
- Writes `job_status_prompts` row for reply correlation
- Email log to admin@ductly.ae

### Workflow Credential IDs (from live server)
```
Twilio:  4RkcGDN9X6hNuKWv  (httpBasicAuth)
Postgres: KEEnB64Vep0U1RKJ
SMTP:    woEEVaaZgFFtA1gv   (Resend)
```

## WhatsApp Templates — Content SIDs

### Active in `.env.local` (n8n-referenced)
| Template | SID |
|---|---|
| `booking_confirmed` | `HXee77d5031bbe740812f80af9b58bed7f` |
| `booking_reminder_24h` | `HX2f72159ca0479088dc89ed6d534d75fe` |
| `booking_reminder_1h` | `HX515f7ed987c7c9fa8c7af420d1a19ab8` |
| `feedback_request` | `HX1cb2650480bc7e0b5e5709eba5f0bb54` |
| `no_show_followup` | `HX047858a56c27cb0bb9c987f7f4904dd1` |
| `team_dispatch` | `HXac2c655f77400b65b21c0c42e87705b4` |

### Active in `.env.local` (Next.js-referenced)
| Template | SID | Used By |
|---|---|---|
| `ductly_invoice` | `HX3d5953198f7bf9e655dc011c8a272917` | `job-completion.ts` |
| `ductly_job_status` | `HX7ab7ed05d0e43e8380282170fd6fdc29` | Job Status Prompt workflow |
| `ductly_ops_alert` | `HXb620c5bda6c771bfeb872d384e3cae66` | Ops Alert workflow |
| `ductly_ping` | `HX6b16842dafd4a38b6307af821e9f341e` | `test-ping` route |
| `ductly_verify` | `HX69bddd2f8f60e27d3b1e65c380880da8` | `twilio-verify.ts` |

### Template JSONs (for creating in Twilio)
- `scripts/twilio/templates/*.json` — 6 original templates
- `scripts/twilio/templates-v2/*.json` — 3 templates (invoice, job_status, ops_alert)
- `scripts/twilio/templates-v3/ductly_verify.json` — OTP verification
- `scripts/twilio/templates-ping/ductly_ping.json` — Team ping
- Run: `bash scripts/twilio/create-templates.sh <subdir>`

## Test State

- **42 test files, 381 tests, 0 failures**
- Coverage: 68% statements / 70% functions / 70% lines (thresholds: 60/60/60)
- Run: `npx vitest run --coverage`

## What Was Done This Session (July 14, 2026)

### 1. GA4 Integration
- Installed `@next/third-parties`, added `GoogleAnalytics` to root layout
- Updated CSP in `next.config.mjs` for `googletagmanager.com` and `google-analytics.com`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-DGT9JVQ7H1` in `.env.local`

### 2. Database Recovery
- Seeded 1 team ("Elite Cleaners") + 7 daily schedules
- Applied all pending migrations from origin (25 commits pulled)

### 3. WhatsApp Template Pipeline
- Created `ductly_ping` template (SID: `HX6b1684...`) in Twilio
- Created `ductly_verify` template (SID: `HX69bddd...`) in Twilio
- Approval pending Meta review (utility templates)

### 4. Test-Ping Route
- Switched from SMS → WhatsApp Content API using `twilio-whatsapp.ts` lib
- Route: `src/app/api/admin/teams/test-ping/route.ts`

### 5. Automated Messages — 3 New Flows
- **Ops Alerts**: `n8n/ops-alert.json` — WhatsApp to owner + email on 8 event types
- **Job Status Prompt**: `n8n/job-status-prompt.json` — Cron sends Quick Reply WhatsApp to team
- **Invoice WhatsApp Delivery**: `job-completion.ts` sends `ductly_invoice` WhatsApp on job completion

### 6. n8n Server Troubleshooting
- n8n POST API returns 500 → restarted via Plesk CLI scheduler
- UTF-8 encoding issues (em dashes corrupted to `â€"`) → fixed with ASCII
- n8n community edition can't add env vars → hardcoded phone in workflows
- Webhook path conflicts → used `ops-alert-v2` path

## Work Remaining

### High Priority (Blocking Launch)
| Task | Details |
|---|---|
| **Activate new n8n workflows** | `UbdywcNYLMpiG27J` (ops-alert-v2) and `ex4b2VYwxiBAj0R0` (job-status-prompt) must be activated in n8n UI. Path: Settings → Workflows → toggle Active. Delete old broken ones (`rWlDSET2Lp4cOkWh`, `eQ5qkQvlKPPRmHeZ`). |
| **Test full booking flow on staging** | Book with test phone `+917042009519`. Verify: Stripe webhook fires → WhatsApp booking confirmation received → team dispatch WhatsApp received → ops alert WhatsApp received. |
| **Elite pricing fix** | Code has 649, user wants 699. Update in `checkout/route.ts`, `admin/bookings/create/route.ts`, and all test files. |

### Medium Priority (Post-Launch)
| Task | Details |
|---|---|
| **Cancellation notifications** | No WhatsApp/email when booking cancelled via manage or admin. Fire ops_alert or new n8n flow. |
| **Reschedule notifications** | No notification to customer/team on reschedule. |
| **4-day reminder** | Master doc planned it. Only 24h/1h exist. New Twilio template + n8n flow + DB column needed. |
| **30-day re-engagement** | Planned, not built. Cron scans inactive customers → re-engagement WhatsApp. |
| **Cookie consent banner** | Per `CURRENT_PIPELINE.md`. GA4 should be gated behind consent. |
| **Meta template approvals** | `ductly_ping` and `ductly_verify` need Meta approval. Check Twilio Console → Content Template Builder. |
| **Admin route test coverage** | 9 admin routes at 0% coverage. |

### Deferred
| Task | Details |
|---|---|
| **Team scheduler / shift notifications** | Notify team at start of shift with daily schedule. |
| **Sentry/error monitoring** | Currently no production error tracking. |
| **Promo codes, addon services** | Per pipeline doc. |
| **Arabic i18n (RTL)** | UAE market requirement. |
| **Recurring bookings** | Not started. |

### Old Broken Workflows on n8n (Delete These)
```
yDBdKXOwkSaManip   — Old ops-alert (UTF-8 corrupted, env var IF nodes)
y5KThSu9ITYxBvfy   — Old job-status-prompt (UTF-8 corrupted name)
rWlDSET2Lp4cOkWh   — Old ops-alert (conflicting webhook path)
eQ5qkQvlKPPRmHeZ   — Old ops-alert (conflicting webhook path)
```

## Key File Paths

| File | Purpose |
|---|---|
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook handler (booking confirm, team dispatch, ops alerts, payment failed) |
| `src/app/api/checkout/route.ts` | Checkout/pricing |
| `src/lib/job-completion.ts` | Job completion + invoice WhatsApp delivery |
| `src/lib/ops-alert.ts` | Ops alert events and n8n webhook firing |
| `src/lib/twilio-whatsapp.ts` | Shared WhatsApp template sender |
| `src/app/api/admin/teams/test-ping/route.ts` | Team ping via WhatsApp template |
| `.env.local` | Local dev env (gitignored, manually set on Plesk) |
| `.env.example` | Template (committed) |
| `n8n/*.json` | n8n workflow definitions (source of truth for imports) |
| `scripts/twilio/templates*/` | Twilio template JSONs for Content API |
| `supabase/schema.sql` + `migrations/` | DB schema (source for Supabase) |

## Development Commands

```bash
npm run dev              # Start dev server
npx vitest run --coverage # Run tests with coverage
npx tsc --noEmit          # TypeScript typecheck
```

## n8n Plesk Server Commands (for restarting n8n remotely)

Plesk REST API: `https://136.144.243.31:8443/api/v2/` with Basic Auth (root / !Pl3sk2026FFAA!)
Create and run scheduler task to restart n8n:
```bash
# Create a scheduled task via Plesk API:
curl -k -X POST "https://136.144.243.31:8443/api/v2/cli/scheduler/call" \
  -u "root:!Pl3sk2026FFAA!" \
  -d '{"params":["--create","-user","root","-type","exec","-command","sudo -u ductly /home/ductly/.npm-global/bin/pm2 restart n8n 2>&1 || pkill -f n8n 2>&1","-schedule","0 0 1 1 *","-description","restart-n8n"]}'

# Run the task (use the ID returned above):
curl -k -X POST "https://136.144.243.31:8443/api/v2/cli/scheduler/call" \
  -u "root:!Pl3sk2026FFAA!" \
  -d '{"params":["--run","<ID>"]}'
```
**WARNING**: JSON must be written WITHOUT BOM (UTF-8). Use `[System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))` in PowerShell.
