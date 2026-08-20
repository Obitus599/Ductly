import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { isValidEmail } from "@/lib/email-validate";
import { isUaeMobile } from "@/lib/phone-uae";
import { sendEmail, emailConfigured } from "@/lib/email";
import { renderDiscountEmail } from "@/lib/email-templates";
import {
  normalizeCode,
  generateUniqueCode,
  validateRuleForIssue,
  getDiscountCode,
} from "@/lib/discounts";

/**
 * POST /api/discount/claim
 *
 * Popup signup for the discount offer. Validates the contact, mints a
 * unique code (deduped by email), records it, and emails the code.
 *
 * Body: { email: string, phone: string }
 * Response: { success: true } — the code is delivered by email. In the
 * dev/test case where Resend isn't configured, the code is returned in
 * the body so local testing isn't blocked.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(`discount-claim:${clientIp}`, 3, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, phone } = body;

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }
    if (!isUaeMobile(phone)) {
      return NextResponse.json(
        { error: "Enter a valid UAE mobile number (e.g. 050 123 4567)." },
        { status: 400 }
      );
    }

    const safeEmail = String(email).trim().toLowerCase();
    const safePhone = String(phone).trim();

    // The active campaign rule must exist, be enabled, and be under its cap.
    const ruleCheck = await validateRuleForIssue();
    if (!ruleCheck.ok || ruleCheck.percent === undefined) {
      return NextResponse.json(
        { error: "The discount offer is not currently available." },
        { status: 410 }
      );
    }

    // Dedupe by email: a returning address gets its existing code resent,
    // never a fresh one (prevents inbox spam + unlimited minting).
    const existing = await getDiscountCode(safeEmail);
    if (existing) {
      const mail = await sendEmail({
        to: safeEmail,
        ...renderDiscountEmail(existing.code, existing.discount_percent),
      });
      if (!mail.ok) {
        await supabaseAdmin.from("error_log").insert({
          flow_name: "discount_claim_email",
          error_message: `Discount code resend failed for ${safeEmail}: ${mail.error}`,
          payload: { email: safeEmail, code: existing.code },
        } as never);
      }
      return NextResponse.json(
        emailConfigured() ? { success: true } : { success: true, code: existing.code }
      );
    }

    // Mint a unique code snapshotting the current rule's percent.
    const code = generateUniqueCode();
    const { error: insertError } = await supabaseAdmin.from("discount_codes").insert({
      code,
      discount_percent: ruleCheck.percent,
      issued_to_email: safeEmail,
      issued_to_phone: safePhone,
    } as never);
    if (insertError) {
      console.error("discount code insert error:", insertError);
      return NextResponse.json({ error: "Failed to issue a code." }, { status: 500 });
    }

    const mail = await sendEmail({
      to: safeEmail,
      ...renderDiscountEmail(code, ruleCheck.percent),
    });
    if (!mail.ok) {
      // The code exists in the DB; the email may have failed. Log it so it
      // can be re-sent, but don't pretend the signup failed.
      await supabaseAdmin.from("error_log").insert({
        flow_name: "discount_claim_email",
        error_message: `Discount code email failed for ${safeEmail}: ${mail.error}`,
        payload: { email: safeEmail, code },
      } as never);
    }

    return NextResponse.json(
      emailConfigured() ? { success: true } : { success: true, code }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
