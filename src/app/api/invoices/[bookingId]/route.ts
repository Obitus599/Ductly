import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { buildInvoiceModel } from "@/lib/invoice";
import { issueInvoiceForBooking } from "@/lib/issue-invoice";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

/**
 * GET /api/invoices/[bookingId]
 *
 * Admin-only. Issues (or fetches, if already issued) the FTA tax invoice
 * for a booking and returns it as a PDF. Idempotent: the DB function
 * create_invoice_for_booking returns the existing invoice if one exists,
 * so repeated calls never burn invoice numbers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { bookingId } = await params;
  if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }

  const supabase = supabaseAdmin;

  // Issue-or-fetch the invoice atomically (snapshots the current TRN).
  let invoice;
  try {
    invoice = await issueInvoiceForBooking(bookingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create invoice.";
    // No price snapshot / booking missing → 422 (not transient).
    const status = /no price snapshot|booking not found/i.test(message) ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  // Booking + customer for the invoice body.
  const { data: booking } = await supabase
    .from("bookings")
    .select("plan, thermostats, address, customer_id")
    .eq("id", bookingId)
    .returns<{ plan: string | null; thermostats: number | null; address: string | null; customer_id: string }[]>()
    .single();

  let customer: { name?: string | null; email?: string | null; phone?: string | null } = {};
  if (booking?.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("name, email, phone")
      .eq("id", booking.customer_id)
      .returns<{ name: string; email: string; phone: string }[]>()
      .single();
    if (c) customer = c;
  }

  const model = buildInvoiceModel(
    invoice,
    {
      plan: booking?.plan ?? null,
      thermostats: booking?.thermostats ?? null,
      address: booking?.address ?? null,
    },
    customer
  );

  const pdfBytes = await renderInvoicePdf(model);

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
