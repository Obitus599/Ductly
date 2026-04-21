# WhatsApp Message Templates — DUCTly

These templates must be created and approved in your 360dialog / Meta Business Suite
**before** the n8n workflows will send messages successfully.

360dialog returns HTTP 200 even on failure — check the response body for errors.

---

## 1. `booking_reminder_24h`

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

## 2. `booking_reminder_1h`

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

## 3. `feedback_request`

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

## 4. `no_show_followup`

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

## Approval Notes

- Templates typically take 24-48 hours for Meta review
- Template names are **case-sensitive** and must match exactly
- All templates use language code `en`
- If a template is rejected, check Meta's commerce policy — avoid words like "free", "guaranteed", etc.
- Test with a sandbox number first before going live
