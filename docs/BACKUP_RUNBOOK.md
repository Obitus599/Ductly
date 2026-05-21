# Backup & Restore Runbook

When production data is lost, corrupted, or compromised — this doc
is the script. Follow it top to bottom; don't improvise under
pressure.

> **Project:** `xmukqwscunwjfnfhllcl` (Supabase) — see
> `~/.claude/projects/-home-alex599-Ductly/memory/project_supabase_cli.md`.

---

## What we rely on

| Layer | Mechanism | Retention | Granularity |
|---|---|---|---|
| Postgres (Supabase) | **Daily automatic backups** | 7 days (Free), 14 days (Pro+) | One snapshot per day |
| Postgres (Supabase) | **PITR** (Point-in-Time Recovery) | 7 days, only on **Pro plan and above** | Per-second |
| Storage / file uploads | None set up — we don't store user files | — | — |
| Source code | GitHub `main` + `alex-dev` branches | Forever | Per-commit |
| Env vars | Plesk UI + `~/Ductly/.env.local` locally | Manual | Manual |

**Current plan check:** confirm Supabase plan tier at
<https://supabase.com/dashboard/project/xmukqwscunwjfnfhllcl/settings/billing>.
PITR availability depends on plan.

---

## Scenario 1: Accidentally deleted rows in a table

Most common case — a buggy admin action wipes some bookings, or a
script runs `DELETE` without a `WHERE`.

### Detect

You'll usually find out because someone notices missing data. To
confirm what's gone:

```sql
-- In Supabase SQL Editor
SELECT count(*) FROM bookings WHERE created_at < now() - interval '1 day';
```

Compare to a recent stats dashboard snapshot. If the row count
dropped from the expected baseline, restore.

### Restore (PITR — Pro plan)

1. Go to <https://supabase.com/dashboard/project/xmukqwscunwjfnfhllcl/database/backups>
2. Click **Point in Time Recovery**
3. Choose a timestamp **5-10 minutes BEFORE the deletion** (the
   "oh no" moment). Err on the early side — you can always replay
   the few minutes of legitimate writes that came after.
4. Confirm. Supabase will provision a new project at that point in
   time. Schema and data will be restored.
5. **Important:** the new project gets a **different** ref. You'll
   need to update `NEXT_PUBLIC_SUPABASE_URL`, anon key, and
   service role key in Plesk env + `.env.local`. Then touch
   `tmp/restart.txt`.

### Restore (Daily backup — Free / Pro)

1. Same backups page
2. Click **Daily Backups** → pick the most recent backup BEFORE
   the deletion
3. **Restore** → confirm
4. Same env-var update as above

> Daily backups can lose up to 24h of data. PITR loses seconds. If
> we're on Free and the loss is critical, **subscribe to Pro
> immediately**, then restore via PITR — Supabase keeps the 7-day
> PITR window once Pro is active.

---

## Scenario 2: Bad migration broke schema

A migration ran on prod that drops a column, breaks an FK, or
otherwise corrupts data integrity.

### Quick path (preferred)

Roll forward with a fix migration. Restoring is usually overkill
unless data was actually lost.

```bash
# Write a corrective migration
supabase migration new fix_bad_migration
# Apply via dashboard SQL editor (CLI db push has crashed before)
```

### Nuclear path

If the bad migration deleted data and the corrective migration
can't reconstruct it: PITR to just before the bad migration ran.
Process is identical to Scenario 1.

---

## Scenario 3: Compromised database (RLS bypassed, mass exfiltration, ransomware)

This is the worst case. If you suspect credentials were leaked:

1. **Immediately** roll the `service_role` key:
   <https://supabase.com/dashboard/project/xmukqwscunwjfnfhllcl/settings/api>
   → Generate new service_role secret
2. Roll the `anon` key the same way (rotates all client tokens)
3. Update Plesk env vars + `~/Ductly/.env.local`
4. `touch tmp/restart.txt` to reload Passenger
5. Audit recent activity:
   ```sql
   SELECT * FROM error_log
   WHERE created_at > now() - interval '24 hours'
   ORDER BY created_at DESC;
   ```
6. PITR to before the suspected compromise window if data was
   altered/deleted
7. Re-apply RLS migrations from `supabase/migrations/` to confirm
   policies are intact
8. File a PDPL data breach notification with TDRA within 72 hours
   if customer PII was accessed — see PDPL Article 9.

---

## Scenario 4: Lost local development data

Wipe the local Supabase if you use it (`supabase db reset`). Not a
disaster — production is the source of truth.

---

## Test the runbook

**Every 3 months**, do a fire drill:

1. Create a test row in `bookings` with email
   `disaster-test@ductly.ae`
2. Note the timestamp
3. Delete it via SQL editor
4. Restore via Daily Backup (NOT PITR — preserves the prod project)
   into a fresh Supabase project
5. Verify the row exists in the restored project
6. Delete the restored project

If this fails, fix it before you actually need it.

---

## Things we have not yet done — known gaps

- **No offsite backup.** Supabase backups are stored by Supabase.
  If Supabase itself has a multi-region outage, we're stuck waiting
  for their recovery.
- **No backup of `error_log`** beyond Supabase's own backups.
  Acceptable for now — non-critical.
- **No automated alert** when row counts drop unexpectedly. Add a
  simple cron query as the catalog grows.
