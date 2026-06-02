#!/usr/bin/env bash
# Send a test WhatsApp message using the booking_confirmed template
# once the sender is Connected and the template is Approved.
#
# Requires:
#   export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   export TWILIO_AUTH_TOKEN=<your-auth-token>
#   export TWILIO_CONTENT_SID_BOOKING_CONFIRMED=HX...
#
# Usage:  bash scripts/twilio/send-test.sh +971501234567

set -euo pipefail

: "${TWILIO_ACCOUNT_SID:?Set TWILIO_ACCOUNT_SID in your shell}"
: "${TWILIO_AUTH_TOKEN:?Set TWILIO_AUTH_TOKEN in your shell}"
: "${TWILIO_CONTENT_SID_BOOKING_CONFIRMED:?Set TWILIO_CONTENT_SID_BOOKING_CONFIRMED after templates are created}"

TO="${1:?Usage: send-test.sh +971501234567}"
FROM="${TWILIO_WHATSAPP_FROM:-whatsapp:+15559870195}"
AUTH="${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"

VARIABLES='{"1":"Mattia","2":"2026-05-20T15:00:00+04:00","3":"Test Address, Dubai","4":"AED 1"}'

curl -sS -u "$AUTH" \
  -X POST "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json" \
  --data-urlencode "To=whatsapp:${TO}" \
  --data-urlencode "From=${FROM}" \
  --data-urlencode "ContentSid=${TWILIO_CONTENT_SID_BOOKING_CONFIRMED}" \
  --data-urlencode "ContentVariables=${VARIABLES}" \
  | python3 -m json.tool
