# Master Reference

> Full copy at `docs/MASTER_REFERENCE.md`

This is the original architecture document covering:
- [[Architecture Overview|System architecture]] and layer overview
- [[Database Schema|Database tables, views, triggers]]
- Two-layer scheduling design (Layer 1 deterministic, Layer 2 agentic)
- Pricing logic (Villa/Apartment formulas)
- n8n automation flows (8 planned)
- Cost forecasting ($77-112/month at steady state)
- WhatsApp template specifications

## Pricing Rules

| Type | Formula |
|------|---------|
| Villa | 1,500 AED base + 800 AED/bedroom |
| Apartment (Studio) | 750 AED flat |
| Apartment (1+ BR) | 850 AED/bedroom |

## Scheduling Constants

| Parameter | Value |
|-----------|-------|
| JOB_DURATION_MINS | 90 |
| MINIMUM_TRAVEL_BUFFER_MINS | 20 |
| SLOT_LOCK_TTL_MINS | 10 |
| SLOT_INCREMENT_MINS | 30 |
| Working hours | 08:00-18:00 |
| Work week | Sun-Thu (days 0-4) |

#docs
