import crypto from "crypto";

/**
 * Validate an inbound Twilio request's X-Twilio-Signature.
 *
 * Twilio signs: the full request URL, followed by each POST param's name
 * immediately concatenated with its value, sorted by param name — then
 * HMAC-SHA1 with the account Auth Token as the key, base64-encoded.
 * See https://www.twilio.com/docs/usage/security#validating-requests
 *
 * The URL must be the exact public URL Twilio posted to (scheme, host,
 * path, query) — configure the Twilio inbound webhook to match
 * TWILIO_WEBHOOK_URL / NEXT_PUBLIC_APP_URL + the route path.
 */
export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!authToken || !signature) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
