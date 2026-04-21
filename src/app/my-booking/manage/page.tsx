"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

interface BookingData {
  booking: {
    id: string;
    slot_start: string;
    slot_end: string;
    address: string;
    status: string;
    created_at: string;
  };
  customer: { name: string; email: string } | null;
  can_cancel: boolean;
  can_reschedule: boolean;
  hours_until_slot: number;
  policy: string;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const BTN_PRIMARY: React.CSSProperties = {
  background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
  borderRadius: 40,
  boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)",
  fontFamily: "var(--font-cta)",
  fontWeight: 500,
  letterSpacing: "-0.02em",
};

const BTN_DANGER: React.CSSProperties = {
  background: "rgb(239,68,68)",
  borderRadius: 40,
  fontFamily: "var(--font-cta)",
  fontWeight: 500,
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: "rgb(34,197,94)",
  cancelled: "rgb(156,163,175)",
  completed: "rgb(59,130,246)",
  pending: "rgb(234,179,8)",
};

function ManageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Cancel state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleResult, setRescheduleResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchBooking = useCallback(() => {
    if (!token) return;
    fetch(`/api/manage/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Booking not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Booking not found. Please check your link."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-AE", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-AE", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  async function handleCancel() {
    if (!token) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/manage/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const result = await res.json();
      if (res.ok) {
        setCancelResult({ success: true, message: result.message });
        fetchBooking(); // Refresh data
      } else {
        setCancelResult({ success: false, message: result.error });
      }
    } catch {
      setCancelResult({ success: false, message: "Something went wrong. Please try again." });
    }
    setCancelling(false);
  }

  async function handleDateChange(date: string) {
    setNewDate(date);
    setSelectedSlot("");
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/slots?date=${date}`);
      const result = await res.json();
      setAvailableSlots(result.slots || []);
    } catch {
      setAvailableSlots([]);
    }
    setLoadingSlots(false);
  }

  async function handleReschedule() {
    if (!token || !newDate || !selectedSlot) return;
    setRescheduling(true);
    try {
      const newSlotStart = `${newDate}T${selectedSlot}:00+04:00`;
      const res = await fetch(`/api/manage/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_slot_start: newSlotStart }),
      });
      const result = await res.json();
      if (res.ok) {
        setRescheduleResult({ success: true, message: result.message });
        setShowReschedule(false);
        fetchBooking();
      } else {
        setRescheduleResult({ success: false, message: result.error });
      }
    } catch {
      setRescheduleResult({ success: false, message: "Something went wrong." });
    }
    setRescheduling(false);
  }

  // Get min date for date picker (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-[3px] border-[rgb(244,244,244)] border-t-[rgb(147,216,216)] animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 px-6">
        <h1 className="text-[28px] font-normal tracking-[-0.04em] text-[rgb(61,61,61)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
          Booking Not Found
        </h1>
        <p className="text-[16px] text-[rgb(109,109,109)] mb-8" style={{ fontFamily: "var(--font-body)" }}>
          {error || "The link may have expired or is invalid."}
        </p>
        <Link href="/" className="text-[14px] hover:opacity-70 transition-opacity" style={{ fontFamily: "var(--font-body)", color: "rgb(60,140,130)" }}>
          Back to Home
        </Link>
      </div>
    );
  }

  const { booking, customer, can_cancel, can_reschedule, policy } = data;

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <h1 className="text-[28px] md:text-[36px] font-normal tracking-[-0.04em] text-[rgb(61,61,61)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
        Your Booking
      </h1>
      <p className="text-[14px] text-[rgb(153,153,153)] mb-8" style={{ fontFamily: "var(--font-body)" }}>
        {customer ? `Hi ${customer.name}` : "Manage your appointment"}
      </p>

      {/* Booking details card */}
      <div className="mb-6 p-6" style={CARD}>
        <div className="flex items-center justify-between mb-5">
          <span className="text-[13px] font-medium px-3 py-1 rounded-full" style={{
            fontFamily: "var(--font-badge)",
            background: `${STATUS_COLOR[booking.status] ?? "rgb(156,163,175)"}18`,
            color: STATUS_COLOR[booking.status] ?? "rgb(156,163,175)",
          }}>
            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
          </span>
          <span className="text-[12px] text-[rgb(180,180,180)]" style={{ fontFamily: "var(--font-body)" }}>
            #{booking.id.slice(0, 8)}
          </span>
        </div>

        {[
          { label: "Date", value: formatDate(booking.slot_start) },
          { label: "Time", value: `${formatTime(booking.slot_start)} — ${formatTime(booking.slot_end)}` },
          { label: "Address", value: booking.address },
        ].map((row) => (
          <div key={row.label} className="flex justify-between py-2.5" style={{ borderBottom: "1px solid rgb(245,246,248)" }}>
            <span className="text-[14px] text-[rgb(130,135,145)]" style={{ fontFamily: "var(--font-body)" }}>{row.label}</span>
            <span className="text-[14px] font-medium text-[rgb(61,61,61)] text-right max-w-[60%]" style={{ fontFamily: "var(--font-body)" }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Policy note */}
      <p className="text-[13px] text-[rgb(153,153,153)] mb-6 text-center" style={{ fontFamily: "var(--font-body)" }}>
        {policy}
      </p>

      {/* Success/error messages */}
      {cancelResult && (
        <div className={`mb-6 p-4 rounded-xl text-[14px] ${cancelResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} style={{ fontFamily: "var(--font-body)" }}>
          {cancelResult.message}
        </div>
      )}
      {rescheduleResult && (
        <div className={`mb-6 p-4 rounded-xl text-[14px] ${rescheduleResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} style={{ fontFamily: "var(--font-body)" }}>
          {rescheduleResult.message}
        </div>
      )}

      {/* Action buttons */}
      {booking.status === "confirmed" && (
        <div className="space-y-3">
          {can_reschedule && !showReschedule && (
            <button type="button" onClick={() => setShowReschedule(true)}
              className="w-full px-6 py-3.5 text-[16px] text-white hover:brightness-110 transition-all"
              style={BTN_PRIMARY}>
              Reschedule
            </button>
          )}

          {/* Reschedule picker */}
          {showReschedule && (
            <div className="p-5 mb-4" style={CARD}>
              <h3 className="text-[16px] font-medium text-[rgb(61,61,61)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
                Pick a new date & time
              </h3>
              <input type="date" min={minDate} value={newDate} onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border text-[14px] mb-3"
                style={{ borderColor: "rgb(220,224,230)", fontFamily: "var(--font-body)" }} />

              {loadingSlots && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 rounded-full border-[2px] border-[rgb(244,244,244)] border-t-[rgb(147,216,216)] animate-spin" />
                </div>
              )}

              {newDate && !loadingSlots && availableSlots.length === 0 && (
                <p className="text-[13px] text-[rgb(153,153,153)] text-center py-4" style={{ fontFamily: "var(--font-body)" }}>
                  No available slots on this date.
                </p>
              )}

              {availableSlots.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {availableSlots.map((slot) => (
                    <button key={slot} type="button" onClick={() => setSelectedSlot(slot)}
                      className="px-3 py-2 rounded-lg text-[13px] font-medium transition-all"
                      style={{
                        fontFamily: "var(--font-body)",
                        background: selectedSlot === slot ? "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))" : "rgb(247,248,250)",
                        color: selectedSlot === slot ? "white" : "rgb(61,61,61)",
                      }}>
                      {slot}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowReschedule(false)}
                  className="flex-1 px-4 py-3 text-[14px] rounded-full border hover:bg-gray-50 transition-colors"
                  style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)", borderColor: "rgb(220,224,230)" }}>
                  Cancel
                </button>
                <button type="button" onClick={handleReschedule} disabled={!selectedSlot || rescheduling}
                  className="flex-1 px-4 py-3 text-[14px] text-white rounded-full disabled:opacity-50 hover:brightness-110 transition-all"
                  style={BTN_PRIMARY}>
                  {rescheduling ? "..." : "Confirm"}
                </button>
              </div>
            </div>
          )}

          {can_cancel && (
            <button type="button" onClick={() => setShowCancelModal(true)}
              className="w-full px-6 py-3.5 text-[14px] text-[rgb(239,68,68)] hover:bg-red-50 transition-colors rounded-full border"
              style={{ fontFamily: "var(--font-cta)", borderColor: "rgb(239,68,68,0.3)" }}>
              Cancel Booking
            </button>
          )}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-md p-6" style={{ ...CARD, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <h3 className="text-[20px] font-normal tracking-[-0.03em] text-[rgb(61,61,61)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
              Cancel your booking?
            </h3>
            <p className="text-[14px] text-[rgb(109,109,109)] mb-5" style={{ fontFamily: "var(--font-body)" }}>
              A full refund will be issued to your original payment method within 5-10 business days.
            </p>
            <textarea
              placeholder="Reason for cancellation (optional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 rounded-xl border text-[14px] mb-5 resize-none"
              style={{ borderColor: "rgb(220,224,230)", fontFamily: "var(--font-body)" }}
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-3 text-[14px] rounded-full border hover:bg-gray-50 transition-colors"
                style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)", borderColor: "rgb(220,224,230)" }}>
                Go Back
              </button>
              <button type="button" onClick={handleCancel} disabled={cancelling}
                className="flex-1 px-4 py-3 text-[14px] text-white rounded-full disabled:opacity-50 hover:brightness-110 transition-all"
                style={BTN_DANGER}>
                {cancelling ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-10 text-center">
        <Link href="/" className="text-[13px] hover:opacity-70 transition-opacity" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}

export default function ManageBookingPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-[3px] border-[rgb(244,244,244)] border-t-[rgb(147,216,216)] animate-spin" />
      </div>
    }>
      <ManageContent />
    </Suspense>
  );
}
