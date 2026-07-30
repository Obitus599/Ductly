import { supabaseAdmin } from "@/utils/supabase/admin";

/**
 * Keys whose VALUES must never be persisted to error_log.
 *
 * The failure path below stores the whole webhook payload for debugging,
 * which quietly turned error_log into a secondary PII store — and, for the
 * verify-email flow, a store of PLAINTEXT one-time codes, undermining the
 * "codes are only ever kept hashed" guarantee in lib/verification.ts.
 * Matching is on the normalized key name, so `customer_phone`, `phone` and
 * `buyerPhone` are all caught.
 */
const REDACT_KEY_PATTERNS = [
  "code",
  "otp",
  "token",
  "secret",
  "password",
  "apikey",
  "authorization",
  "email",
  "phone",
  "whatsapp",
  "name",
  "address",
  "maps",
  "building",
  "flat",
  "floor",
  "directions",
];

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  return REDACT_KEY_PATTERNS.some((p) => k.includes(p));
}

/**
 * Deep-copy a payload with sensitive values replaced by "[redacted]".
 * Structure and key names survive (that's what makes a failure debuggable);
 * only the values go.
 */
export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redactPayload(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedact(k) ? "[redacted]" : redactPayload(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * True for a URL we're willing to POST customer data to.
 *
 * Plain http:// would put names, phone numbers and OTP codes on the wire in
 * clear text, so it's only tolerated for loopback during local development.
 */
export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol !== "http:") return false;
    return ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget POST to an n8n webhook, with failure logging to the
 * error_log table so we can see which notifications never went out.
 *
 * Returns immediately — does NOT block the caller. Internally it
 * awaits the response just long enough to check status, then writes a
 * row to error_log on any failure. The original 30s Stripe webhook
 * timeout is unaffected because Next.js will keep the function alive
 * after we've returned the response (edge runtime semantics).
 *
 * The stored payload is REDACTED — enough shape to debug or replay the
 * call, none of the customer's personal data.
 */
export function fireN8nWebhook(
  flowName: string,
  url: string,
  payload: Record<string, unknown>
): void {
  if (!isAllowedWebhookUrl(url)) {
    const message = `Refusing to send ${flowName} to a non-HTTPS webhook URL`;
    console.error(message);
    void supabaseAdmin
      .from("error_log")
      .insert({
        flow_name: `n8n_${flowName}`,
        error_message: message,
        payload: { url_scheme_rejected: true },
      } as never)
      .then(() => undefined, () => undefined);
    return;
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: payload }),
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`n8n returned ${res.status} ${body.slice(0, 200)}`);
      }
    })
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`n8n ${flowName} webhook failed:`, message);
      try {
        await supabaseAdmin.from("error_log").insert({
          flow_name: `n8n_${flowName}`,
          error_message: message,
          payload: redactPayload(payload) as Record<string, unknown>,
        } as never);
      } catch (logErr) {
        // Last resort — if even error_log fails, we have a bigger
        // problem (DB down). Don't throw, just stderr.
        console.error("error_log insert also failed:", logErr);
      }
    });
}
