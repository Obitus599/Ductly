# Architecture Overview

Ductly uses a **serverless-first, event-driven architecture**.

## System Layers

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 App Router | [[Frontend Pages\|Booking UI]], admin dashboard |
| **API** | Next.js API Routes | [[API Routes\|Slot availability, checkout, webhooks]] |
| **Database** | Supabase PostgreSQL | [[Database Schema\|Bookings, teams, slots, locks]] |
| **Auth** | Supabase Auth + RLS | Customer/admin sessions (not yet implemented) |
| **Automation** | n8n Cloud | 8 flows: WhatsApp/email notifications |
| **Hosting** | Vercel Pro | Next.js deployment, Edge CDN |
| **AI** | OpenRouter | GPT-4o for [[scheduling-agent\|team assignment]], Claude Haiku for chatbot |
| **Comms** | 360dialog + Resend | WhatsApp Business API, transactional email |
| **Geo** | Google Maps Distance Matrix | [[travel-math\|Travel time calculation]] with caching |

## Key Architectural Decisions

- **Supabase over Firebase** - PostgreSQL for complex scheduling queries + RLS
- **n8n over custom webhooks** - reduces communication codebase
- **OpenRouter for AI** - single endpoint, no vendor lock-in, automatic failover
- **360dialog over Twilio** - $0.045/conversation vs $0.07 (36% savings)
- **Two-tier slot locking** - [[booking-locks\|booking_locks]] (pre-payment, temp) + [[slot-locks\|slot_locks]] (post-payment, permanent)
- **Multi-team from day 1** - all tables include team_id

## Two-Layer Scheduling

```
Layer 1 (sync, <200ms)         Layer 2 (async, post-payment)
─────────────────────          ──────────────────────────────
Customer selects date    →     Stripe webhook fires
GET /api/slots           →     GPT-4o agent assigns team
Shows available slots    →     Creates permanent slot_lock
Does NOT assign teams    →     30s timeout → fallback to least-booked
```

## Booking Flow

```
Customer → /book → select date → GET /api/slots
  → select slot → POST /api/booking-locks (10-min TTL)
  → fill form → POST /api/checkout
  → Stripe Checkout → pay
  → Webhook → confirm booking → Layer 2 agent → assign team
  → /book/success
```

See [[Build Context]] for full flow details.

#docs #architecture
