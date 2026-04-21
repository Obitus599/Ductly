# Phase 1 Plan

> Full copy at `docs/PHASE_1_PLAN.md`. Status: **COMPLETED**

## Steps

1. **Next.js & Environment Init** - App Router, Tailwind, Supabase clients, `.env.local`
2. **Core Database Schema** - 9 tables with timestamps, triggers, RLS
3. **TypeScript Types** - Generated from Supabase schema into `src/types/supabase.ts`
4. **Layer 1 API Skeleton** - [[API Routes#GET /api/slots|GET /api/slots]] with candidate generation + lock subtraction
5. **Webhook Pre-Wiring** - [[API Routes#POST /api/webhooks/stripe|Stripe webhook]] boilerplate with signature verification

## Definition of Done (all met)
- [x] DB tables exist in Supabase
- [x] Slot availability API returns correct data
- [x] Stripe webhook endpoint accepts POST requests

#docs #phase1
