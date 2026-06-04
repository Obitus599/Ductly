import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyCode, normalizeIdentifier, type VerifyChannel } from "@/lib/verification";

/**
 * POST /api/verify/check
 * Body: { channel: "email" | "sms", identifier: string, code: string }
 *
 * Checks a submitted code. A failed check is a normal outcome (200 with
 * verified:false + reason), not an error.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`verify-check:${ip}`, 15, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429 });
  }

  let body: { channel?: string; identifier?: string; code?: string };
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
  if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
    return NextResponse.json({ verified: false, reason: "mismatch" }, { status: 200 });
  }

  const identifier = normalizeIdentifier(channel, body.identifier);
  const result = await verifyCode(channel, identifier, body.code);

  if (result.ok) {
    return NextResponse.json({ verified: true });
  }
  return NextResponse.json({ verified: false, reason: result.reason }, { status: 200 });
}
