"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const INPUT =
  "w-full rounded-[12px] border-2 border-[rgb(230,230,230)] bg-white px-4 py-3 text-[14px] text-[rgb(61,61,61)] placeholder:text-[rgb(185,185,185)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

const LABEL = "block text-[13px] font-medium text-[rgb(80,85,95)] mb-1.5";

const PLAN_OPTIONS = [
  { key: "essential", label: "Essential", rate: 349, setupMins: 45, perThermostatMins: 45 },
  { key: "signature", label: "Signature", rate: 549, setupMins: 80, perThermostatMins: 45 },
  { key: "elite",     label: "Elite",     rate: 649, setupMins: 80, perThermostatMins: 60 },
];

interface SlotResponse {
  slots: string[];
  total_teams: number;
}

export default function CreateBookingPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [planKey, setPlanKey] = useState("essential");
  const [thermostats, setThermostats] = useState(1);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ booking_id: string; team_id: string | null } | null>(null);

  const selectedPlan = PLAN_OPTIONS.find((p) => p.key === planKey) ?? PLAN_OPTIONS[0];
  const jobDurationMins = useMemo(
    () => selectedPlan.setupMins + selectedPlan.perThermostatMins * Math.max(1, thermostats),
    [selectedPlan, thermostats]
  );

  const fetchSlots = useCallback(async () => {
    if (!date) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot("");
    try {
      const params = new URLSearchParams({ date, job_duration_mins: String(jobDurationMins) });
      if (address.trim()) params.set("address", address.trim());
      const res = await fetch(`/api/slots?${params}`);
      if (!res.ok) {
        setSlots([]);
        return;
      }
      const data: SlotResponse = await res.json();
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [date, jobDurationMins, address]);

  useEffect(() => {
    if (date) fetchSlots();
  }, [date, fetchSlots]);

  function formatSlot(slot: string) {
    const [h, m] = slot.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      // UAE is UTC+4 year-round (matches UAE_TZ_SUFFIX in slot-helpers.ts)
      const slotStart = `${date}T${selectedSlot}:00+04:00`;

      const res = await fetch("/api/admin/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email || undefined,
          customer_phone: phone,
          address,
          slot_start: slotStart,
          plan: planKey,
          thermostats,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create booking.");
        return;
      }

      setSuccess({ booking_id: data.booking_id, team_id: data.team_id });
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const valid = name.trim() && phone.trim() && address.trim() && date && selectedSlot;

  if (success) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center" style={CARD}>
        <div
          className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ background: "rgba(34,197,94,0.1)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2
          className="text-[20px] font-normal tracking-[-0.03em] mb-2"
          style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
        >
          Booking Created
        </h2>
        <p className="text-[14px] mb-1" style={{ fontFamily: "var(--font-body)", color: "rgb(120,125,135)" }}>
          Team assigned: {success.team_id ? success.team_id.slice(0, 8) : "None"}
        </p>
        <p className="text-[12px] font-mono mb-6" style={{ color: "rgb(180,185,195)" }}>
          {success.booking_id}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => router.push(`/admin/bookings/${success.booking_id}`)}
            className="px-5 py-2.5 rounded-full text-[14px] font-medium text-white"
            style={{
              fontFamily: "var(--font-cta)",
              background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
            }}
          >
            View Booking
          </button>
          <button
            type="button"
            onClick={() => {
              setSuccess(null);
              setName("");
              setEmail("");
              setPhone("");
              setAddress("");
              setNotes("");
              setDate("");
              setSelectedSlot("");
            }}
            className="px-5 py-2.5 rounded-full text-[14px] font-medium border-2"
            style={{
              fontFamily: "var(--font-cta)",
              borderColor: "rgb(230,230,230)",
              color: "rgb(100,105,115)",
            }}
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-[18px] font-normal tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
        >
          Create Manual Booking
        </h2>
        <button
          type="button"
          onClick={() => router.push("/admin/bookings")}
          className="text-[13px] font-medium hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--font-cta)", color: "rgb(80,160,160)" }}
        >
          Back to Bookings
        </button>
      </div>

      <div className="p-6 space-y-5" style={CARD}>
        {/* Customer info */}
        <div>
          <p className="text-[14px] font-medium mb-3" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
            Customer Details
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Name *</label>
              <input className={INPUT} style={{ fontFamily: "var(--font-body)" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Phone *</label>
              <input className={INPUT} style={{ fontFamily: "var(--font-body)" }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971..." />
            </div>
            <div className="col-span-2">
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Email (optional)</label>
              <input className={INPUT} style={{ fontFamily: "var(--font-body)" }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" />
            </div>
          </div>
        </div>

        <hr style={{ borderColor: "rgb(245,246,248)" }} />

        {/* Address */}
        <div>
          <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Address *</label>
          <input className={INPUT} style={{ fontFamily: "var(--font-body)" }} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" />
        </div>

        <hr style={{ borderColor: "rgb(245,246,248)" }} />

        {/* Plan & Schedule */}
        <div>
          <p className="text-[14px] font-medium mb-3" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
            Service & Schedule
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Plan *</label>
              <select
                className={INPUT}
                style={{ fontFamily: "var(--font-body)" }}
                value={planKey}
                onChange={(e) => setPlanKey(e.target.value)}
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} — AED {p.rate}/unit
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Thermostats *</label>
              <input
                className={INPUT}
                style={{ fontFamily: "var(--font-body)" }}
                type="number"
                min={1}
                max={50}
                value={thermostats}
                onChange={(e) => setThermostats(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div>
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Date *</label>
              <input className={INPUT} style={{ fontFamily: "var(--font-body)" }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Computed Duration</label>
              <div
                className="rounded-[12px] border-2 border-[rgb(238,240,244)] bg-[rgb(247,248,250)] px-4 py-3 text-[14px]"
                style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}
              >
                {jobDurationMins} min ({selectedPlan.label})
              </div>
            </div>
          </div>

          {date && (
            <div className="mt-3">
              <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Available Slots</label>
              {loadingSlots ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 rounded-full border-[2px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
                </div>
              ) : slots.length === 0 ? (
                <p className="text-[13px] py-3" style={{ fontFamily: "var(--font-body)", color: "rgb(200,160,160)" }}>
                  No available slots for this date.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedSlot(s)}
                      className="px-3.5 py-2 rounded-[10px] text-[13px] font-medium transition-all"
                      style={{
                        fontFamily: "var(--font-body)",
                        background: selectedSlot === s
                          ? "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))"
                          : "rgb(247,248,250)",
                        color: selectedSlot === s ? "white" : "rgb(80,85,95)",
                        border: selectedSlot === s ? "none" : "1px solid rgb(238,240,244)",
                      }}
                    >
                      {formatSlot(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <hr style={{ borderColor: "rgb(245,246,248)" }} />

        {/* Notes */}
        <div>
          <label className={LABEL} style={{ fontFamily: "var(--font-body)" }}>Internal Notes</label>
          <textarea
            className={INPUT}
            style={{ fontFamily: "var(--font-body)", minHeight: 80, resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes (internal only)"
          />
        </div>

        {error && (
          <div className="p-3 rounded-[10px]" style={{ background: "rgba(239,68,68,0.08)" }}>
            <p className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(239,68,68)" }}>{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!valid || submitting}
          className="w-full py-3.5 rounded-full text-[15px] font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            fontFamily: "var(--font-cta)",
            background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
            boxShadow: "0px 4px 8px rgba(0,0,0,0.12)",
          }}
        >
          {submitting ? "Creating..." : "Create Booking"}
        </button>
      </div>
    </form>
  );
}
