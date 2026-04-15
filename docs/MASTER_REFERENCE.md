**DUCTLY**

**Master Reference Document**

Developer Action Plan | Architecture | Cost Forecast

Version 1.0 | March 2026 | Confidential

**Target Launch: April 15, 2026**

# **1\. Executive Summary**

Ductly is a duct-cleaning automation platform built for small-to-medium field service operators. It replaces manual scheduling, quote-and-dispatch workflows, and customer communications with a fully automated, AI-assisted stack. The platform is designed for rapid deployment - targeting a live MVP by April 15, 2026 - with a multi-team architecture that scales from a single crew to four or more teams without code changes.

| **Attribute**                                  | **Detail**                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| **Product**                                    | Ductly - Duct Cleaning Automation Platform                                      |
| **Version**                                    | MVP v1.0                                                                        |
| **Target Launch**                              | April 15, 2026 (33 days from March 13, 2026)                                    |
| **Developer Team**                             | 2-3 developers                                                                  |
| **Core Stack**                                 | Next.js 14, Supabase, Vercel, Tailwind CSS, n8n Cloud                           |
| **AI Providers**                               | Claude Haiku (OpenRouter) for chatbot, GPT-4o (OpenRouter) for scheduling agent |
| **WhatsApp**                                   | 360dialog BSP - \$0.045/conversation (optimized)                                |
| **Payments**                                   | Stripe Checkout Sessions (cost of sale - excluded from infra model)             |
| **Infra Cost (1 team, mid, excl. Terraflow)**  | ~\$77/month (\$65 fixed + \$11 WA + \$1 AI)                                     |
| **Infra Cost (4 teams, mid, excl. Terraflow)** | ~\$112/month (\$65 fixed + \$43 WA + \$4 AI)                                    |
| **Cost as % of Revenue**                       | ~2-4% at steady state (excellent ratio)                                         |

# **2\. System Architecture**

## **2.1 Architecture Overview**

Ductly uses a serverless-first, event-driven architecture. All customer-facing interactions flow through Next.js API Routes deployed on Vercel. Supabase handles persistent state (PostgreSQL), real-time events, and authentication. n8n Cloud orchestrates all asynchronous workflows.

**LAYER OVERVIEW**

| **Layer**          | **Technology**                 | **Purpose**                                                                        |
| ------------------ | ------------------------------ | ---------------------------------------------------------------------------------- |
| **Frontend**       | Next.js 14 App Router          | Booking UI, admin dashboard, chatbot widget, real-time slot display                |
| **API**            | Next.js API Routes (Edge/Node) | Slot availability, booking creation, Stripe webhooks, chatbot proxy                |
| **Database**       | Supabase PostgreSQL            | Bookings, teams, slots, slot_locks, travel_cache, analytics views                  |
| **Auth**           | Supabase Auth + RLS            | Customer sessions, admin role enforcement, team-scoped data access                 |
| **Realtime**       | Supabase Realtime              | Live slot updates pushed to booking UI - no polling needed                         |
| **Automation**     | n8n Cloud                      | 8 flows: WhatsApp notifications, follow-ups, team dispatch, feedback               |
| **Hosting**        | Vercel Pro                     | Next.js deployment, Edge Network CDN, preview environments                         |
| **AI Routing**     | OpenRouter                     | Unified API gateway with fallback. Routes chatbot to Claude Haiku, agent to GPT-4o |
| **Communications** | 360dialog + Resend             | WhatsApp Business API (360dialog BSP). Transactional email (Resend)                |
| **Geolocation**    | Google Maps Distance Matrix    | Travel time calculation for team dispatch. Cached in travel_cache table (24h TTL)  |

## **2.2 Key Architectural Decisions**

- Supabase over Firebase: PostgreSQL gives us complex queries for scheduling, analytics, and RLS policies.
- n8n over custom webhooks: Dramatically reduces the communication codebase.
- OpenRouter for AI: Single endpoint for all AI calls - no vendor lock-in, automatic failover.
- 360dialog over Twilio: Lower per-conversation cost ($0.045 vs $0.07). Saves ~36%.
- Two-tier slot locking: booking_locks (pre-payment, UNIQUE on slot_start) prevents double-checkout. slot_locks (post-payment, UNIQUE on team_id + slot_start) prevents double team assignment.
- Multi-team from day 1: All tables include team_id.

# **4\. Agentic Scheduling Design**

## **4.2 Two-Layer Architecture**

**LAYER 1 - DETERMINISTIC SLOT FILTER (customer-facing, synchronous)**
- Trigger: Customer visits /book and selects a date
- Logic: Query available_slots view. Return only slots where at least one team is available.
- Latency: <200ms
- Team Assignment: NOT done here.

**LAYER 2 - AGENTIC TEAM ASSIGNMENT (post-payment, asynchronous)**
- Trigger: Stripe payment webhook confirms successful payment
- Model: GPT-4o via OpenRouter with tool use
- Timeout: 30 seconds. Falls back to deterministic least-booked-team rule.
- Agent Tools: get_team_schedules, calculate_travel_matrix, get_team_workloads, assign_booking

## **4.5 Configurable Parameters**

| **Parameter**                  | **Default Value** |
| ------------------------------ | ----------------- |
| **JOB_DURATION_MINS**          | 90                |
| **MINIMUM_TRAVEL_BUFFER_MINS** | 20                |
| **SLOT_LOCK_TTL_MINS**         | 10                |

# **6\. Database Schema**

## **6.2 Core Tables**

| **Table**          | **Key Columns**                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **teams**          | id, name, whatsapp_number, active, created_at                                                  |
| **bookings**       | id, team_id, customer_id, slot_start, slot_end, address, status, payment_intent_id, created_at |
| **customers**      | id, name, phone, email, whatsapp_opt_in, last_booking, created_at                              |
| **booking_locks**  | id, slot_start, session_id, locked_at, expires_at                                              |
| **slot_locks**     | id, team_id, slot_start, booking_id, created_at                                                |
| **team_schedules** | id, team_id, day_of_week, start_time, end_time, active                                         |
| **travel_cache**   | id, origin_geohash, dest_geohash, time_bucket, duration_mins, fetched_at, expires_at           |
| **feedback**       | id, booking_id, customer_id, rating (1-5), comment, created_at                                 |
| **error_log**      | id, flow_name, error_message, payload, created_at                                              |

## **6.3 Key SQL Views**

- **available_slots**: Joins team_schedules with slot_locks
- **team_workloads**: Aggregates booking counts per team per week/month
- **revenue_by_team**: Groups confirmed bookings by team_id and month
- **customer_lifetime_value**: Sum of job values per customer_id
- **feedback_summary**: Average rating per team, per month

# **11.2 Ductly Customer Pricing Logic**

**VILLA PRICING**: Base 1,500 AED + 800 AED per bedroom
**APARTMENT PRICING**: Studio 750 AED flat | 850 AED per bedroom (1+)
**PENDING**: Thermostat count pricing (rate TBD)
