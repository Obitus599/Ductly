import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { fireN8nWebhook } from "@/lib/n8n";
import { sendSms, twilioConfigured } from "@/lib/twilio-sms";
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
 * Generates a 6-digit code, stores its hash, and delivers it — SMS via
 * Twilio, email via the n8n email flow. Generic { ok: true } response
 * (we don't leak delivery internals).
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
  if (channel === "sms") {
    const digits = identifier.replace(/[^0-9]/g, "");
    if (digits.length < 7 || digits.length > 15) {
      return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
    }
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
    if (!twilioConfigured()) {
      return NextResponse.json({ error: "SMS verification is not configured." }, { status: 503 });
    }
    const result = await sendSms(
      identifier,
      `Your Ductly verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`
    );
    if (!result.ok) {
      console.error("verify SMS send failed:", result.errorMessage, result.errorCode);
      return NextResponse.json({ error: "Could not send the SMS code." }, { status: 502 });
    }
  } else {
    const url = process.env.N8N_WEBHOOK_VERIFY_EMAIL;
    if (!url) {
      return NextResponse.json({ error: "Email verification is not configured." }, { status: 503 });
    }
    // Fire-and-forget through the proven n8n email flow.
    fireN8nWebhook("verify_email", url, {
      event: "verify_email",
      email: identifier,
      code,
      ttl_minutes: CODE_TTL_MINUTES,
    });
  }

  return NextResponse.json({ ok: true });
}
