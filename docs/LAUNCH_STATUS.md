# Launch Status — Ductly UAE

**Last updated:** 2026-05-21
**Maintainer:** Mattia (solo founder)
**Status:** App is production-ready except for WhatsApp; team dispatch
falls back to email + manual relay until WhatsApp is unblocked.

---

## TL;DR

- Application code is launch-ready. CI passes, coverage > 60%, all
  tests green. PR #2 awaiting merge to main.
- Stripe is correctly wired to the Ductly account (Account ID
  `acct_1TWw7LAsG2wbGzMX`) in test mode on staging.
- 3 production migrations applied. Schema is current.
- **One external blocker remains: WhatsApp Business sender for
  +971 54 161 0793 is stuck in Meta's `ON_PREMISE` zombie state.**
  Without it, the team-dispatch WhatsApp branch silently fails — the
  email branch + manual relay keeps operations alive in the interim.

---

## What we've built (this sprint)

### Phase 1 — security & compliance hardening

| Area | Detail |
|---|---|
| RLS tightening | Dropped `USING (true)` policies on `bookings`, `customers`, `feedback`. Anon role can no longer read customer PII. |
| PDPL endpoints | `/api/me/export` (data subject access request) and `/api/me/delete` (right to erasure). Returns/deletes only the requester's records, joined across bookings/customers/feedback. |
| Privacy policy | Section 5 lists every third-party processor (Stripe Ireland, Supabase AWS EU, Google Maps, n8n, OpenRouter). Section 7 cites FTA 5-year retention. |
| Consent capture | Boolean `whatsapp_opt_in` + `marketing_opt_in` captured at booking, stored on `customers`. |
| Middleware | Fail-closed on Supabase verification error (was fail-open — security bypass). |
| Rate limiting | Added to `/api/slots`, `/api/admin/auth`, contact, and newsletter endpoints. |
| n8n failure logging | `fireN8nWebhook()` wrapper writes every failed webhook to `error_log` table. No more silent notification drops. |

### Phase 2 — audit fixes & dispatch hardening

| Area | Detail |
|---|---|
| `is_test_data` flag | End-to-end on bookings + customers. Driven by `event.livemode` from Stripe. n8n notifications skipped for test bookings. Admin stats + bookings list exclude test data by default (`?include_test=1` to include). |
| CSRF | Same-origin (`Origin` / `Referer`) check via `requireSameOrigin()` helper on every admin POST/PATCH/DELETE. |
| Race fix | `slot_locks` now `UNIQUE(booking_id)`. Scheduling agent only claims when `team_id IS NULL`. Admin PATCH refuses team reassignment until the agent has settled. |
| Backup runbook | `docs/BACKUP_RUNBOOK.md` — Supabase PITR, daily backups, compromise response, fire-drill procedure. |
| **Team dispatch — Google Maps link** | Built from `place_id` → `lat/lng` → text-query fallback via `buildMapsLink()` in [src/lib/dispatch-format.ts](../src/lib/dispatch-format.ts). |
| **Team dispatch — formatted time** | `formatSlotForDispatch()` produces "Tue 21 Apr, 10:00 AM" server-side. Manual 12-hour conversion to dodge Node 20 ICU edge cases. |
| **Team dispatch — admin email** | Rebuilt: team WhatsApp number, blue "Open in Google Maps" button, and a **copy-paste manual relay block** at the bottom (operational survival mode while WhatsApp is broken). |
| Travel-aware fallback | Deterministic team assignment now uses haversine distance from the team's last completed booking as a tiebreak after least-booked rule. |
| PDPL audit log | `team_data_access(team_id, booking_id, shared_fields, channel, accessed_at)`. Required for PDPL data subject access requests. |
| Address quality flag | Admin email shows "verified" / "unverified" based on whether coordinates were captured. |
| Admin Test Ping button | Per-team button in admin teams page → `POST /api/admin/teams/test-ping` → Twilio SMS. Validates reachability without needing WhatsApp Business approval. Activates the moment `TWILIO_SMS_FROM` env var is set on the server. |

