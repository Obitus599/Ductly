/**
 * Twilio WhatsApp template sender.
 *
 * UAE SMS via Twilio is blocked (the sender isn't an SMS-capable number,
 * and UAE A2P SMS is heavily filtered), so OTP codes go over WhatsApp —
 * the channel that already works here. Sends a pre-approved Content
 * template by SID, same mechanism as the booking/dispatch flows.
 */
export interface WaResult {
  ok: boolean;
  status?: number;
  sid?: string;
  errorMessage?: string;
  errorCode?: number | null;
}

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

/** Normalize to `whatsapp:+<digits>` regardless of input prefix/format. */
function waAddress(n: string): string {
  const bare = n.replace(/^whatsapp:/i, "").replace(/[^0-9+]/g, "");
  return `whatsapp:${bare}`;
}

export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string>
): Promise<WaResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { ok: false, errorMessage: "Twilio not configured." };
  if (!contentSid) return { ok: false, errorMessage: "Content template SID missing." };

  const params = new URLSearchParams();
  params.set("From", waAddress(from));
  params.set("To", waAddress(to));
  params.set("ContentSid", contentSid);
  params.set("ContentVariables", JSON.stringify(variables));

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(10_000),
      }
    );
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorMessage: (json as { message?: string }).message ?? "Twilio rejected the send.",
        errorCode: (json as { code?: number }).code ?? null,
      };
    }
    return { ok: true, status: res.status, sid: (json as { sid?: string }).sid };
  } catch (err) {
    return { ok: false, errorMessage: err instanceof Error ? err.message : "WhatsApp send failed." };
  }
}

/**
 * Deliver a verification OTP over WhatsApp via the ductly_verify_code
 * authentication template (variable {{1}} = the code).
 */
export async function sendWhatsAppOtp(to: string, code: string): Promise<WaResult> {
  const contentSid = process.env.TWILIO_CONTENT_SID_DUCTLY_VERIFY;
  if (!contentSid) {
    return { ok: false, errorMessage: "Verification template (TWILIO_CONTENT_SID_DUCTLY_VERIFY) not configured." };
  }
  return sendWhatsAppTemplate(to, contentSid, { "1": code });
}
