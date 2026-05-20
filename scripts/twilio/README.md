# Twilio CLI Helpers

Direct Twilio REST API calls (curl + Basic auth) to drive the WhatsApp
integration without clicking through the Twilio Console UI.

## Setup (one-time per shell session)

```bash
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_AUTH_TOKEN='<paste-from-twilio-console>'
```

Get the Auth Token from <https://console.twilio.com> → Account dashboard.
**Never paste it into chat or commit it** — `.env.local` is gitignored
but these env vars are session-only and don't get persisted anywhere.

## Scripts

### `check-sender.sh`
Show Twilio's view of the WhatsApp sender, account, phone numbers, and
existing Content templates. Use this before/after support escalations
to verify state.

```bash
bash scripts/twilio/check-sender.sh
```

### `create-templates.sh`
Create all 6 Content templates from `templates/*.json` and submit each
for Meta/WhatsApp approval. Writes Content SIDs to
`content-sids.env` (gitignored). Run this the moment the sender is
Connected.

```bash
bash scripts/twilio/create-templates.sh
cat scripts/twilio/content-sids.env
```

### `send-test.sh`
Send a test `booking_confirmed` message to a number, after Content SIDs
are populated and templates are Approved.

```bash
export TWILIO_CONTENT_SID_BOOKING_CONFIRMED=HX...
bash scripts/twilio/send-test.sh +971501234567
```

## Template files

Six JSON payloads, one per template, in `templates/`. Each matches the
spec in `n8n/WHATSAPP_TEMPLATES.md`. Update wording here, NOT in the
docs file — keep this as the source of truth, docs as the human-readable
mirror.

## Why no Twilio CLI install?

`twilio-cli` requires Node + a global npm install + login flow. curl +
the REST API is simpler, scriptable, and doesn't need the CLI. We can
add `twilio-cli` later if we want interactive features (e.g., shell
completion, profile management).