### Operational

| Area | Detail |
|---|---|
| Stripe account swap | Moved from personal "Terraflow Studio" account (`acct_1SGdMXFlOxcbYonM`) to client's "Ductly Technical Service" account (`acct_1TWw7LAsG2wbGzMX`). Test keys live in `.env.local` and on staging server. Live keys staged for production launch. |
| Plesk + Passenger | Deploy reload trigger fixed — `touch tmp/restart.txt` (pm2 restart was a no-op). |
| Stripe webhooks | Test mode webhook secret matches test mode endpoint signing secret. |

### Tooling (`scripts/twilio/`)

Pre-built Twilio REST API helpers, ready to fire the moment WhatsApp
unblocks:

- `check-sender.sh` — query Twilio's view of account, senders, phone numbers, existing Content templates.
- `create-templates.sh` — create all 6 Content templates from `templates/*.json` and submit each for Meta/WhatsApp approval. Writes Content SIDs to `content-sids.env`.
- `send-test.sh` — end-to-end smoke test once approved.
- `templates/*.json` — 6 Content template payloads matching `n8n/WHATSAPP_TEMPLATES.md`.

Auth comes from shell env vars (`TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`). Never committed.

---

## The WhatsApp integration issue — deep dive

### Architecture (when it works)

```
Customer pays
  ↓
Stripe webhook → /api/webhooks/stripe
  ↓
Booking confirmed in DB + Layer 2 agent assigns team
  ↓
fireN8nWebhook("team_dispatch", N8N_WEBHOOK_TEAM_DISPATCH, payload)
  ↓
n8n.ductly.ae receives → branches in parallel:
  ├─ Branch A: HTTP POST to api.twilio.com/Messages
  │            with ContentSid + ContentVariables (Twilio Content API)
  │            ↓
  │            Twilio routes to Meta WhatsApp Business Platform
  │            ↓
  │            Message arrives on team's phone with template variables
  │            (name, time, customer, address, Maps link, etc.)
  │
  └─ Branch B: SMTP send to admin@ductly.ae
               (also includes manual relay block as fallback)
```

### Why Twilio (BSP decision)

The decision is settled. Recorded in memory as
`project-bsp-decision.md`.

- **Meta direct (Cloud API self-hosted):** Blocked. The `/register`
  Graph API endpoint now returns
  `Register endpoint is not available for SMB businesses` (error
  code 100) — a 2026 Meta policy change that gates `/register`
  behind Tech Provider status. SMBs cannot self-register.
- **360dialog (Germany):** The original BSP, n8n workflows still
  reference it. €49/mo base fee — bad economics for launch
  volumes. Charges per message on top.
- **Twilio:** ~$23/mo at 600 utility messages, $0 base fee, native
  n8n node, transparent pricing. Can switch to 360dialog later if
  volume justifies it (~3000 msg/mo crossover).

### The zombie phone problem

**Phone number:** +971 54 161 0793
**Meta Phone Number ID:** `1123875650808103`
**Meta Business Manager ID:** `970447749245035`
**Twilio Account SID:** stored in `memory/project-whatsapp-ids.md` (not duplicated in repo to satisfy secret scanning).

The phone is in `platform_type: ON_PREMISE` on Meta's
infrastructure. Both WhatsApp Business Accounts that previously
held it have been removed from our Business Portfolio, but Meta
still flags the phone number as "already registered" globally —
preventing any BSP (Twilio included) from re-onboarding it.

When Twilio Embedded Signup tries to register the phone, Meta
returns:

```
Error code: 2655122
Message:    "This phone number is already registered to a
            WhatsApp account."
```

### Removed WABAs (both confirmed removed from portfolio)

