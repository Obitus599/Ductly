"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Booking {
  id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  status: string;
  payment_intent_id: string | null;
  customer_id: string;
  team_id: string | null;
  manage_token: string | null;
  rescheduled_from: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  refund_id: string | null;
  refund_status: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  whatsapp_opt_in: boolean;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
  whatsapp_number: string | null;
  active: boolean;
}

interface SlotLock {
  id: string;
  team_id: string;
  slot_start: string;
  created_at: string;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const STATUS_DOT: Record<string, string> = {
  pending: "rgb(234,179,8)",
  confirmed: "rgb(34,197,94)",
  completed: "rgb(59,130,246)",
  cancelled: "rgb(156,163,175)",
  no_show: "rgb(239,68,68)",
  payment_failed: "rgb(239,68,68)",
  expired: "rgb(156,163,175)",
  failed: "rgb(239,68,68)",
};

const STATUS_BG: Record<string, string> = {
  pending: "rgba(234,179,8,0.1)",
  confirmed: "rgba(34,197,94,0.1)",
  completed: "rgba(59,130,246,0.1)",
  cancelled: "rgba(156,163,175,0.08)",
  no_show: "rgba(239,68,68,0.1)",
  payment_failed: "rgba(239,68,68,0.1)",
  expired: "rgba(156,163,175,0.08)",
  failed: "rgba(239,68,68,0.1)",
};

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [allTeams, setAllTeams] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [slotLock, setSlotLock] = useState<SlotLock | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/admin/bookings/${id}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setBooking(data.booking);
    setCustomer(data.customer);
    setTeam(data.team);
    setAllTeams(data.all_teams);
    setSlotLock(data.slot_lock);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function updateBooking(updates: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActionLoading(true);
    await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await fetchDetail();
    setActionLoading(false);
  }

