import crypto from "crypto";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { assignTeamToBooking } from "@/lib/scheduling-agent";
import { fireN8nWebhook } from "@/lib/n8n";
import { fireOpsAlert } from "@/lib/ops-alert";
import {
  buildMapsLink,
  formatSlotForDispatch,
  addressQuality,
} from "@/lib/dispatch-format";

/**
 * Shared post-payment path for a confirmed booking, used by BOTH the
 * Stripe webhook and the Tabby return/webhook handlers.
 *
 * The compare-and-swap on booking status (pending/payment_failed →
 * confirmed) makes this idempotent and double-dispatch-safe: Tabby's
 * redirect and webhook may both call it, but only the first transition
 * assigns a team and fires dispatch. Provider-specific payment metadata
 * (Stripe payment_intent vs Tabby payment id) is recorded on the row.
 */
export interface ConfirmPaidBookingInput {
  bookingId: string;
  slotStart: string;
  address: string;
  provider: "stripe" | "tabby";
  /** payment_intent_id (Stripe) or tabby payment id. */
  paymentRef: string;
  /** booking-lock key to release, if any. */
  sessionId?: string;
  isTest: boolean;
  /** Provider-supplied fallbacks when the customers row can't be read. */
  fallbackName?: string;
  fallbackPhone?: string;
  fallbackEmail?: string;
}

export interface ConfirmPaidBookingResult {
  /** true iff THIS call transitioned the booking to confirmed. */
  confirmed: boolean;
  reason?: "already_confirmed" | "not_confirmable";
  teamId?: string;
}

