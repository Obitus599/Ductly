# Security remediation — July 2026

Fixes for the adversarial security audit. Every item was verified: code by
reading the path end to end, DB changes against a real Postgres 17, and the
whole suite (493 tests) plus typecheck, lint, and a production build.

## Action required before deploy (owner decisions)

Two of these are configuration, not code, and the app assumes them:

1. **Set `ADMIN_EMAILS`** (or set `app_metadata.role = "admin"` on the admin
   user in Supabase). The admin gate now demands an explicit admin marker.
   Without it, admin sign-in returns 403 and you are locked out of `/admin`.
2. **Turn off public sign-ups** in the Supabase dashboard (Auth → Providers →
   Email → "Allow new users to sign up"). Defence in depth for #1.

Also worth doing: **smoke-test the address picker and checkout** after deploy —
the CSP dropped `unsafe-eval` in production. And confirm the **Tabby refund
endpoint** (`POST /api/v2/payments/{id}/refunds`) matches your Tabby account;
the refund code targets the documented shape.

## Critical

**Any Supabase user was a full admin.** `admin-auth.ts` / `middleware.ts`
treated "the token authenticates" as "the caller is an admin". Now both call
`verifyAdminToken` (`lib/admin-identity.ts`), which parses the Supabase user
and requires `app_metadata.role === "admin"` or an `ADMIN_EMAILS` allowlist.
The login route rejects a valid-but-non-admin sign-in with 403 instead of
handing out a cookie. Verified: a valid token for a non-admin user now gets
401/403 (`admin-auth` unit + api tests, middleware test).

## High

**Rate-limit key poisoning disabled every throttle.** An unbounded identifier
became the `rate_limits` btree key; an oversized one errored the insert, and a
returned error opened a process-global fail-open breaker. Now the key is
length-capped (`safeRateLimitKey`), the identifier is capped at the entry, and
only a *thrown* connection error opens the breaker — a per-request data error
fails just that check. `verify/send` also caps the identifier at 254.

**`rate_limits` had no RLS; `booking_locks` had open anon write/delete.**
Migration `20260728000000`: `rate_limits` gets RLS + `REVOKE ALL` from anon,
and `check_rate_limit` loses anon EXECUTE. The three permissive `booking_locks`
anon policies are dropped (all writes use the service role), plus `CHECK`
bounds so no writer can mint an immortal hold (`expires_at ≤ locked_at + 15m`)
or one 180+ days out. The `teams` "anyone can view" policy (which leaked crew
WhatsApp numbers) is dropped and replaced by a column-scoped `public_teams`
view. Verified on Postgres 17: immortal/2-year holds rejected, normal 10-min
hold accepted, anon has zero grants.

**Tabby (BNPL) cancellations never refunded.** Both cancel routes refunded
only through Stripe, gated on `payment_intent_id`, which a Tabby booking never
has. New `lib/refund.ts` routes each booking to the right provider (new
`refundPayment` in `lib/tabby.ts`), and `refund_status` is never left at the
phantom `"pending"` — a failed provider refund is recorded `failed` and escalated
to `error_log` + an ops alert. Verified: Tabby booking refunds via the Tabby
client and never calls Stripe (`manage-cancel` test).

**`manage_token` was a permanent account-wide master key.** It is now rotated
on cancel (terminal state), and the two destructive PDPL endpoints
(`/me/delete`, `/me/export`) require a fresh email OTP when verification is
configured — which a leaked-token holder can't complete unless they actually
control the mailbox. Verified: unverified delete → 403 (`me-delete` test).

## High — regressions from the previous remediation pass

**PostgREST filter injection in the PDPL sweep** (`me/delete`). The `.or()`
string built from `customer.email` is replaced by three separate `.eq()` calls
(values are sent as data, never parsed as filter DSL), and the shared email
validator (`lib/email-validate.ts`, now used by checkout/contact/newsletter/
verify) rejects the injection punctuation at the root.

**Expired-slot double-settlement** (`booking-confirmation` + Tabby paths). A
late Tabby settle could confirm an expired booking whose slot was resold or had
passed. Now `confirmPaidBooking` checks `isSlotFulfillable` (future + free
capacity) before recovering an `expired` booking; if it fails it returns
`slot_unavailable`, and all three Tabby paths (callback, webhook, reconciler)
refund the captured payment instead of confirming. Verified: unfulfillable
expired booking is refused and escalated (`booking-confirmation` test).

## Medium

- **CSP**: `unsafe-eval` dropped in production (`next.config.mjs`).
  `unsafe-inline` for scripts remains — removing it needs per-request nonces, a
  tracked follow-up.
- **middleware dev bypass** aligned with `admin-auth` (`=== development/test`,
  not `!== production`), so staging / unset `NODE_ENV` no longer opens admin.
- **Admin logout** now revokes the session at GoTrue (`/auth/v1/logout`), not
  just clears the cookie.
- **`address_details`** capped (type + 4 KB) at checkout.
- **Privacy page** disclosure corrected: the dispatch AI receives the service
  address (not "anonymised metadata only"), and Tabby + Resend are now listed.
- **`schema.sql`** reconciled with its migrations so a fresh rebuild is locked
  down (no permissive `USING (true)` policies re-created).

## Not changed (accepted / needs a product decision)

- **`unsafe-inline` in the CSP** — needs nonce infrastructure.
- **Full-address to OpenRouter** — disclosed now; stopping it (send only an
  area/geohash) is a routing-quality tradeoff for you to call.
- **`/api/slots` uncached geocoding cost** — real, but a caching change rather
  than a security fix; worth doing next.