| WABA ID / Name | Status |
|---|---|
| `988413290321795` "Ductly Technical Service" (original, singular) | Removed via Meta Business Settings → WhatsApp accounts → "Remove from business portfolio" |
| "Ductly Technical Services" (plural, from a failed Twilio Embedded Signup attempt) | Removed the same way |

### What we've tried

1. **Removed both prior WABAs** from the Business Portfolio. Both
   removals confirmed.
2. **Re-ran Twilio Embedded Signup** selecting "Create a new
   business account" as Twilio support (Linea) advised. Still
   returns error 2655122.
3. **Attempted `DELETE /v19.0/{phone-number-id}`** via Meta Graph
   API. Returns `"Unsupported delete request"`. UI doesn't expose
   delete either.
4. **Opened Meta Business Support case** (Case ID
   `1487415766458863`, 2026-05-21). Agent "Cindy" from the "Meta
   Pro Team" closed the case the same day with no technical
   action — redirected us to "WhatsApp support" via a generic
   business help link and offered free Meta Blueprint marketing
   courses as a consolation. This was a tier-1 brushoff; the
   technical WhatsApp team was never engaged.
5. **Twilio support (Linea, ticket open since 2026-05-19)** — has
   confirmed the phone number itself is portable but cannot
   re-onboard until Meta clears the zombie state. Working it from
   the BSP-partner side.

### Current state (2026-05-21)

- **Twilio:** working the case via BSP-partner escalation channel.
  This is now our primary unblock path.
- **Meta:** need to refile via the WhatsApp Business Platform
  product-specific intake (not "Meta Business"). Tier-1 generic
  business support is not equipped for this issue. Drafted refile
  message exists; not yet submitted as of this writing.

### What's already built for "the moment WhatsApp comes back"

Forward-compatible work — none of this requires any further code
changes once the sender flips Connected:

- **6 Content templates** as JSON payloads in
  `scripts/twilio/templates/` ready to fire at the Twilio Content
  API: `booking_confirmed`, `booking_reminder_24h`,
  `booking_reminder_1h`, `feedback_request`, `no_show_followup`,
  `team_dispatch` (with Maps link as 10th variable).
- **`scripts/twilio/create-templates.sh`** creates all 6 in one
  run + submits each for Meta approval. Writes Content SIDs to a
  gitignored `content-sids.env` file.
- **n8n `team-dispatch.json`** rewritten for Twilio Content API
  (Basic auth via Account SID/Auth Token, `ContentSid` +
  `ContentVariables` JSON). Currently disabled (or pointing at
  placeholder credentials) until WhatsApp is back.
