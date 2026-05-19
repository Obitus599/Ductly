# WhatsApp Message Templates — DUCTly

These templates must be created and approved in **Twilio Content Builder**
(Meta reviews them through Twilio's BSP pipeline) **before** the n8n
workflows will send messages successfully.

> **Migration note (2026-05-19):** the workflows currently target the
> old 360dialog endpoint. After the Twilio Embedded Signup is
> complete and these templates land with Content SIDs, the n8n
> workflows will be updated to call Twilio's Content API instead.

After approval, each template gets a Content SID like `HXxxxxxxxx…` —
the n8n workflows reference these SIDs, not the template names.

---

## 1. `booking_confirmed`

**Used by:** `booking-confirmed.json`
**Recipient:** customer
**Language:** en

### Body Parameters (in order)

| # | Type | Description         | Example          |
|---|------|---------------------|------------------|
| 1 | text | Customer first name | "Ahmed"          |
| 2 | text | Appointment time    | "2026-04-21T10:00:00+04:00" |
| 3 | text | Address             | "Dubai Marina, Tower 5" |
| 4 | text | Total price         | "AED 3000"       |

### Suggested Body Text

> Hi {{1}}, your DUCTly duct-cleaning booking is confirmed for {{2}} at {{3}}. Total: {{4}}. We'll send a reminder 24 hours before your appointment.

---

## 2. `booking_reminder_24h`

**Used by:** `booking-reminders.json` (24h window)
**Language:** en

### Body Parameters (in order)

| # | Type | Description         | Example          |
|---|------|---------------------|------------------|
| 1 | text | Customer first name | "Ahmed"          |
| 2 | text | Appointment time    | "2026-04-21T10:00:00+04:00" |
| 3 | text | Address             | "Dubai Marina, Tower 5" |
| 4 | text | Team name           | "Team Alpha"     |

### Suggested Body Text

> Hi {{1}}, this is a reminder that your duct cleaning appointment is scheduled for {{2}} at {{3}}. Your team: {{4}}. Need to reschedule? Use the link in your confirmation email.

---

## 3. `booking_reminder_1h`

**Used by:** `booking-reminders.json` (1h window)
**Language:** en

### Body Parameters (in order)

| # | Type | Description         | Example          |
|---|------|---------------------|------------------|
| 1 | text | Customer first name | "Ahmed"          |
| 2 | text | Appointment time    | "2026-04-21T10:00:00+04:00" |
| 3 | text | Team name           | "Team Alpha"     |

### Suggested Body Text

> Hi {{1}}, your duct cleaning team ({{3}}) is arriving soon for your {{2}} appointment. Please ensure access to your property.

---

## 4. `feedback_request`

**Used by:** `feedback-request.json`
**Language:** en

### Body Parameters (in order)

| # | Type | Description         | Example          |
|---|------|---------------------|------------------|
| 1 | text | Customer first name | "Ahmed"          |
| 2 | text | Team name           | "Team Alpha"     |

### Suggested Body Text

> Hi {{1}}, thank you for choosing DUCTly! We hope {{2}} did a great job. We'd love your feedback — please rate your experience using the link in your email.

---

## 5. `no_show_followup`

**Used by:** `no-show-followup.json`
**Language:** en

### Body Parameters (in order)

| # | Type | Description         | Example          |
|---|------|---------------------|------------------|
| 1 | text | Customer first name | "Ahmed"          |
| 2 | text | Original slot time  | "2026-04-21T10:00:00+04:00" |

### Suggested Body Text

> Hi {{1}}, our team arrived for your scheduled duct cleaning at {{2}} but wasn't able to reach you. We'd love to reschedule — visit ductly.ae/book to pick a new time.

---

## 6. `team_dispatch`

**Used by:** `team-dispatch.json`
**Recipient:** **team WhatsApp number** (NOT customer)
**Language:** en
**Note:** sent to operations team, not customer — Meta approval may
require explicit "internal use / business operations" categorisation
when submitted in Twilio Content Builder.

### Body Parameters (in order)

| # | Type | Description                      | Example                       |
|---|------|----------------------------------|-------------------------------|
| 1 | text | Team name                        | "Team Alpha"                  |
| 2 | text | Appointment time                 | "2026-04-21T10:00:00+04:00"   |
| 3 | text | Customer name                    | "Ahmed"                       |
| 4 | text | Full address                     | "Dubai Marina, Tower 5"       |
| 5 | text | Building name (may be blank)     | "Marina Tower 3"              |
| 6 | text | Flat number (may be blank)       | "Apt 1204"                    |
| 7 | text | Additional directions or "None"  | "Enter from Gate 3"           |
| 8 | text | Plan tier                        | "Signature"                   |
| 9 | text | Customer phone                   | "+971501234567"               |

### Suggested Body Text

> New dispatch for {{1}}: {{2}}. Customer: {{3}} (phone: {{9}}). Location: {{4}}{{5 ? ', ' + {{5}} : ''}}{{6 ? ', Flat ' + {{6}} : ''}}. Directions: {{7}}. Plan: {{8}}.

(Twilio's WhatsApp template format doesn't support conditional
parameters — pass empty strings for fields that may be blank, and
ensure the wording reads correctly with empty values.)

---

## Approval Notes

- Templates typically take 24-48 hours for Meta review (via Twilio's BSP)
- Template names are **case-sensitive** and must match exactly. After
  creating a template in Twilio Content Builder, the corresponding
  Content SID (`HX...`) is what the n8n workflow references — not the
  human-readable name.
- All templates use language code `en`
- If a template is rejected, check Meta's commerce policy — avoid words like "free", "guaranteed", etc.
- Test with a sandbox number first before going live
- Once approved, capture the Content SIDs in prod `.env.local` as
  `TWILIO_CONTENT_SID_BOOKING_CONFIRMED`, `..._BOOKING_REMINDER_24H`,
  `..._BOOKING_REMINDER_1H`, `..._FEEDBACK_REQUEST`,
  `..._NO_SHOW_FOLLOWUP`, `..._TEAM_DISPATCH`. The n8n workflows read
  these from `$env`.
