/**
 * Direct transactional email via the Resend HTTP API.
 *
 * The OTP email used to be rendered inside n8n via {{ }} expressions,
 * which leaked raw template markup into recipients' inboxes whenever the
 * n8n node wasn't toggled into expression mode. To make it bulletproof,
 * the app now renders the full subject + HTML itself (see email-templates.ts)
 * and POSTs it straight to Resend — the same provider the n8n flow already
 * used — so there is no template engine in the middle to leak markup, and
 * we inherit the DKIM/SPF signing already set up on the Resend domain.
 *
 * Env:
 *   RESEND_API_KEY  (required to activate this path)
 *   EMAIL_FROM      (optional, defaults to "Ductly <noreply@ductly.ae>";
 *                    must be a verified Resend sender)
 */
export interface EmailResult {
  ok: boolean;
  error?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || "Ductly <noreply@ductly.ae>";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured." };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        // A plain-text alternative both improves deliverability (pure-HTML
        // mail scores worse with spam filters) and degrades gracefully.
        text: opts.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const message =
        (body as { message?: string }).message ||
        (body as { name?: string }).name ||
        `Resend returned ${res.status}`;
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Email send failed." };
  }
}
