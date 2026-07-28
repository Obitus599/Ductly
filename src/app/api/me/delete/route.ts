import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import {
  isContactVerified,
  normalizeIdentifier,
  verificationConfigured,
} from "@/lib/verification";

/**
 * POST /api/me/delete  { token: "bk_..." }
 *
 * PDPL right to erasure (Article 19). Soft-deletes the customer:
 * - PII fields are anonymised (name/email/phone replaced with sentinels)
 * - whatsapp_opt_in cleared
 * - deleted_at stamped
 * - Bookings retained (FTA 5-year commercial-records requirement) but
 *   address scrubbed
 * - Newsletter row deactivated
 *
 * Blocks if the customer has CONFIRMED future bookings — those must be
 * cancelled via /manage/<token> first (refund handling lives there).
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(`me-delete:${clientIp}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many deletion requests. Try again in an hour." }, { status: 429 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = body.token;
  if (!token || !token.startsWith("bk_") || token.length < 20) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 400 });
  }

  const { data: tokenBooking } = await supabaseAdmin
    .from("bookings")
    .select("customer_id")
    .eq("manage_token", token)
    .returns<{ customer_id: string }[]>()
    .single();

  if (!tokenBooking) {
    return NextResponse.json({ error: "Token not recognised." }, { status: 404 });
  }

  const customerId = tokenBooking.customer_id;

  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("id, email, phone, deleted_at")
    .eq("id", customerId)
    .returns<{ id: string; email: string; phone: string | null; deleted_at: string | null }[]>()
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  if (customer.deleted_at) {
    return NextResponse.json({ ok: true, already_deleted: true });
  }

  // A manage_token is a bearer credential that never expires and grants
  // account-wide access. For an IRREVERSIBLE, account-wide erasure that is
  // not enough on its own — a leaked or forwarded booking link must not be
  // a self-destruct button. Require a fresh email OTP so the requester
  // proves they control the mailbox, which the token alone does not.
  // Falls through to token-only where OTP isn't configured (dev), so this
  // hardens production without bricking environments that have no OTP.
  if (verificationConfigured()) {
    const verified = await isContactVerified(
      "email",
      normalizeIdentifier("email", customer.email)
    );
    if (!verified) {
      return NextResponse.json(
        {
          error:
            "Please verify your email before we erase your data. Request a code with /api/verify/send, confirm it with /api/verify/check, then retry.",
          needs_verification: true,
          channel: "email",
        },
        { status: 403 }
      );
    }
  }

  // Block if any confirmed future bookings remain
  const { data: futureBookings } = await supabaseAdmin
    .from("bookings")
    .select("id, manage_token, slot_start")
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gt("slot_start", new Date().toISOString())
    .returns<{ id: string; manage_token: string; slot_start: string }[]>();

  if (futureBookings && futureBookings.length > 0) {
    return NextResponse.json(
      {
        error:
          "You still have confirmed upcoming bookings. Please cancel them first via the management link in your confirmation email, then re-request deletion.",
        upcoming_count: futureBookings.length,
      },
      { status: 409 }
    );
  }

  // Anonymise customer. Email gets a unique deleted-sentinel so the
  // (email, onConflict) upsert in /api/checkout can't accidentally
  // resurrect this row on someone else's future booking.
  const deletedEmail = `deleted+${customerId}@deleted.local`;
  const { error: customerUpdateError } = await supabaseAdmin
    .from("customers")
    .update({
      name: "Deleted customer",
      email: deletedEmail,
      phone: "+000",
      whatsapp_opt_in: false,
      deleted_at: new Date().toISOString(),
    } as never)
    .eq("id", customerId);

  if (customerUpdateError) {
    console.error("Customer anonymisation failed:", customerUpdateError);
    return NextResponse.json({ error: "Failed to process deletion." }, { status: 500 });
  }

  // Scrub address from retained booking records (kept for FTA records)
  await supabaseAdmin
    .from("bookings")
    .update({ address: "[deleted by customer request]", address_details: null } as never)
    .eq("customer_id", customerId);

  // Newsletter: deactivate matching email
  await supabaseAdmin
    .from("newsletter_subscribers")
    .update({ active: false } as never)
    .eq("email", customer.email);

  // ── Sweep the remaining stores that hold raw PII ──────────────────────
  // Anonymising `customers` alone left the requester's name/email/phone
  // sitting in plain text in four other tables, so an "erased" customer
  // was still fully identifiable. None of these are FTA commercial
  // records, so unlike bookings they can be erased outright.
  //
  // Each is best-effort and independently logged: a failure in one table
  // must not abort the ones after it, and must not report success.
  const residual: string[] = [];
  const sweep = async (
    label: string,
    run: () => PromiseLike<{ error: unknown }>
  ) => {
    try {
      const { error } = await run();
      if (error) {
        console.error(`PDPL erasure: ${label} failed:`, error);
        residual.push(label);
      }
    } catch (err) {
      console.error(`PDPL erasure: ${label} threw:`, err);
      residual.push(label);
    }
  };

  // 1. contact_submissions — free-text enquiries keyed by email.
  await sweep("contact_submissions", () =>
    supabaseAdmin
      .from("contact_submissions")
      .update({
        name: "Deleted customer",
        email: deletedEmail,
        message: "[deleted by customer request]",
      } as never)
      .eq("email", customer.email)
  );

  // 2. feedback — the rating is retained (aggregate service quality), but
  //    the free-text comment can name people and is erased.
  await sweep("feedback", () =>
    supabaseAdmin
      .from("feedback")
      .update({ comment: "[deleted by customer request]" } as never)
      .eq("customer_id", customerId)
  );

  // 3. verification_codes — transient OTP rows keyed by the raw email or
  //    phone. Nothing to retain; delete outright.
  await sweep("verification_codes", () =>
    supabaseAdmin
      .from("verification_codes")
      .delete()
      .eq("identifier", customer.email)
  );
  if (customer.phone) {
    await sweep("verification_codes_phone", () =>
      supabaseAdmin
        .from("verification_codes")
        .delete()
        .eq("identifier", customer.phone as string)
    );
  }

  // 4. error_log — diagnostic payloads can embed the email/phone that
  //    caused the failure. Purge the rows that reference this customer.
  //
  //    Each JSON-path match is its OWN .eq() call, never an interpolated
  //    .or() string. In PostgREST an .or() argument is DSL that is PARSED:
  //    a comma or an `id.not.is.null` fragment inside the value injects new
  //    top-level conditions (a customer-chosen email could delete the whole
  //    table). A .eq() value is sent as data and never parsed, so the same
  //    address is inert. isValidEmail already blocks the punctuation, but
  //    this is the structural fix and does not depend on that guard holding.
  for (const field of ["email", "customer_email", "identifier"]) {
    await sweep(`error_log:${field}`, () =>
      supabaseAdmin
        .from("error_log")
        .delete()
        .eq(`payload->>${field}`, customer.email)
    );
  }

  if (residual.length > 0) {
    // Don't claim a clean erasure we didn't achieve — flag it for manual
    // completion inside the PDPL response window.
    await supabaseAdmin.from("error_log").insert({
      flow_name: "pdpl_erasure_incomplete",
      error_message: `Erasure for customer ${customerId} left residual PII in: ${residual.join(", ")}`,
      payload: { customer_id: customerId, tables: residual },
    } as never);
  }

  return NextResponse.json({
    ok: true,
    residual_tables: residual.length ? residual : undefined,
    notice:
      "Your personal data has been removed. Booking records have been anonymised but retained for the period required by UAE commercial law (5 years for tax/payment records).",
  });
}
