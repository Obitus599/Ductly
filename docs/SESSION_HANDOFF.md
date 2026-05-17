# Ductly — Session Handoff (compressed)

Snapshot of project state, decisions, and outstanding work. Drop this
into any future Claude session or hand to a teammate to pick up exactly
where we left off.

**Last updated:** 2026-05-17
**Working session window:** 2026-05-12 → 2026-05-17
**Working directory:** `/home/alex599/Ductly/` (Linux btrfs)
**GitHub:** [Obitus599/Ductly](https://github.com/Obitus599/Ductly)
**Current branch:** `alex-dev` (off `main`, 4 commits ahead, not yet merged)

---

## TL;DR — where we are right now

1. **Code is fresh and clean** in `~/Ductly` (post-migration off broken OneDrive mount).
2. **CI/CD overhauled** on branch `alex-dev` — adds deploy, Claude code review, nightly health checks, branch-wide push triggers. **PR not opened yet** — needs GitHub secrets + branch protection setup first.
3. **WhatsApp integration is BLOCKED** — phone number stuck in zombie `ON_PREMISE` state. Twilio support ticket open, awaiting agent escalation.
4. **Feature pipelines triaged** into `docs/CURRENT_PIPELINE.md` (active) and `docs/FUTURE_PIPELINE.md` (deferred).
5. **Major compliance finding:** Stripe receipts are NOT UAE FTA-compliant. Need third-party invoicing tool (Wafeq/Zoho UAE/ClearTax/Daftra) before launch; Peppol e-invoicing mandatory by Jan 2027.

---

## Project quick reference

**Ductly** — duct-cleaning service booking platform for UAE. Customers
book online via Next.js app, pay via Stripe, get team dispatched via n8n
→ WhatsApp. Target launch: April 2026 (current product is on
`staging.ductly.ae`; `ductly.ae` shows a "Coming Soon" page).

### Stack
- Next.js 14 App Router, TypeScript, Tailwind v4
- Supabase (Postgres + RLS + Auth + Storage)
- Stripe (Checkout + Webhooks + Refunds)
- n8n at `n8n.ductly.ae` (6 workflows)
- WhatsApp via **Twilio BSP** (decision below)
- Google Maps (Geocoding + Distance Matrix + client Places)
- OpenRouter (LLM team-assignment + future chatbot)
- Hosting: Plesk on `136.144.243.31` (Node 20 via nvm, pm2 process named `ductly`)

### Key IDs
| Item | Value |
|---|---|
| Meta Phone Number ID | `1123875650808103` |
| Meta WABA ID (old, singular) | `988413290321795` "Ductly Technical Service" |
| Meta Business Manager ID | `970447749245035` |
| Meta WABA (new, plural) | "Ductly Technical Services" — created by Twilio Embedded Signup |
| Twilio Account SID | `AC***` (look up in Twilio Console → Account dashboard) |
| UAE phone number | `+971 54 161 0793` |

### Server
| Item | Value |
|---|---|
| Server IP | `136.144.243.31` |
| SSH user | `ductly` (key-based) |
| App directory | `/var/www/vhosts/ductly.ae/httpdocs` |
| Process | pm2 `ductly` |
| Live staging | `https://staging.ductly.ae` |
| Coming soon | `https://ductly.ae` |
| n8n | `https://n8n.ductly.ae` |

⚠️ **Security debt:** `docs/DEPLOYMENT.md` still has the Plesk admin
password committed to git history. Rotate after launch and scrub the
doc.

---

## Decisions made this session

### 1. Working directory migration
- **Was:** `/home/alex599/Backups/alexj@alex/C_Users_alexj/20260508-170656/OneDrive/Desktop/DUCTLY/` (OneDrive FUSE backup mount, broken — `.git/packed-refs` and many `.gitattributes` returned I/O errors)
- **Now:** `/home/alex599/Ductly/` (clean btrfs clone)
- VS Code workspace should be re-rooted at `~/Ductly` — old path is unusable for git

### 2. WhatsApp BSP: Twilio (not Meta direct, not 360dialog)
- Tried Meta direct first → blocked: `Register endpoint is not available for SMB businesses` (code 100). This is a **2026 Meta policy** — `/register` is now gated behind Tech Provider status.
- 360dialog was the original n8n workflow target (cheaper at scale) but charges €49/mo base — bad for low launch volume.
- **Picked Twilio** — ~$23/mo at 600 utility msgs, $0 base fee, native n8n node, transparent pricing, can switch to 360dialog later if volume justifies it (~3000 msg/mo crossover).
- **n8n workflows in `n8n/*.json` still target 360dialog** — need rewriting to Twilio API (`https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`, Basic auth). Mechanical find/replace. Pending until Twilio sender is live.

### 3. CI/CD overhaul (committed to `alex-dev`)
Added 3 GitHub Actions workflows:

**`ci.yml`** — extended to:
- Trigger on push to **any branch** (was: main only) for pre-PR feedback
- Trigger on PR → main (unchanged)
- Concurrency cancel on feature branches, NEVER on main (so deploys can't be interrupted)
- New `deploy` job — SSH into prod server, `git pull`, `npm ci`, `npx next build`, `pm2 restart ductly`. Only runs on push to main, only after lint/test/e2e/build pass.

**`claude-review.yml`** (new) — Claude reviews every PR to main:
- Runs typecheck + tests, feeds logs to Claude
- Ductly-specific review prompt: security, correctness, type safety, error handling, accessibility, test coverage
- Posts inline comments + verdict (APPROVE / REQUEST CHANGES / COMMENT)
- ~$0.30–1.50 per PR review (Claude Opus 4.7)

**`health-check.yml`** (new) — nightly at 02:00 UTC (06:00 Dubai):
- Code health: lint, typecheck, vitest coverage, build
- E2E health: Playwright on a fresh build
- Staging uptime: HTTP probes on `staging.ductly.ae/api/health` and `/`
- On failure: opens (or comments on) a GitHub issue labeled `health-check`

### 4. Pipeline split
- **`docs/CURRENT_PIPELINE.md`** — pre-launch blockers + first 30 days
- **`docs/FUTURE_PIPELINE.md`** — Phase 2 deferred + explicit out-of-scope list
- Triaged from full feature gap analysis on 2026-05-17

### 5. New branch + co-worker branch
- `alex-dev` — Mattia's working branch
- `Ductly_fixes_fork` — co-worker's branch (already on `origin`)
- CI triggers cover both because `pull_request: branches: [main]` matches by PR target, not source

### 6. Teammate already shipped the browser console fixes
Commit `a81120a` on main fixed (without our session involvement):
- Geist font moved to `next/font` (was loading from broken jsDelivr CDN with MIME mismatch)
- Google Maps key split into `GOOGLE_MAPS_SERVER_KEY` vs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client/server separation)
- AddressPicker now catches `ApiTargetBlockedMapError` with friendly fallback
- CSP headers updated (worker-src, removed jsDelivr, added maps.gstatic.com)

Pulled into local on 2026-05-15.

---

## 🚧 Active blockers

### A. Twilio WhatsApp sender migration — awaiting support agent
**Status:** Support ticket open. Auto-response provided initial guidance, but the phone number is stuck and requires admin-level escalation.

**The zombie state:**
```json
{
  "verified_name": "Ductly Technical Service",
  "code_verification_status": "NOT_VERIFIED",
  "platform_type": "ON_PREMISE",
  "quality_rating": "UNKNOWN",
  "id": "1123875650808103"
}
```
- `platform_type: ON_PREMISE` (sunset platform!) but never actually activated for messaging
- `/register` blocked by Meta SMB policy
- Graph API `DELETE /1123875650808103` returns `Unsupported delete request`
- WhatsApp Manager UI doesn't expose a delete option for ON_PREMISE numbers
- Twilio Embedded Signup successfully created a new WABA ("Ductly Technical Services" — plural) but Meta refuses to migrate the phone number because of the zombie ON_PREMISE state

**Reply already drafted in ticket** asking Twilio to either force-disconnect from old WABA or migrate via BSP admin path. Expected response: 12–24h.

**What to do when reply arrives:**
1. Follow agent's instructions (likely a one-click Embedded Signup re-run)
2. Verify number flips Pending → Connected in WhatsApp Senders list
3. Re-submit the 5 message templates via Twilio UI (Meta reviews, 24h)
4. Rewrite `n8n/*.json` workflows: swap 360dialog endpoint → Twilio + Basic auth
5. Update n8n credentials with Twilio Account SID + Auth Token
6. End-to-end test: book → confirm WhatsApp message arrives on +971 test number

### B. Compliance gap — UAE FTA tax invoices
Confirmed (research, 2026-05-17): **Stripe Checkout receipts are NOT valid UAE FTA tax invoices.**

| Tool | Status |
|---|---|
| Stripe Checkout receipt | ❌ Payment receipt only — not a tax invoice |
| Stripe Invoicing | ⚠️ Partially compliant; missing "Tax Invoice" wording, supply date, AED FX conformity |
| Stripe Tax | ✅ Calculates UAE 5% VAT correctly — but doesn't fix the invoice problem |

**Future requirement (looming):**
- 1 Jul 2026 — UAE pilots Peppol PINT-AE XML e-invoicing
- 1 Jan 2027 — Mandatory for in-scope businesses
- PDFs alone won't satisfy compliance post-2027

**Recommended tools (preparing Peppol ASP integration):**
- [Wafeq](https://wafeq.com/) — UAE-native, Stripe webhook integration
- [Zoho Books UAE](https://www.zoho.com/ae/books/) — broader suite
- [ClearTax AE](https://cleartax.com/sa/en) — compliance-focused
- [Daftra](https://daftra.com/) — simpler, cheaper

**Open decision:** which one to use? Pick before launch.

---

## 🔴 What Mattia still needs to do manually

### Before merging `alex-dev` → main
1. **Add GitHub secrets** at `Settings → Secrets → Actions`:
   - `ANTHROPIC_API_KEY` (from console.anthropic.com)
   - `SSH_HOST` (`136.144.243.31`)
   - `SSH_USER` (`ductly`)
   - `SSH_PRIVATE_KEY` (full private key including BEGIN/END lines)
   - Optional `SSH_PORT` if not 22
2. **Set branch protection** on `main` at `Settings → Branches`:
   - Require PR + 1 approval
   - Require status checks: `Lint & Type-check`, `Unit & Integration Tests`, `E2E Tests (Playwright)`, `Production Build`, `Claude Code Review`
   - Require up-to-date with main
3. **Open PR** from `alex-dev` → `main` to ship the CI changes

### Other manual items
4. **Switch VS Code workspace** to `~/Ductly` (close OneDrive folder, open new one)
5. **Rotate Plesk admin password** + scrub from `docs/DEPLOYMENT.md`
6. **Pick invoicing tool** (Wafeq vs Zoho UAE vs ClearTax vs Daftra)
7. **Start Meta Business Verification** at Security Centre (1–3 weeks, slowest pole item)
8. **Reply to Twilio support ticket** with progress update — they're standing by

---

## Open scoping questions

1. **Service area at launch** — Dubai only? Dubai + Sharjah + Abu Dhabi? All 7 emirates? Affects service-area validation logic on book page.
2. **VAT display** — inclusive ("AED 350 all-in") or exclusive ("AED 333 + AED 17 VAT")? Better UX vs better B2B receipts.
3. **Invoicing tool** — Wafeq / Zoho UAE / ClearTax / Daftra?
4. **Multi-admin scoping** — 2FA + admin session timeouts + audit log + multi-admin roles are interlinked. One feature or staggered?

---

## Pointers to live docs

- [docs/CURRENT_PIPELINE.md](CURRENT_PIPELINE.md) — active backlog
- [docs/FUTURE_PIPELINE.md](FUTURE_PIPELINE.md) — Phase 2 + explicit out-of-scope
- [docs/DEPLOYMENT.md](DEPLOYMENT.md) — server / deploy reference (has leaked password — rotate)
- [docs/MASTER_REFERENCE.md](MASTER_REFERENCE.md) — architecture
- [docs/PHASE_1_PLAN.md](PHASE_1_PLAN.md) — foundational roadmap
- [n8n/WHATSAPP_TEMPLATES.md](../n8n/WHATSAPP_TEMPLATES.md) — 5 message templates spec
- [.github/workflows/](../.github/workflows/) — ci.yml, claude-review.yml, health-check.yml

---

## How to resume in a new Claude session

Open `~/Ductly` in your editor, then paste into Claude:

> Read `docs/SESSION_HANDOFF.md` and `MEMORY.md` in the harness memory dir.
> We're picking up from where we left off — Ductly UAE launch prep.
> The current blocker is [whichever is current].

Claude has memory files at `~/.claude/projects/.../memory/` covering:
- `user_profile.md` — Mattia's role + preferences
- `project_whatsapp_ids.md` — all Meta/Twilio IDs
- `project_bsp_decision.md` — why Twilio over Meta-direct or 360dialog
- `project_pipelines.md` — pointer to CURRENT/FUTURE pipeline split
- `project_working_directory.md` — why we work from `~/Ductly`, not OneDrive