  async function cancelBooking() {
    if (!confirm("Cancel this booking and issue a refund?")) return;
    setActionLoading(true);
    await fetch(`/api/admin/bookings/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Cancelled by admin", issue_refund: true }),
    });
    await fetchDetail();
    setActionLoading(false);
  }

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-AE", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit", hour12: true })
    );
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-AE", { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="text-center py-20">
        <p className="text-[16px] mb-4" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
          Booking not found.
        </p>
        <Link href="/admin/bookings" className="text-[14px] font-medium" style={{ fontFamily: "var(--font-cta)", color: "rgb(80,160,160)" }}>
          Back to bookings
        </Link>
      </div>
    );
  }

  const isActive = booking.status === "confirmed" || booking.status === "pending";

  return (
    <div>
      {/* Back + Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin/bookings")}
          className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors hover:bg-[rgb(245,246,248)]"
          style={{ border: "1px solid rgb(238,240,244)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(130,135,145)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[18px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
              Booking Details
            </h1>
            <span
              className="text-[12px] font-medium px-2.5 py-1 rounded-full"
              style={{
                fontFamily: "var(--font-badge)",
                background: STATUS_BG[booking.status] ?? "rgba(156,163,175,0.08)",
                color: STATUS_DOT[booking.status] ?? "rgb(156,163,175)",
              }}
            >
              {booking.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-[12px] font-mono mt-0.5" style={{ color: "rgb(200,205,215)" }}>{booking.id}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column: Booking + Customer */}
        <div className="lg:col-span-2 space-y-6">
          {/* Booking Info */}
          <div style={CARD} className="p-6">
            <h2 className="text-[15px] font-medium mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
              Appointment
            </h2>
            <div className="space-y-3">
              {[
                { label: "Slot Start", value: formatDateTime(booking.slot_start) },
                { label: "Slot End", value: formatDateTime(booking.slot_end) },
                { label: "Address", value: booking.address },
                { label: "Created", value: formatDateTime(booking.created_at) },
                ...(booking.rescheduled_from ? [{ label: "Rescheduled From", value: formatDateTime(booking.rescheduled_from), highlight: true }] : []),
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between py-2 px-3 rounded-[8px]" style={{ background: row.highlight ? "rgba(234,179,8,0.06)" : "rgb(247,248,250)" }}>
                  <span className="text-[13px] shrink-0" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>{row.label}</span>
                  <span className="text-[13px] font-medium text-right ml-4" style={{ fontFamily: "var(--font-body)", color: row.highlight ? "rgb(180,140,20)" : "rgb(61,61,61)" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Info */}
          {customer && (
            <div style={CARD} className="p-6">
              <h2 className="text-[15px] font-medium mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
                Customer
              </h2>
              <div className="space-y-3">
                {[
                  { label: "Name", value: customer.name },
                  { label: "Phone", value: customer.phone },
                  { label: "Email", value: customer.email },
                  { label: "WhatsApp Opt-in", value: customer.whatsapp_opt_in ? "Yes" : "No" },
                  { label: "Customer Since", value: formatDate(customer.created_at) },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2 px-3 rounded-[8px]" style={{ background: "rgb(247,248,250)" }}>
                    <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>{row.label}</span>
                    <span className="text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Info */}
          <div style={CARD} className="p-6">
            <h2 className="text-[15px] font-medium mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
              Payment
            </h2>
            <div className="space-y-3">
              {[
                { label: "Payment Intent", value: booking.payment_intent_id || "None", mono: true },
                ...(booking.refund_id ? [{ label: "Refund ID", value: booking.refund_id, mono: true }] : []),
                ...(booking.refund_status ? [{ label: "Refund Status", value: booking.refund_status }] : []),
                ...(booking.cancelled_at ? [{ label: "Cancelled At", value: formatDateTime(booking.cancelled_at) }] : []),
                ...(booking.cancelled_by ? [{ label: "Cancelled By", value: booking.cancelled_by }] : []),
                ...(booking.cancellation_reason ? [{ label: "Reason", value: booking.cancellation_reason }] : []),
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 px-3 rounded-[8px]" style={{ background: "rgb(247,248,250)" }}>
                  <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>{row.label}</span>
                  <span className={`text-[13px] font-medium ${row.mono ? "font-mono" : ""}`} style={{ fontFamily: row.mono ? undefined : "var(--font-body)", color: "rgb(61,61,61)" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Actions + Team */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div style={CARD} className="p-6">
            <h2 className="text-[15px] font-medium mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
              Actions
            </h2>
            <div className="space-y-2.5">
              {booking.status === "confirmed" && (
                <>
                  <button
                    onClick={() => updateBooking({ status: "completed" }, "Mark this booking as completed?")}
                    disabled={actionLoading}
                    className="w-full py-2.5 text-[13px] font-medium rounded-[10px] border-2 transition-all disabled:opacity-50"
                    style={{ fontFamily: "var(--font-cta)", borderColor: "rgba(59,130,246,0.2)", color: "rgb(59,130,246)", background: "rgba(59,130,246,0.04)" }}
                  >
                    Mark Completed
                  </button>
                  <button
                    onClick={() => updateBooking({ status: "no_show" }, "Mark this booking as no-show?")}
                    disabled={actionLoading}
                    className="w-full py-2.5 text-[13px] font-medium rounded-[10px] border-2 transition-all disabled:opacity-50"
                    style={{ fontFamily: "var(--font-cta)", borderColor: "rgba(234,179,8,0.2)", color: "rgb(180,140,20)", background: "rgba(234,179,8,0.04)" }}
                  >
                    Mark No-Show
                  </button>
                  <button
                    onClick={cancelBooking}
                    disabled={actionLoading}
                    className="w-full py-2.5 text-[13px] font-medium rounded-[10px] border-2 transition-all disabled:opacity-50"
                    style={{ fontFamily: "var(--font-cta)", borderColor: "rgba(239,68,68,0.2)", color: "rgb(239,68,68)", background: "rgba(239,68,68,0.04)" }}
                  >
                    Cancel + Refund
                  </button>
                </>
              )}
              {booking.status === "pending" && (
                <button
                  onClick={() => updateBooking({ status: "confirmed" }, "Confirm this booking?")}
                  disabled={actionLoading}
                  className="w-full py-2.5 text-[13px] font-medium rounded-[10px] border-2 transition-all disabled:opacity-50"
                  style={{ fontFamily: "var(--font-cta)", borderColor: "rgba(34,197,94,0.2)", color: "rgb(34,197,94)", background: "rgba(34,197,94,0.04)" }}
                >
                  Confirm Booking
                </button>
              )}
              {!isActive && (
                <p className="text-[13px] text-center py-3" style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,190)" }}>
                  No actions available for {booking.status.replace("_", " ")} bookings.
                </p>
              )}
            </div>
          </div>

          {/* Team Assignment */}
          <div style={CARD} className="p-6">
            <h2 className="text-[15px] font-medium mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
              Team Assignment
            </h2>
            {team ? (
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[14px] font-medium"
                  style={{ background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))", color: "white", fontFamily: "var(--font-badge)" }}
                >
                  {team.name.charAt(0)}
                </div>
                <div>
                  <p className="text-[14px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{team.name}</p>
                  {team.whatsapp_number && (
                    <p className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>{team.whatsapp_number}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[13px] mb-4" style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,190)" }}>No team assigned</p>
            )}

            {isActive && (
              <div>
                <label className="text-[12px] font-medium mb-1.5 block" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>
                  Reassign Team
                </label>
                <select
                  className="w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3 py-2 text-[13px] text-[rgb(61,61,61)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                  defaultValue={booking.team_id || ""}
                  onChange={(e) => {
                    const newTeamId = e.target.value || null;
                    if (newTeamId !== booking.team_id) {
                      updateBooking({ team_id: newTeamId }, `Reassign this booking to ${allTeams.find((t) => t.id === newTeamId)?.name ?? "no team"}?`);
                    }
                  }}
                  disabled={actionLoading}
                >
                  <option value="">Unassigned</option>
                  {allTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Slot Lock Info */}
            {slotLock && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgb(245,246,248)" }}>
                <p className="text-[12px] font-medium mb-1" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>Slot Lock</p>
                <p className="text-[12px] font-mono" style={{ color: "rgb(180,185,190)" }}>{slotLock.id.slice(0, 8)} &middot; Created {formatDate(slotLock.created_at)}</p>
              </div>
            )}
          </div>

          {/* Manage Token */}
          {booking.manage_token && (
            <div style={CARD} className="p-6">
              <h2 className="text-[15px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
                Customer Link
              </h2>
              <p className="text-[12px] mb-2" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>
                Share this link with the customer to manage their booking:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] px-3 py-2 rounded-[8px] bg-[rgb(247,248,250)] truncate" style={{ color: "rgb(100,105,115)" }}>
                  /manage/{booking.manage_token}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/manage/${booking.manage_token}`)}
                  className="shrink-0 px-3 py-2 text-[12px] font-medium rounded-[8px] transition-colors hover:opacity-80"
                  style={{ fontFamily: "var(--font-cta)", background: "rgb(247,248,250)", color: "rgb(80,160,160)" }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
