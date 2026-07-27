# Tabby (BNPL) Integration — Design

**Status:** Proposed — for review before implementation
**Author:** drafted 2026-07-14
**Mode:** build in Tabby **sandbox** behind a flag, verify end-to-end, then swap live keys

---

## 1. Principle: no own checkout page needed

Tabby is not a Stripe payment method — Stripe Checkout cannot display it. But
Tabby has its **own hosted checkout**: we create a session via their API, get
back a `web_url`, and redirect the customer there — the same redirect shape we
already use for Stripe. So we add a **fork before the redirect**, and build no
card-form UI of our own.

```
Booking → review step
  └─ customer picks payment method
       ├─ Card   → POST /api/checkout (card)  → Stripe session  → redirect to Stripe   (unchanged)
       └─ Tabby  → POST /api/checkout (tabby) → Tabby session   → redirect to web_url

After payment (BOTH providers converge on one confirm path):
  Stripe: webhook checkout.session.completed ┐
  Tabby:  return redirect + webhook           ├─→ confirmPaidBooking()
                                              ┘     (compare-and-swap confirm → assign team
                                                     → dispatch → notifications, idempotent)
```

---

## 2. Tabby API (v2) — the parts we use

Base URL: `https://api.tabby.ai` (UAE). Auth: `Authorization: Bearer <SECRET_KEY>`.

| Step | Call | Notes |
|---|---|---|
| Create session | `POST /api/v2/checkout` | Body: `payment` (amount, currency, buyer, order, shipping), `lang`, `merchant_code`, `merchant_urls`. Response gives `payment.id`, eligibility, and `configuration.available_products.installments[].web_url`. |
| Verify | `GET /api/v2/payments/{id}` | **Always** verify server-to-server; never trust the redirect. Success = `AUTHORIZED`, cancel = `EXPIRED`, failure = `REJECTED`. |
| Capture | `POST /api/v2/payments/{id}/captures` | Auth-then-capture — **only captured money settles.** Capture the FULL amount. Success → `CLOSED`. Capturing a non-`AUTHORIZED` payment returns 400. |
| Webhook | registered via API | Fires on every status change regardless of redirect. Statuses are **lowercase** (`authorized`, `closed`, `rejected`, `expired`). |

**Critical format differences from Stripe**
- **Amount is a decimal string in major units** (`"366.45"`), not integer fils. We hold `price_total_fils`; Tabby amount = `(price_total_fils / 100).toFixed(2)`.
- Amount sent to Tabby is the **VAT-inclusive total** (`price_total_fils`), so the customer pays net + 5% VAT — same as Stripe.
- `order.reference_id` = our `booking.id` (our correlation key).
- Currency `"AED"`.
- Buyer needs `name`, `email`, `phone`. We have all three (phone already OTP-verified). Confirm the phone format Tabby expects in sandbox (their example uses local `500000001`; we can also try E.164 via `normalizeUaePhone`).

**Eligibility gating.** Tabby enforces per-merchant min/max order amounts and risk
scoring. The create-session response tells us: if not eligible it carries a
`rejection_reason` (e.g. `order_amount_too_high`) and no `web_url`. On that, the
checkout route returns a specific error so the client can fall back to card.

---

## 3. Data model change (one small migration)

`supabase/migrations/2026XXXX_tabby_payments.sql`:

```sql
ALTER TABLE bookings
  ADD COLUMN payment_provider text NOT NULL DEFAULT 'stripe',
  ADD COLUMN tabby_payment_id text;

-- optional: constrain to known providers
ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_provider_chk
  CHECK (payment_provider IN ('stripe','tabby'));
```

- `payment_provider` — which rail confirmed the booking (`'stripe'` default keeps every existing row correct).
- `tabby_payment_id` — Tabby's `payment.id`, stored at session-create time so the return handler and webhook can look the booking up. (Stripe keeps using the existing `payment_intent_id`.)

---

## 4. File plan

### New

