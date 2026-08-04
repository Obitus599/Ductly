import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { fireN8nWebhook } from "@/lib/n8n";
import { sendWhatsAppOtp, whatsappConfigured } from "@/lib/twilio-whatsapp";
import { sendEmail, emailConfigured } from "@/lib/email";
import { renderVerificationEmail } from "@/lib/email-templates";
import { isUaeMobile } from "@/lib/phone-uae";
import { isValidEmail } from "@/lib/email-validate";
import {
  createAndStoreCode,
  normalizeIdentifier,
  verificationConfigured,
  CODE_TTL_MINUTES,
  type VerifyChannel,
} from "@/lib/verification";


/**
 * POST /api/verify/send
 * Body: { channel: "email" | "sms", identifier: string }
 *
 * Generates a 6-digit code, stores its hash, and delivers it — phone via
 * WhatsApp (Twilio), email straight over SMTP (rendered in-app; falls back
 * to the n8n relay if SMTP fails or the domain isn't verified).
 * Generic { ok: true } response (we don't leak delivery internals).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`verify-send:${ip}`, 8, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  let body: { channel?: string; identifier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const channel = body.channel as VerifyChannel;
  if (channel !== "email" && channel !== "sms") {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  }
  if (typeof body.identifier !== "string" || !body.identifier.trim()) {
    return NextResponse.json({ error: "identifier is required." }, { status: 400 });
  }
  // Hard length cap BEFORE the value is used to build a rate-limit key.
  // An unbounded identifier could otherwise overflow the rate_limits btree
  // key and error the insert (see lib/rate-limit safeRateLimitKey).
  if (body.identifier.length > 254) {
    return NextResponse.json({ error: "Identifier too long." }, { status: 400 });
  }

  const identifier = normalizeIdentifier(channel, body.identifier);
  if (channel === "email" && !isValidEmail(identifier)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (channel === "sms" && !isUaeMobile(identifier)) {
    // Reject non-UAE numbers here with a clear message rather than letting
    // Twilio bounce a non-E.164 address with an opaque 502.
    return NextResponse.json(
      { error: "Enter a valid UAE mobile number (e.g. 050 123 4567)." },
      { status: 400 }
    );
  }

  // Per-identifier throttle so a single email/phone can't be code-bombed.
  const idRl = await checkRateLimit(`verify-send:${channel}:${identifier}`, 3, 10 * 60 * 1000);
  if (!idRl.allowed) {
    return NextResponse.json(
      { error: "Too many codes requested for this contact. Try again later." },
      { status: 429 }
    );
  }

  if (!verificationConfigured()) {
    console.error("VERIFY_CODE_SECRET is not set — cannot issue verification codes.");
    return NextResponse.json({ error: "Verification is not configured." }, { status: 503 });
  }

  // Test-contact bypass — Tabby QA uses identifiers that can't receive
  // real messages. Store the static code "000000" and skip delivery so
  // QA can verify without a real inbox or WhatsApp number.
  const testContacts = (process.env.VERIFY_TEST_CONTACTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (testContacts.includes(identifier.toLowerCase())) {
    await createAndStoreCode(channel, identifier, "000000");
    return NextResponse.json({ ok: true });
  }

  const code = await createAndStoreCode(channel, identifier);

  if (channel === "sms") {
    // Phone codes go over WhatsApp, not SMS — UAE Twilio SMS is blocked
    // (the sender isn't SMS-capable and UAE A2P SMS is filtered).
    if (!whatsappConfigured() || !process.env.TWILIO_CONTENT_SID_DUCTLY_VERIFY) {
      return NextResponse.json({ error: "Phone verification is not configured." }, { status: 503 });
    }
    const result = await sendWhatsAppOtp(identifier, code);
    if (!result.ok) {
      console.error("verify WhatsApp send failed:", result.errorMessage, result.errorCode);
      return NextResponse.json({ error: "Could not send the verification code." }, { status: 502 });
    }
  } else if (emailConfigured()) {
    // Preferred path: render the whole email in-app and send it straight
    // over SMTP. Nothing in the middle can leak raw {{ }} template markup.
    // Awaited so we can report a real failure to the user.
    const mail = renderVerificationEmail(code, CODE_TTL_MINUTES);
    const result = await sendEmail({
      to: identifier,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!result.ok) {
      console.error("verify email send failed, trying n8n fallback:", result.error);
      // Fallback to n8n relay when Resend domain is not verified or SMTP fails.
      const url = process.env.N8N_WEBHOOK_VERIFY_EMAIL;
      if (!url) {
        return NextResponse.json({ error: "Could not send the verification code." }, { status: 502 });
      }
      fireN8nWebhook("verify_email", url, {
        event: "verify_email",
        email: identifier,
        code,
        ttl_minutes: CODE_TTL_MINUTES,
      });
    }
  } else {
    // No SMTP configured; use the n8n relay as the primary sender.
    const url = process.env.N8N_WEBHOOK_VERIFY_EMAIL;
    if (!url) {
      return NextResponse.json({ error: "Email verification is not configured." }, { status: 503 });
    }
    fireN8nWebhook("verify_email", url, {
      event: "verify_email",
      email: identifier,
      code,
      ttl_minutes: CODE_TTL_MINUTES,
    });
  }

  return NextResponse.json({ ok: true });
}
