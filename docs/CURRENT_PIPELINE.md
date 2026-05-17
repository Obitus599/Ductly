# Ductly — Current Build Pipeline

Items to ship **before launch** or in the immediate post-launch window.
Items below the line are deferred — see [FUTURE_PIPELINE.md](FUTURE_PIPELINE.md).

Updated: 2026-05-17

---

## 🔴 Pre-launch blockers

### Compliance

- [ ] **PDPL compliance** (UAE Personal Data Protection Law)
  - Data export endpoint: `GET /api/me/export` returns all customer data (bookings, contact info, feedback) as JSON
  - Data deletion endpoint: `DELETE /api/me/delete` soft-deletes customer + anonymises bookings
  - Consent record: store `consent_given_at` + `consent_version` on `customers` row at booking time
  - Privacy policy: review & update `src/app/privacy/page.tsx` to explicitly cover PDPL (retention, purposes, third parties: Stripe, Supabase, Google, Twilio, n8n, OpenRouter)

- [ ] **Cookie consent banner**
  - Show on first visit, persist choice in localStorage
  - Categories: Essential (always on), Analytics (opt-in), Marketing (opt-in)
  - Block GA4/Plausible/Meta Pixel until user consents to Analytics or Marketing
  - Suggested lib: [`react-cookie-consent`](https://www.npmjs.com/package/react-cookie-consent) or roll our own (it's small)

- [ ] **Cancellation policy on booking page**
  - Standard text: "Free cancellation up to 24 hours before your appointment. Within 24 hours, cancellations are non-refundable." (placeholder — client to edit)
  - Display on `/book` step 3 (checkout) above Pay button
  - Also on `/book/success` and in the confirmation email

- [ ] **UAE FTA-compliant tax invoice generation** ⚠️ NOT handled by Stripe
  - **Confirmed (research, 2026-05-17):** Stripe Checkout receipt is a payment receipt, NOT a valid FTA tax invoice. Stripe Invoicing is only partially compliant.
  - **What Stripe DOES handle:** Stripe Tax can calculate 5% UAE VAT — enable it in Dashboard once we have our TRN registered.
  - **What we need to build:** Trigger from `checkout.session.completed` webhook → generate FTA-compliant tax invoice PDF and email/store it.
  - **FTA-mandatory fields:** "Tax Invoice" wording prominently displayed; supplier name/address/15-digit TRN; buyer name/address/TRN (B2B optional); unique sequential invoice number; issue date + date of supply; itemised description, qty, unit price; VAT rate per line; net + VAT + gross in AED.
  - **⚠️ Future requirement:** From **1 July 2026 (pilot) / 1 Jan 2027 (mandatory)**, UAE switches to **Peppol PINT-AE XML e-invoicing via an Accredited Service Provider** — PDFs alone won't satisfy compliance after that.
  - **Recommended path:** Integrate with a UAE-localised invoicing tool that's preparing Peppol ASP integration:
    - [Wafeq](https://wafeq.com/) — UAE-native, Stripe webhook integration, Peppol-ready
    - [Zoho Books UAE](https://www.zoho.com/ae/books/) — broader suite, Peppol-ready
    - [ClearTax AE](https://cleartax.com/sa/en) — compliance-focused
    - [Daftra](https://daftra.com/) — simpler, cheaper
  - **Interim if no time for integration:** Custom PDF generator with `@react-pdf/renderer` triggered from webhook — only valid through end of 2026 at most.

### Booking flow

- [ ] **Service area validation on booking page**
  - Define active emirate/zone coverage (initial: Dubai only? Dubai + Sharjah + Abu Dhabi?)
  - Use geohash prefixes to validate `AddressPicker` output against coverage list
  - Hard reject with friendly message: "We don't service this area yet — join the waitlist [link]"
  - Coverage list lives in `src/lib/service-area.ts` for easy edits
  - Admin setting to toggle zones live without redeploy

---

## 🟡 Post-launch — within first 30 days

### Customer-facing

- [ ] **Promo codes / discount coupons (via Stripe Coupons)**
  - Use [Stripe Coupons](https://stripe.com/docs/api/coupons) — no DB schema needed
  - Add promo code input field on `/book` checkout step
  - Pass `discounts: [{ promotion_code: ... }]` to Stripe Checkout Session
  - Admin UI for creating/managing codes via Stripe Dashboard (no in-app UI yet)

- [ ] **Add-on services**
  - AC vent cleaning, dryer vent, attic vent — schema needed (`booking_addons` table)
  - Step in booking flow: "Add extras?" after main plan pick
  - Stripe line items per add-on for VAT correctness
  - Affects total + slot duration (need to recalculate travel buffer)

### Admin

- [ ] **Audit log**
  - Schema: `admin_audit_log` (id, admin_user, action, target_type, target_id, payload_before, payload_after, created_at)
  - Middleware on all admin write endpoints — log automatically
  - Admin UI page `/admin/audit` to view + filter by user/action/date
  - Retention: 1 year minimum (compliance hint)

- [ ] **Refund UI for admin**
  - `/admin/bookings/[id]` page — add "Issue Refund" button (currently auto-only on customer cancel)
  - Modal: amount (full or partial), reason text, confirm
  - Calls Stripe `refunds.create({ payment_intent, amount })`
  - Log to `admin_audit_log` + update booking status
  - Show refund history per booking

- [ ] **Bulk operations**
  - Bulk reschedule (weather, holidays): select N bookings → pick new dates per booking OR shift all by X days
  - Bulk cancel: select N bookings → cancel with reason + auto-refund + notify customers
  - Admin UI: checkboxes on `/admin/bookings` list + action toolbar

### Backend

- [ ] **Admin route test coverage**
  - Nine admin API routes currently have 0% unit test coverage: `admin/bookings/[id]`, `admin/bookings/[id]/cancel`, `admin/bookings/create`, `admin/calendar`, `admin/contacts`, `admin/customers`, `admin/errors`, `admin/export`, `admin/feedback`, `admin/revenue`
  - vitest coverage thresholds were temporarily lowered (60% lines/functions/statements, 45% branches in `vitest.config.ts`) on 2026-05-17 because these gaps tanked the global numbers — raise them back to 80/70 as tests get written
  - Pattern to follow: see `src/__tests__/api/admin-stats.test.ts` and `admin-teams.test.ts` (already at ~85–90% coverage)

- [ ] **Sentry / error monitoring**
  - Free tier: 5k errors/month — fine for launch
  - Wire `@sentry/nextjs` SDK, configure DSN as env var
  - Alert rules: Stripe webhook failures, scheduling-agent failures, 5xx on `/api/*`
  - Replace `error_log` table writes with Sentry breadcrumbs (or keep both)

- [ ] **Uptime monitoring**
  - BetterStack (free tier 10 monitors) or UptimeRobot (free tier 50 monitors)
  - Monitor: `ductly.ae`, `staging.ductly.ae`, `staging.ductly.ae/api/health`, `n8n.ductly.ae`
  - Alert via email + WhatsApp (BetterStack supports this) on 2-min downtime

- [ ] **Supabase Pro upgrade ($25/mo)**
  - PITR backups extend from 7 → 30 days
  - 8GB DB included (vs 500MB on free)
  - Daily backups stored 30 days
  - Better for production audit needs (and PDPL retention)

### Growth / SEO

- [ ] **SEO basics**
  - `sitemap.xml` — auto-generated from routes via `next-sitemap` or `app/sitemap.ts`
  - `robots.txt` — allow staging crawl? No — block staging, allow production
  - Open Graph image (`public/og.png` — 1200x630)
  - Twitter card meta tags
  - Structured data: `Organization`, `Service`, `LocalBusiness` JSON-LD (partial exists in `src/app/layout.tsx`)

- [ ] **A/B testing infrastructure**
  - Use Vercel Edge Config or simple cookie-based feature flags
  - Wrapper: `<Experiment name="hero-copy" variants={['a','b']} />`
  - Track conversion via GA4 events
  - First test ideas: hero CTA copy, pricing display (with/without VAT), plan order

### Admin / Ops

- [ ] **Customer LTV dashboard**
  - `/admin/customers` enhancement — add LTV column, sort by it
  - LTV = sum of `bookings.amount_paid` per customer
  - Segments: First-time (1 booking), Repeat (2–4), Loyal (5+), At-risk (no booking in 12 months)
  - Highlight at-risk in red so ops can run retention WhatsApp campaign

- [ ] **Quote system for non-standard jobs**
  - New table: `quote_requests` (customer info, address, service type, message, status, created_at)
  - Public form at `/quote` for commercial / multi-villa / complex jobs
  - Admin UI at `/admin/quotes` — view requests, send manual quote via email (or convert to a manual booking)
  - n8n workflow: notify admin via WhatsApp on new quote request

### Security

- [ ] **2FA on admin login**
  - TOTP-based (Google Authenticator, Authy)
  - Store `totp_secret` on admin user (need an `admin_users` table — currently single API key)
  - This couples with the future multi-admin role work, so consider scoping together
  - Backup: 10 single-use recovery codes per admin

- [ ] **Admin session timeouts**
  - Idle timeout: 30 min
  - Absolute timeout: 8h
  - Sliding session refresh on activity
  - Cookie: `httpOnly`, `secure`, `sameSite: 'strict'`

- [ ] **CSRF tokens on admin endpoints**
  - Generate token on login, store in session
  - All admin POST/PUT/DELETE require `x-csrf-token` header matching session token
  - Most Next.js apps skip this because same-site cookies cover most cases — but belt-and-suspenders is good for admin

- [ ] **Secrets rotation policy / runbook**
  - Doc at `docs/SECRETS_ROTATION.md`
  - Rotation cadence: Stripe (90d), Supabase service role (180d), Meta tokens (never expire but rotate on team change), n8n webhooks (90d)
  - Step-by-step runbook per secret (where to rotate, what to update, how to verify)

### Infrastructure

- [ ] **CDN for images**
  - Move `public/images/*` to Vercel/Cloudflare or Supabase Storage
  - Use Next `<Image>` everywhere (some pages use plain `<img>`)
  - Configure CDN cache headers (1 year for hashed assets)
  - WebP / AVIF auto-conversion

- [ ] **Queue system for retries**
  - Currently: n8n + Stripe webhooks have no retry logic on our side
  - Add: simple DB-backed queue for failed n8n webhook calls
  - Schema: `webhook_retries` (id, target_url, payload, attempts, next_attempt_at, last_error)
  - Cron-style retry every 1m, max 5 attempts with exponential backoff

- [ ] **SMS fallback**
  - If WhatsApp message fails (template not approved, customer no WhatsApp, rate limit), fall back to Twilio SMS
  - Same content, condensed for SMS char limits
  - Configure as a fallback in n8n workflows
  - Cost: SMS ~$0.04 in UAE (similar to WhatsApp template)