| File | Responsibility |
|---|---|
| `src/lib/tabby.ts` | Tabby client: `tabbyConfigured()`, `createCheckoutSession(booking, buyer)`, `retrievePayment(id)`, `capturePayment(id, amount)`. Owns base URL, Bearer auth, amount formatting, error mapping. Mirrors the shape of `src/lib/twilio-whatsapp.ts`. |
| `src/lib/booking-confirmation.ts` | **Extracted** shared post-payment logic (see §5): `confirmPaidBooking({...})`. Called by both the Stripe webhook and the Tabby handlers. |
| `src/app/api/tabby/callback/route.ts` | `GET` — Tabby's `merchant_urls` land here. Reads `booking_id` + `payment_id`, retrieves payment, verifies `AUTHORIZED`, captures, calls `confirmPaidBooking`, then redirects to `/book/success`. Cancel/failure → mark booking + redirect to `/book?cancelled=1`. |
| `src/app/api/webhooks/tabby/route.ts` | `POST` — Tabby webhook. Verifies signature/secret, and on `authorized`/`closed` captures (if needed) + `confirmPaidBooking` (idempotent — safety net if the customer closes the tab before the redirect). |
| `src/lib/tabby.test.ts`, `src/__tests__/api/tabby-*.test.ts` | Unit tests (payload, amount formatting, ineligible path, verify+capture, webhook, idempotency). |
| `docs/TABBY_INTEGRATION.md` | This document. |

### Modified

| File | Change |
|---|---|
| `src/app/api/checkout/route.ts` | Accept `payment_method: 'card' \| 'tabby'` (default `card`). Card path unchanged. Tabby path: create the same pending booking, store `payment_provider='tabby'`, create the Tabby session, store `tabby_payment_id`, return `{ checkout_url: web_url }`. Ineligible → 4xx with a `fallback: 'card'` hint. The verification gate + financial snapshot are shared (run before the fork). |
| `src/app/api/webhooks/stripe/route.ts` | Replace the inline confirm/assign/dispatch block with a call to `confirmPaidBooking(...)`. No behaviour change — pure extraction. |
| `src/app/book/CheckoutStep.tsx` (+ `book/page.tsx`) | Add a payment-method selector (Card / **Tabby — 4 interest-free payments**), gated on `NEXT_PUBLIC_ENABLE_TABBY`. Pass the choice to `/api/checkout`. Tabby's badge/logo per their brand guidelines. |
| `.env.example` | Add the Tabby vars (§6). |

---

## 5. The shared confirm function (the core refactor)

Today `checkout.session.completed` inlines: compare-and-swap confirm → delete
lock → `assignTeamToBooking` → team-dispatch n8n → booking_confirmed n8n →
`fireOpsAlert('new_booking')`. Extract verbatim into:

```ts
// src/lib/booking-confirmation.ts
export async function confirmPaidBooking(input: {
  bookingId: string;
  slotStart: string;
  address: string;
  provider: 'stripe' | 'tabby';
  paymentRef: string;          // payment_intent_id | tabby_payment_id
  isTest: boolean;
  fallbackName?: string;       // provider metadata fallbacks for name/phone/email
  fallbackPhone?: string;
  fallbackEmail?: string;
}): Promise<{ confirmed: boolean; teamId?: string }>
```

- Keeps the **compare-and-swap** (`.in('status', ['pending','payment_failed'])`) — this is what makes it **idempotent and double-dispatch-safe**: Tabby's redirect and webhook both call it, but only the first transition to `confirmed` assigns a team + dispatches.
- Stripe webhook and Tabby handlers become thin adapters that gather the right fields and call it.

---

## 6. Environment variables

```bash
# ── Tabby (BNPL) ──────────────────────────────────────────────
# Backend (server-to-server). Sandbox first, then swap live.
TABBY_SECRET_KEY=sk_test_xxxxxxxx        # Bearer for /checkout, /payments
TABBY_MERCHANT_CODE=your_merchant_code   # per-store code from Tabby dashboard
TABBY_WEBHOOK_SECRET=whsec_xxxxxxxx      # verify inbound webhooks (confirm mechanism in sandbox)
# TABBY_PUBLIC_KEY=pk_test_xxx           # only if we later add the frontend pre-scoring widget

# Client flag — shows the Tabby option on the checkout step
NEXT_PUBLIC_ENABLE_TABBY=false           # flip true once keys are set + verified
```

Off by default → zero production impact until you set the keys and flag, exactly
like the phone-verification and ops-alert flags already in the app.

---

## 7. Idempotency, cancel & failure