export async function confirmPaidBooking(
  input: ConfirmPaidBookingInput
): Promise<ConfirmPaidBookingResult> {
  const {
    bookingId,
    slotStart,
    address,
    provider,
    paymentRef,
    sessionId,
    isTest,
    fallbackName = "",
    fallbackPhone = "",
    fallbackEmail = "",
  } = input;
  const supabase = supabaseAdmin;

  // Idempotency fast-path: skip if already confirmed.
  const { data: existing } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .returns<{ status: string }[]>()
    .single();

  if (existing?.status === "confirmed") {
    return { confirmed: false, reason: "already_confirmed" };
  }

  // Compare-and-swap: only confirm from a PRE-confirmation state. A late/
  // duplicate/out-of-order call that finds the booking already finalized
  // or cancelled matches 0 rows and skips assignment + dispatch entirely.
  const manageToken = `bk_${crypto.randomBytes(24).toString("hex")}`;
  const providerFields =
    provider === "tabby"
      ? { tabby_payment_id: paymentRef, payment_provider: "tabby" }
      : { payment_intent_id: paymentRef };

  const { data: confirmedRows } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      manage_token: manageToken,
      is_test_data: isTest,
      ...providerFields,
    } as never)
    .eq("id", bookingId)
    .in("status", ["pending", "payment_failed"])
    .select("id")
    .returns<{ id: string }[]>();

  if (!confirmedRows || confirmedRows.length === 0) {
    return { confirmed: false, reason: "not_confirmable" };
  }

  // Release the temporary booking lock.
  if (sessionId) {
    await supabase.from("booking_locks").delete().eq("session_id", sessionId);
  }

  let assignedTeamId: string | undefined;

  // Layer 2 — assign the optimal team, then dispatch to it.
  try {
    const result = await assignTeamToBooking(bookingId, slotStart, address || "");
    assignedTeamId = result.teamId;
    console.log(
      `Team assignment: ${result.teamId} via ${result.method} for booking ${bookingId}`
    );

    const n8nDispatchUrl = process.env.N8N_WEBHOOK_TEAM_DISPATCH;
    if (n8nDispatchUrl && result.teamId) {
      const { data: teamData } = await supabase
        .from("teams")
        .select("name, whatsapp_number")
        .eq("id", result.teamId)
        .returns<{ name: string; whatsapp_number: string }[]>()
        .single();

      const { data: bookingData } = await supabase
        .from("bookings")
        .select("customer_id, address_details, slot_end, plan, price_net_fils")
        .eq("id", bookingId)
        .returns<
          {
            customer_id: string;
            address_details: Record<string, unknown> | null;
            slot_end: string;
            plan: string | null;
            price_net_fils: number | null;
          }[]
        >()
        .single();

      let dispatchCustomerName = "";
      let dispatchCustomerPhone = "";
      if (bookingData?.customer_id) {
        const { data: dispatchCustomer } = await supabase
          .from("customers")
          .select("name, phone")
          .eq("id", bookingData.customer_id)
          .returns<{ name: string; phone: string }[]>()
          .single();
        if (dispatchCustomer) {
          dispatchCustomerName = dispatchCustomer.name;
          dispatchCustomerPhone = dispatchCustomer.phone;
        }
      }
      if (!dispatchCustomerPhone && fallbackPhone) dispatchCustomerPhone = fallbackPhone;
      if (!dispatchCustomerName && fallbackName) dispatchCustomerName = fallbackName;
      if (!dispatchCustomerPhone) {
        console.error(
          `[team_dispatch] No phone resolved for booking ${bookingId} (customer_id=${bookingData?.customer_id ?? "null"}).`
        );
      }

      const addrDetails = bookingData?.address_details as Record<string, unknown> | null;
      const mapsLink = buildMapsLink(addrDetails, address || "");
      const slotStartHuman = formatSlotForDispatch(slotStart);
      const slotEndIso = (bookingData?.slot_end as string) || "";
      const slotEndHuman = slotEndIso ? formatSlotForDispatch(slotEndIso) : "";
      const quality = addressQuality(addrDetails);
      const priceAed = bookingData?.price_net_fils
        ? String(Math.round(bookingData.price_net_fils / 100))
        : "";

      // PDPL: record that customer PII was shared with this team.
      supabase
        .from("team_data_access")
        .insert({
          team_id: result.teamId,
          booking_id: bookingId,
          shared_fields: ["customer_name", "customer_phone", "address"],
          channel: "n8n_team_dispatch",
        } as never)
        .then(({ error }) => {
          if (error) console.warn("team_data_access insert failed:", error.message);
        });

      fireN8nWebhook("team_dispatch", n8nDispatchUrl, {
        event: "team_dispatch",
        booking_id: bookingId,
        team_id: result.teamId,
        team_name: teamData?.name || "",
        team_whatsapp: teamData?.whatsapp_number || "",
        customer_name: dispatchCustomerName,
        customer_phone: dispatchCustomerPhone,
        address: address || "",
        address_quality: quality,
        maps_link: mapsLink,
        building_name: addrDetails?.building_name || "",
        flat_number: addrDetails?.flat_number || "",
        floor: addrDetails?.floor || "",
        additional_directions: addrDetails?.additional_directions || "",
        slot_start: slotStart,
        slot_start_human: slotStartHuman,
        slot_end: slotEndIso,
        slot_end_human: slotEndHuman,
        plan: bookingData?.plan || "",
        price_aed: priceAed,
      });
    }
  } catch (agentError) {
    console.error("Team assignment failed:", agentError);
    await supabase.from("error_log").insert({
      flow_name: "layer2_agent",
      error_message:
        agentError instanceof Error ? agentError.message : "Unknown agent error",
      payload: { booking_id: bookingId, slot_start: slotStart },
    } as never);
  }

  // Customer-facing booking confirmation (email/WhatsApp via n8n).
  const n8nBookingUrl = process.env.N8N_WEBHOOK_BOOKING_CONFIRMED;
  if (n8nBookingUrl) {
    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("customer_id, slot_end, address_details, team_id, plan, price_net_fils")
      .eq("id", bookingId)
      .returns<
        {
          customer_id: string;
          slot_end: string;
          address_details: Record<string, unknown> | null;
          team_id: string | null;
          plan: string | null;
          price_net_fils: number | null;
        }[]
      >()
      .single();

    let customerPhone = "";
    let customerName = "";
    if (bookingRow?.customer_id) {
      const { data: customerRow } = await supabase
        .from("customers")
        .select("name, phone")
        .eq("id", bookingRow.customer_id)
        .returns<{ name: string; phone: string }[]>()
        .single();
      if (customerRow) {
        customerName = customerRow.name;
        customerPhone = customerRow.phone;
      }
    }
    if (!customerPhone && fallbackPhone) customerPhone = fallbackPhone;
    if (!customerName && fallbackName) customerName = fallbackName;

    const priceAed = bookingRow?.price_net_fils
      ? String(Math.round(bookingRow.price_net_fils / 100))
      : "";

    fireN8nWebhook("booking_confirmed", n8nBookingUrl, {
      event: "booking_confirmed",
      booking_id: bookingId,
      customer_name: customerName || fallbackEmail || "",
      customer_email: fallbackEmail,
      customer_phone: customerPhone,
      address: address || "",
      address_details: bookingRow?.address_details || null,
      slot_start: slotStart,
      slot_end: bookingRow?.slot_end || "",
      team_id: bookingRow?.team_id || null,
      plan: bookingRow?.plan || "",
      price_aed: priceAed,
      manage_token: manageToken,
      payment_ref: paymentRef,
      payment_provider: provider,
    });
  }

  // Notify the owners (Mattia + Ashwini) of the new booking.
  fireOpsAlert("new_booking", {
    bookingId,
    customerName: fallbackName || fallbackEmail || "",
    customerPhone: fallbackPhone || "",
    slotStart,
    address: address || "",
    source: provider === "tabby" ? "online_booking_tabby" : "online_booking",
  });

  return { confirmed: true, teamId: assignedTeamId };
}
