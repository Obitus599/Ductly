# Remaining Work

What's left before April 15, 2026 launch.

## n8n Automation Flows (8 flows) - CRITICAL

1. Booking confirmation (WhatsApp via 360dialog)
2. Booking confirmation (Email via Resend)
3. Team dispatch notification (WhatsApp)
4. 24-hour reminder (WhatsApp)
5. 1-hour reminder (WhatsApp)
6. Post-job feedback request
7. No-show follow-up
8. Payment failure notification

n8n is hosted on **n8n Cloud** (not self-hosted).

## Authentication & Security

- Supabase Auth integration (customer + admin login)
- Tighten RLS policies (currently permissive for dev)
- Admin role enforcement beyond API key

## Deployment

- Vercel deployment
- Update Stripe webhook URL to real domain
- Update `NEXT_PUBLIC_APP_URL` in production env
- Set `ADMIN_API_KEY` in production

## API Keys Needed

- OpenRouter API key (for AI scheduling agent)

## Nice-to-Haves (Post-Launch)

- Wire [[Core Libraries#travel-math.ts|travel-math]] into slot filter (replace flat 20-min buffer)
- Thermostat count pricing (rate TBD)
- Supabase Realtime for live slot updates
- Customer chatbot (Claude Haiku)

#docs #status
