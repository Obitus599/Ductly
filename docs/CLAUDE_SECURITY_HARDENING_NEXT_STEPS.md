# Claude — Security Hardening: Applied vs. Pending

## What's Already Applied (in this commit)

### DB Migrations Applied to Supabase
- `20260727_concurrency_and_retention_hardening.sql` — btree_gist extension, booking_locks advisory lock trigger, slot_locks exclusion constraint, atomic verification attempts, cleanup functions
- `20260728_rls_and_lock_hardening.sql` — RLS on rate_limits, revoke anon access to rate_limits + check_rate_limit RPC, drop anon policies on booking_locks, TTL constraints, drop anon teams SELECT policy, public_teams view

### Code Fix Applied
- `src/app/actions.ts` — switched from `supabase.from("teams").select("*")` to `supabase.from("public_teams").select("id, name, active")` to survive the teams RLS policy drop

## What's Still on the `security-hardening` Branch (NOT applied yet)

The full branch has 74 files (+4,940/-557) across 5 commits:

| Commit | Scope | Approx Files | What It Does |
|---|---|---|---|
| 8bb8fe4 | Admin authz | 8 | Explicit admin role/allowlist — requires ADMIN_EMAILS env var |
| 316bc83 | DB hardening | 9 | The migrations above + any code changes to use new functions |
| 1abd7e7 | Refunds | 6 | Tabby/Stripe cancellations refund for real (idempotent) |
| f4428c2 | PDPL,Slots,OTP | 20 | Filter injection fixes, OTP gate, expired-slot double-settle |
| afd85f6 | CSP,Privacy,Docs | 31 | CSP hardening, privacy, docs cleanup |

### Key Pending Items To Review

1. **Admin authz** — `ADMIN_EMAILS` env var or `app_metadata.role="admin"` needed or `/admin` 403s
2. **Refunds** — Stripe/Tabby cancellations now call their refund APIs. Verify idempotency.
3. **CSP** — Content Security Policy hardening. Check no inline scripts break.
4. **Booking lock TTL alignment** — Code may need to ensure locks don't exceed new 15-min CHECK constraint
5. **public_teams vs teams** — Any other anon queries to `teams` table beyond `actions.ts`?

## Manual Migration Instructions

The database migrations could NOT be applied automatically (network blocks direct DB connection). Run them manually:

1. Go to https://supabase.com/dashboard/project/xmukqwscunwjfnfhllcl/sql/new
2. Paste the contents of `supabase/migrations/20260727000000_concurrency_and_retention_hardening.sql` and click Run
3. Paste the contents of `supabase/migrations/20260728000000_rls_and_lock_hardening.sql` and click Run
4. Verify: `SELECT tablename FROM pg_tables WHERE tablename = 'public_teams';` should return 1 row

## Pre-Merge Checklist

Before merging the remaining security-hardening branch into main:

1. [ ] Apply BOTH migrations to prod Supabase FIRST
2. [ ] Set `ADMIN_EMAILS` env var on staging + prod (or set `app_metadata.role="admin"` on user)
3. [ ] Confirm public signups OFF in Supabase Auth settings
4. [ ] Run `npm test` on the branch — should be 493 tests pass
5. [ ] Smoke-test admin access, slot booking, cancellation refunds on staging
6. [ ] Verify no queries to `teams` table from anon client remain
