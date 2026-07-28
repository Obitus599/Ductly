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
 * POST /api/me/export   { token: "bk_..." }        ← preferred
 * GET  /api/me/export?token=bk_...                  ← legacy, still supported
 * GET  /api/me/export   (x-manage-token header)
 *
 * PDPL data-access right (Article 17). Returns every piece of personal
 * data we hold about the requester as JSON. Auth is via any of the
 * customer's booking manage_tokens — possession of the token proves
 * ownership of the email we mailed it to.
 *
 * The token is a long-lived credential, and a query string is the worst
 * place to put one: it lands in access logs, proxy logs, browser history
 * and the Referer header of anything the page links to. POST (token in the
 * body) or the `x-manage-token` header keep it out of all of those. The
 * query form is retained for links already in customers' hands, but the
 * response carries `Referrer-Policy: no-referrer` so the token can't leak
 * onward from the download.
 *
 * Response sets Content-Disposition so browsers download the JSON.
 */
export async function POST(request: NextRequest) {
  let token: string | undefined;
  try {
    const body = await request.json();
    token = typeof body?.token === "string" ? body.token : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  return handle(request, token);
}

export async function GET(request: NextRequest) {
  const token =
    request.headers.get("x-manage-token") ||
    request.nextUrl.searchParams.get("token") ||
    undefined;
  return handle(request, token ?? undefined);
}

async function handle(request: NextRequest, token: string | undefined) {
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(`me-export:${clientIp}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many export requests. Try again in an hour." }, { status: 429 });
  }

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

  // The export dumps the customer's ENTIRE account (name, phone, every
  // address, invoices, disclosures). A manage_token is a never-expiring
  // bearer credential, so a leaked/forwarded booking link must not be
  // enough to read all of that. Require a fresh email OTP — which the
  // token holder can only complete if they actually control the mailbox.
  // Falls through to token-only where OTP isn't configured (dev).
  if (verificationConfigured()) {
    const verified = await isContactVerified(
      "email",
      normalizeIdentifier("email", customerEmail)
    );
    if (!verified) {
      return NextResponse.json(
        {
          error:
            "Please verify your email before we export your data. Request a code with /api/verify/send, confirm it with /api/verify/check, then retry.",
          needs_verification: true,
          channel: "email",
        },
        { status: 403 }
      );
    }
  }

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

  // Invoices and team-disclosure records both hang off the customer's
  // bookings — include them for a complete access response (Art. 17).
  const bookingIds = (bookingsRes.data ?? []).map((b) => b.id as string);
  const [invoicesRes, accessRes] = bookingIds.length
    ? await Promise.all([
        supabaseAdmin
          .from("invoices")
          .select("*")
          .in("booking_id", bookingIds)
          .returns<Record<string, unknown>[]>(),
        // PDPL Art. 17 covers "to whom the data has been disclosed", so the
        // team_data_access audit trail belongs in the export — it's the
        // only record telling the customer which crew received their name,
        // phone and address.
        supabaseAdmin
          .from("team_data_access")
          .select("*")
          .in("booking_id", bookingIds)
          .returns<Record<string, unknown>[]>(),
      ])
    : [
        { data: [] as Record<string, unknown>[] },
        { data: [] as Record<string, unknown>[] },
      ];

  const payload = {
    exported_at: new Date().toISOString(),
    notice:
      "This export contains all personal data Ductly holds about you (UAE PDPL Art. 17 — right of access). " +
      "Payment records may be retained for 5 years under UAE commercial law even after a deletion request.",
    customer,
    bookings: bookingsRes.data ?? [],
    invoices: invoicesRes.data ?? [],
    feedback: feedbackRes.data ?? [],
    contact_submissions: contactsRes.data ?? [],
    newsletter_subscription: newsletterRes.data ?? null,
    disclosures_to_service_teams: accessRes.data ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ductly-data-export-${customerId}.json"`,
      "Cache-Control": "no-store",
      // Stops a token passed in the query string from leaking onward via
      // the Referer header.
      "Referrer-Policy": "no-referrer",
    },
  });
}