- **Double-confirm:** redirect handler + webhook both call `confirmPaidBooking`; the compare-and-swap guarantees one dispatch.
- **Capture idempotency:** before capturing, retrieve status. `AUTHORIZED` → capture; already `CLOSED` → treat as captured, continue to confirm; `EXPIRED`/`REJECTED` → do not confirm.
- **Cancel** (`EXPIRED`): release the booking lock, mark booking `expired` (same as Stripe's `checkout.session.expired`), redirect to `/book?cancelled=1`.
- **Failure** (`REJECTED`): mark `payment_failed`, log to `error_log`, offer card fallback.
- **Paid-but-not-confirmed orphan:** if capture succeeds but `confirmPaidBooking` throws, log to `error_log` + `fireOpsAlert('payment_orphan')` — mirrors the Stripe missing-metadata guard.

---

## 8. Compliance / accounting (no code impact, but note)

- FTA tax invoice: unaffected — the financial snapshot (`price_net/vat/total_fils`) is written at booking creation regardless of provider, so Tabby-paid bookings invoice identically.
- Tabby charges the **merchant** a per-transaction fee; the customer pays in 4 with 0 interest. That's a P&L line, not a code concern, but worth pricing in.
- Refund parity (cancellations): the app auto-refunds Stripe on cancel. Tabby has its own refund endpoint — **out of scope for v1**, tracked as a follow-up so a Tabby-paid cancellation doesn't silently skip the refund.

---

## 9. Test plan

- **Unit (vitest):** amount formatting (`fils → "x.xx"`), session payload shape, Bearer auth, ineligible-response handling, verify+capture happy path, capture-already-closed path, webhook signature + idempotency, `confirmPaidBooking` compare-and-swap.
- **Sandbox e2e:** Tabby provides test buyer identities (approving/declining phone + OTP). Drive a real booking → Tabby sandbox → capture → confirm → team assigned → dispatch fired. Verify a second webhook does not re-dispatch.
- Keep coverage parity with the existing checkout/webhook suites.

---

## 10. Rollout

1. Migration applied (adds two nullable/defaulted columns — safe, no backfill).
2. Sandbox keys + `NEXT_PUBLIC_ENABLE_TABBY=false` in prod; verify on staging with the flag on there.
3. Register the Tabby **sandbox** webhook → `/api/webhooks/tabby`.
4. Full sandbox e2e green.
5. Swap **live** keys, register the live webhook, `NEXT_PUBLIC_ENABLE_TABBY=true`, one smallest-amount live booking, monitor `error_log` + ops alerts.

---

## 11. Open questions — RESOLVED against the sandbox (2026-07-16)

Validated with live calls using the `DuctlyAe` sandbox keys:

1. **Phone format** — ✅ E.164 with `+` (`+971500000001`). Our checkout sends the normalized E.164 (`+9715…`). No change.
2. **`buyer.dob`** — ✅ Not required; the session succeeds without it. We omit it.
3. **Min/max order amount** — the create-session response is the source of truth: an out-of-range/declined order returns no `web_url` + `rejection_reason` (`"not_available"`), which we already surface as the card fallback. No hard client-side gate needed.
4. **Webhook auth** — ✅ An optional auth header you set when registering the webhook; Tabby echoes it back and we compare. Our route checks the `Authorization` header against `TABBY_WEBHOOK_SECRET`. Register the sandbox webhook with that header value.
5. **Buyer/order history** — minimal payload is accepted by scoring; revisit only if approval rates are low.

**Live sandbox validation:** `createCheckoutSession` returns `payment.id` + `configuration.available_products.installments[0].web_url` (redirect target) for the success buyer, and `configuration.products.installments.rejection_reason` for the pre-scoring-reject buyer — exactly what our parser reads. `retrievePayment` returns `status`/`amount`/`currency`; capturing a non-`AUTHORIZED` payment returns 400 (our retrieve-first guard handles it). Sandbox test buyers: success `otp.success@tabby.ai` + `+971500000001` + OTP `8888`; reject `otp.rejected@tabby.ai`; pre-score reject `+971500000002`.

---

## 12. Estimate

Roughly: `tabby.ts` + confirm refactor (½ day) · checkout branch + callback + webhook (½ day) · UI selector (¼ day) · tests + sandbox e2e (½ day). ~2 focused days to sandbox-green, then the live swap is config-only.