- **Env scaffolding** in `.env.example` for
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`,
  and the 6 `TWILIO_CONTENT_SID_*` variables.

### Workaround strategies (in priority order)

1. **Email-only launch (recommended).** The n8n workflows have
   parallel email + WhatsApp branches gated by `Has Email?` /
   `Has Phone?` IF nodes. Email branch fires regardless of
   WhatsApp state. Customers get booking confirmation, reminders,
   and feedback requests via email. The admin dispatch email has
   a copy-paste manual relay block — Mattia hand-forwards to the
   team WhatsApp until auto-dispatch resumes.
   - **What needs to change:** [src/app/book/success/page.tsx:145](../src/app/book/success/page.tsx#L145)
     currently promises "via WhatsApp and email" — soften to "via
     email" for launch. Disable the WhatsApp `httpRequest` nodes
     in n8n so failed WhatsApp calls don't halt downstream
     postgres writes (e.g. "Mark 24h Sent" in
     `booking-reminders.json`).
2. **Swap to a new phone number.** Any new SIM (Etisalat or Du,
   doesn't matter) can run Embedded Signup with a fresh phone
   number. Cost: ~1 hour to provision, marketing copy update,
   risk that the new signup also fails for unrelated reasons.
3. **SMS-only via Twilio.** Use the same Twilio account for SMS
   instead of WhatsApp. No Meta approval required, no template
   process. ~$0.07-0.10/SMS to UAE. Less "expected" than
   WhatsApp in UAE but works immediately. Same n8n workflows
   with the Twilio HTTP node pointed at the SMS endpoint instead
   of WhatsApp Content API.

---

## Pending action items

### Code (committed to alex-dev, awaiting merge to main)

- [ ] **Merge PR #2** once CI is green:
  <https://github.com/Obitus599/Ductly/pull/2>

### Configuration (server-side, by you)

- [x] Apply 3 migrations via Supabase Dashboard SQL editor (done 2026-05-21):
  - `20260520000000_is_test_data.sql`
  - `20260520120000_slot_locks_booking_unique.sql`
  - `20260521000000_team_data_access.sql`
- [ ] Re-import `n8n/team-dispatch.json` into n8n.ductly.ae (via REST
  API once you generate an n8n API key)
- [ ] Add `TWILIO_SMS_FROM` to Plesk server env (needs a Twilio
  SMS-capable number; Test Ping button stays in 503 state until then)

### Support cases

- [ ] Send Twilio reply to Linea (drafted, awaiting send) — push
  for BSP-partner-side escalation now that Meta tier-1 has punted.
- [ ] Refile Meta case via WhatsApp Business Platform product
  intake (not generic Meta Business). Drafted message exists.

### Strategic decision

- [ ] **Email-only launch or wait?** Recommended: ship email-only
  now (zero customer impact, WhatsApp activates automatically when
  env vars get populated). Only blocker is the success page copy
  edit + disabling n8n WhatsApp nodes.

### Externally blocked

- [ ] WhatsApp Business sender activation on +971 54 161 0793 —
  waiting on Twilio (Linea) OR Meta WhatsApp Business Platform
  support to force-clear the zombie phone state. Cannot proceed
  via any technical workaround on this number.

---

## File map (where to look for what)

| What | Where |
|---|---|
| Dispatch payload + Maps link wiring | [src/app/api/webhooks/stripe/route.ts](../src/app/api/webhooks/stripe/route.ts) (lines ~138-180) |
| Maps link + time formatting helpers | [src/lib/dispatch-format.ts](../src/lib/dispatch-format.ts) |
| Travel-aware deterministic fallback | [src/lib/scheduling-agent.ts](../src/lib/scheduling-agent.ts) (lines ~305+) |
| Test Ping endpoint | [src/app/api/admin/teams/test-ping/route.ts](../src/app/api/admin/teams/test-ping/route.ts) |
| Test Ping UI button | [src/app/admin/teams/page.tsx](../src/app/admin/teams/page.tsx) |
| CSRF helper | [src/lib/admin-auth.ts](../src/lib/admin-auth.ts) (`requireSameOrigin`) |
| n8n team-dispatch workflow | [n8n/team-dispatch.json](../n8n/team-dispatch.json) |
| WhatsApp template specs | [n8n/WHATSAPP_TEMPLATES.md](../n8n/WHATSAPP_TEMPLATES.md) |
| Twilio API scripts | [scripts/twilio/](../scripts/twilio/) |
| Backup procedure | [docs/BACKUP_RUNBOOK.md](BACKUP_RUNBOOK.md) |
| Last session handoff (prior context) | [docs/SESSION_HANDOFF.md](SESSION_HANDOFF.md) |

---

## Memory references (claude auto-memory)

For future sessions, the durable context lives in
`~/.claude/projects/-home-alex599-Ductly/memory/`:

- `project-bsp-decision.md` — Why Twilio, not Meta or 360dialog
- `project-whatsapp-ids.md` — All Meta/Twilio/WhatsApp identifiers
- `project-pipelines.md` — Current vs future feature triage
- `project-compliance-uae.md` — PDPL + FTA + Peppol gating
- `project-deploy-passenger.md` — Plesk + Passenger reload trigger
- `feedback-node-versions.md` — Node 20 ICU bug class
