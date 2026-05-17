# Ductly — Future Pipeline

Features deferred from the current build. Revisit after launch + initial
operational stability. Active items live in [CURRENT_PIPELINE.md](CURRENT_PIPELINE.md).

Updated: 2026-05-17

---

## 🟢 Phase 2 — after launch

### Customer

- [ ] **Customer accounts / login**
  - Currently: token-based access only (manage link in email/WhatsApp)
  - Plan: Supabase Auth (passwordless magic link or phone-based OTP)
  - Repeat customer dashboard: booking history, saved addresses, payment methods
  - Optional: social login (Google, Apple)
  - Schema: `customers.auth_user_id` linking to `auth.users` in Supabase

- [ ] **Arabic language toggle (i18n)**
  - Use `next-intl` or built-in `app/[locale]/...` routing
  - Locales: `en` (default), `ar`
  - RTL support: `dir="rtl"` swap on `<html>`, Tailwind RTL utilities
  - Translate: landing, booking flow, emails, WhatsApp templates
  - SEO: hreflang tags, separate Arabic sitemap

- [ ] **Reviews / ratings display on landing**
  - Wait until we have ~20+ feedback entries (social authority threshold)
  - Pull from `feedback` table, show aggregate stars + 3–5 latest comments
  - Schema-org `AggregateRating` markup for Google rich snippets
  - Filter: show only ratings ≥ 4 stars publicly (curate)

- [ ] **Before / after gallery**
  - Portfolio of past jobs (with customer permission)
  - Upload via admin dashboard, display on landing + dedicated `/gallery`
  - Optimised images via CDN

- [ ] **Team profiles**
  - Bios, certifications (HVAC, DCD if applicable), photos
  - Trust signal — humans behind the service
  - Display on landing "Meet the Team" section + within booking confirmation

- [ ] **Service area map visualization**
  - Interactive map showing covered emirates/zones
  - Embed on landing + booking page
  - Uses same coverage data as the service area validation rule

- [ ] **Gift cards**
  - Buy gift card → recipient redeems at checkout
  - Stripe Gift Cards or custom implementation
  - Minor revenue source, holiday season boost

### Customer (already in progress by coworker)

- [ ] **Customer chat bot** — coworker building via OpenRouter
  - Will eventually serve ETA notifications + service questions
  - Likely replaces the need for Intercom/Crisp
  - Coordinate to ensure it has access to booking data via Supabase

### Admin

- [ ] **Multi-admin roles (super admin / ops / finance)**
  - Replace single `ADMIN_API_KEY` with `admin_users` table + role enum
  - RBAC: super-admin (everything), ops (bookings + teams), finance (revenue + refunds, read-only on bookings), support (read-only)
  - Couples with 2FA work in CURRENT_PIPELINE — consider scoping together
  - Audit log (CURRENT_PIPELINE) becomes more important once multi-admin

- [ ] **Team performance metrics**
  - Per-team dashboard: jobs/day, avg completion time, rebook rate, customer rating
  - Inform team assignment AI (`scheduling-agent`)
  - Surface in `/admin/teams/[id]` detail view

- [ ] **Inventory tracking**
  - Filters used per job, supply restock alerts
  - Adds operational overhead — only worth it once team is 5+ people
  - Schema: `supplies`, `supply_consumption` tables

### Backend / Infrastructure

- [ ] **Recurring / subscription bookings**
  - Not in scope per client (yet)
  - Common UAE service pattern (annual maintenance plans) — revisit if client requests
  - Stripe Subscriptions for billing + custom slot generation per cycle

- [ ] **Marketing email sender**
  - Promotional sends to `newsletter_subscribers`
  - Marketing-side decision — possibly handled by marketing team's tool (Mailchimp/Brevo)
  - Just expose API endpoint for unsubscribe (already needed for compliance)

### Growth

- [ ] **Analytics (GA4 or Plausible)**
  - Wire after launch — analytics on a pre-launch staging site is noise
  - Plausible recommended: lightweight, GDPR/PDPL-friendly, no cookie banner overhead
  - Goals to track: booking funnel, drop-off step, plan distribution, traffic source ROI

- [ ] **Blog / content marketing**
  - SEO long-tail keywords: "duct cleaning Dubai Marina", "AC duct cleaning cost UAE"
  - Use Next MDX or headless CMS (Sanity, Contentlayer)
  - Frequency: 1 post/week, 6 months to ranking momentum

- [ ] **Google Business Profile integration**
  - Set up GBP listing (free)
  - Aggregate reviews from GBP + on-platform feedback
  - Display "Verified on Google" badge

- [ ] **Trustpilot / Google Reviews badges**
  - Once we have 50+ reviews on Trustpilot or GBP
  - Embed on landing as social proof

- [ ] **Referral program**
  - Each customer gets a unique referral code (5 char alphanumeric)
  - Referrer gets AED X off next booking when referee completes first job
  - Referee gets AED Y off first booking
  - Track via UTM + cookie + URL param
  - Tied into promo codes work in CURRENT_PIPELINE

---

## ❌ Explicitly out of scope (do not build unless requested)

- ~~TRN on invoices~~ — client's call when they cross AED 375k threshold
- ~~Pre-booking estimate tool~~ — pricing on homepage covers this
- ~~Booking notes (internal admin comments)~~ — not required
- ~~Photo proof of work~~ — informing customers via communication, not building
- ~~Photo upload by customer pre-booking~~ — not required
- ~~Mobile app for field teams~~ — desktop access is sufficient

---

## Open questions / decisions needed

- **Service area scope at launch**: Dubai only? Dubai + Sharjah? All 7 emirates? Decision affects service-area validation rule.
- **Pricing inclusive or exclusive of VAT**: Better UX to show inclusive ("AED 350 all-in") vs exclusive ("AED 333 + AED 17 VAT")?
- **Invoicing tool choice**: Wafeq, Zoho Books UAE, ClearTax AE, or Daftra? Decision blocks the FTA tax invoice work in CURRENT_PIPELINE.
- **Single-admin vs multi-admin timing**: 2FA + audit log + multi-admin roles are interrelated. Do them as one feature or staggered?
