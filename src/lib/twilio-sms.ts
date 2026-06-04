/**
 * Minimal Twilio SMS sender.
 *
 * SMS (not WhatsApp) on purpose: it needs no template approval and
 * works the moment Twilio creds are set, regardless of the WhatsApp
 * Business sender state — the same rationale as the team test-ping.
 *
 * Reuses the existing TWILIO_* env vars. TWILIO_WHATSAPP_FROM may carry
 * a "whatsapp:" prefix for WhatsApp sends; we strip it here so the same
 * number works as the SMS From. A dedicated TWILIO_SMS_FROM overrides
 * it when set.
 */
export interface SmsResult {
  ok: boolean;
  status?: number;
  sid?: string;
  errorMessage?: string;
  errorCode?: number | null;
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_SMS_FROM || process.env.TWILIO_WHATSAPP_FROM)
  );
}

/** E.164-ish normalization: keep digits and a leading +. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9+]/g, "");
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromRaw = process.env.TWILIO_SMS_FROM || process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !fromRaw) {
    return { ok: false, errorMessage: "Twilio not configured." };
  }

  // SMS From must be a bare number — drop any "whatsapp:" prefix.
  const from = fromRaw.replace(/^whatsapp:/i, "");

  const params = new URLSearchParams();
  params.set("From", from);
  params.set("To", normalizePhone(to));
  params.set("Body", body);

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
    return {
      ok: true,
      status: res.status,
      sid: (json as { sid?: string }).sid,
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : "SMS send failed.",
    };
  }
}
