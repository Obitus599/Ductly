import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

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
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
    .select("id, email, deleted_at")
    .eq("id", customerId)
    .returns<{ id: string; email: string; deleted_at: string | null }[]>()
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  if (customer.deleted_at) {
    return NextResponse.json({ ok: true, already_deleted: true });
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

  return NextResponse.json({
    ok: true,
    notice:
      "Your personal data has been removed. Booking records have been anonymised but retained for the period required by UAE commercial law (5 years for tax/payment records).",
  });
}
