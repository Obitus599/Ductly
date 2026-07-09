/**
 * UAE mobile phone normalization.
 *
 * Ductly serves the UAE only, and WhatsApp OTP delivery via Twilio needs a
 * strict E.164 number (+9715XXXXXXXX). Customers naturally type either the
 * local form (050 308 9244) or the international form (+971 50 308 9244) —
 * both must resolve to the SAME canonical E.164 value so that the OTP send,
 * the OTP check, and the checkout verification gate all key off an identical
 * identifier. Without this, a local-format number reaches Twilio unprefixed
 * and is rejected as a non-E.164 address (the booking-page "could not send
 * the code" failure).
 */

// National significant number for a UAE mobile: a leading 5 then 8 digits
// (covers the 050/052/054/055/056/058 prefixes). Landlines are intentionally
// excluded — the field is a mobile used for WhatsApp.
const UAE_MOBILE_NSN = /^5[0-9]{8}$/;

/**
 * Convert any common UAE-input format to E.164 (+9715XXXXXXXX), or return
 * null when it isn't a recognizable UAE mobile number.
 *
 * Accepts: 0503089244, 503089244, 971503089244, 00971503089244,
 * +971503089244, +971 50 308 9244, 050-308-9244, and similar — any spacing,
 * dashes, parens, or a leading + are ignored.
 */
export function normalizeUaePhone(raw: string): string | null {
  if (!raw) return null;

  // Drop everything that isn't a digit (a leading + included) so we work
  // purely from the digit sequence.
  let digits = raw.replace(/\D/g, "");

  // Peel the international access code and/or country code down to the NSN.
  if (digits.startsWith("00")) digits = digits.slice(2); // 00971… → 971…
  if (digits.startsWith("971")) digits = digits.slice(3); // 971…   → NSN or 0·NSN
  if (digits.startsWith("0")) digits = digits.slice(1); //  0·NSN  → NSN

  if (!UAE_MOBILE_NSN.test(digits)) return null;
  return `+971${digits}`;
}

/** True when `raw` is a valid UAE mobile number in any accepted format. */
export function isUaeMobile(raw: string): boolean {
  return normalizeUaePhone(raw) !== null;
}

/**
 * Pretty, grouped display form: "+971 50 308 9244". Falls back to the
 * trimmed input when it isn't a valid UAE mobile, so we never blank out
 * whatever the customer has typed so far.
 */
export function formatUaePhone(raw: string): string {
  const e164 = normalizeUaePhone(raw);
  if (!e164) return raw.trim();
  const nsn = e164.slice(4); // 9 digits after "+971"
  return `+971 ${nsn.slice(0, 2)} ${nsn.slice(2, 5)} ${nsn.slice(5)}`;
}
