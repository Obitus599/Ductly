import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { fireN8nWebhook } from "@/lib/n8n";
import { sendWhatsAppOtp, whatsappConfigured } from "@/lib/twilio-whatsapp";
import { sendEmail, emailConfigured } from "@/lib/email";
import { renderVerificationEmail } from "@/lib/email-templates";
import { isUaeMobile } from "@/lib/phone-uae";
import {
  createAndStoreCode,
  normalizeIdentifier,
  verificationConfigured,
  CODE_TTL_MINUTES,
  type VerifyChannel,
} from "@/lib/verification";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * POST /api/verify/send
 * Body: { channel: "email" | "sms", identifier: string }
 *
 * Generates a 6-digit code, stores its hash, and delivers it — phone via
 * WhatsApp (Twilio), email straight over SMTP (rendered in-app; falls back
 * to the n8n relay only if SMTP isn't configured). Generic { ok: true }
 * response (we don't leak delivery internals).
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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

  const identifier = normalizeIdentifier(channel, body.identifier);
  if (channel === "email" && !EMAIL_RE.test(identifier)) {
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
      console.error("verify email send failed:", result.error);
      return NextResponse.json({ error: "Could not send the verification code." }, { status: 502 });
    }
  } else {
    // Fallback: the legacy n8n relay, only if SMTP isn't configured yet.
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
