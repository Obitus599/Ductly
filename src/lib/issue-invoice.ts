import { supabaseAdmin } from "@/utils/supabase/admin";
import { getSupplierConfig, type InvoiceRow } from "@/lib/invoice";

/**
 * Issue (or fetch, if it already exists) the FTA tax invoice for a
 * booking via the atomic, gap-free create_invoice_for_booking RPC.
 * Snapshots the currently-configured supplier TRN.
 *
 * Kept separate from invoice.ts (the pure data model) so importing the
 * model + PDF renderer never pulls in the Supabase admin client.
 */
export async function issueInvoiceForBooking(bookingId: string): Promise<InvoiceRow> {
  // The RPC isn't in the generated Database types — cast the call (same
  // pragma as the `as never` inserts elsewhere).
  const callRpc = supabaseAdmin.rpc as unknown as (
    fn: "create_invoice_for_booking",
    args: { p_booking_id: string; p_supplier_trn: string }
  ) => Promise<{ data: InvoiceRow | null; error: { message: string } | null }>;

  const { data, error } = await callRpc("create_invoice_for_booking", {
    p_booking_id: bookingId,
    p_supplier_trn: getSupplierConfig().trn,
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Could not issue invoice.");
  }
  return data;
}
