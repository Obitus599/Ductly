import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/me/export?token=bk_...
 *
 * PDPL data-access right (Article 17). Returns every piece of personal
 * data we hold about the requester as JSON. Auth is via any of the
 * customer's booking manage_tokens — possession of the token proves
 * ownership of the email we mailed it to.
 *
 * Response sets Content-Disposition so browsers download the JSON.
 */
export async function GET(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`me-export:${clientIp}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many export requests. Try again in an hour." }, { status: 429 });
  }

  const token = request.nextUrl.searchParams.get("token");
  if (!token || !token.startsWith("bk_") || token.length < 20) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 400 });
  }

  // Resolve token → customer_id
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
    .select("id, name, email, phone, whatsapp_opt_in, consent_given_at, consent_version, last_booking, created_at, updated_at, deleted_at")
    .eq("id", customerId)
    .returns<Record<string, unknown>[]>()
    .single();

  if (!customer || customer.deleted_at) {
    return NextResponse.json({ error: "No data on file." }, { status: 404 });
  }

  const customerEmail = customer.email as string;

  const [bookingsRes, feedbackRes, contactsRes, newsletterRes] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("customer_id", customerId)
      .returns<Record<string, unknown>[]>(),
    supabaseAdmin
      .from("feedback")
      .select("*")
      .eq("customer_id", customerId)
      .returns<Record<string, unknown>[]>(),
    supabaseAdmin
      .from("contact_submissions")
      .select("*")
      .eq("email", customerEmail)
      .returns<Record<string, unknown>[]>(),
    supabaseAdmin
      .from("newsletter_subscribers")
      .select("*")
      .eq("email", customerEmail)
      .returns<Record<string, unknown>[]>()
      .maybeSingle(),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    notice:
      "This export contains all personal data Ductly holds about you (UAE PDPL Art. 17 — right of access). " +
      "Payment records may be retained for 5 years under UAE commercial law even after a deletion request.",
    customer,
    bookings: bookingsRes.data ?? [],
    feedback: feedbackRes.data ?? [],
    contact_submissions: contactsRes.data ?? [],
    newsletter_subscription: newsletterRes.data ?? null,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ductly-data-export-${customerId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
