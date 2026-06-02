#!/usr/bin/env bash
# Query Twilio's view of the WhatsApp sender for +15559870195.
# Useful for the support reply to Twilio ("your API reports state X").
#
# Requires:
#   export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   export TWILIO_AUTH_TOKEN=<your-auth-token>
#
# Usage:  bash scripts/twilio/check-sender.sh

set -euo pipefail

: "${TWILIO_ACCOUNT_SID:?Set TWILIO_ACCOUNT_SID in your shell}"
: "${TWILIO_AUTH_TOKEN:?Set TWILIO_AUTH_TOKEN in your shell}"

AUTH="${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"

echo "── Account status ──"
curl -sS -u "$AUTH" \
  "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json" \
  | python3 -m json.tool

echo
echo "── WhatsApp Senders (v1) ──"
curl -sS -u "$AUTH" \
  "https://messaging.twilio.com/v2/Channels/Senders?Filter=whatsapp" \
  | python3 -m json.tool || true

echo
echo "── Approved Senders Channel (legacy) ──"
curl -sS -u "$AUTH" \
  "https://messaging.twilio.com/v1/Services" \
  | python3 -m json.tool || true

echo
echo "── Phone Numbers on the account ──"
curl -sS -u "$AUTH" \
  "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json" \
  | python3 -m json.tool

echo
echo "── Existing Content Templates ──"
curl -sS -u "$AUTH" \
  "https://content.twilio.com/v1/Content?PageSize=50" \
  | python3 -m json.tool
