"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/** UAE is UTC+4 year-round. Matches UAE_OFFSET_HOURS in slot-helpers.ts. */
const UAE_OFFSET = 4;

interface Team {
  id: string;
  name: string;
}

interface CalendarBooking {
  id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  status: string;
  team_id: string | null;
  customers: { name: string; phone: string } | null;
}

interface Blackout {
  id: string;
  team_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "rgb(234,179,8)",
  confirmed: "rgb(34,197,94)",
  completed: "rgb(59,130,246)",
  no_show: "rgb(239,68,68)",
};

const STATUS_BG: Record<string, string> = {
  pending: "rgba(234,179,8,0.12)",
  confirmed: "rgba(34,197,94,0.12)",
  completed: "rgba(59,130,246,0.12)",
  no_show: "rgba(239,68,68,0.12)",
};

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const DAY_START = 8;  // 08:00
const DAY_END = 18;   // 18:00
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => i + DAY_START);
const HOUR_HEIGHT = 80; // px per hour
const HEADER_HEIGHT = 48;

function toUAEMins(iso: string): number {
  const d = new Date(iso);
  const uaeH = (d.getUTCHours() + UAE_OFFSET) % 24;
  return uaeH * 60 + d.getUTCMinutes();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const uaeH = (d.getUTCHours() + UAE_OFFSET) % 24;
  const m = d.getUTCMinutes();
  const ampm = uaeH >= 12 ? "PM" : "AM";
  const h12 = uaeH % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [teams, setTeams] = useState<Team[]>([]);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [loading, setLoading] = useState(true);

  // Block-time modal state
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockTeamId, setBlockTeamId] = useState<string>("");
  const [blockStartDate, setBlockStartDate] = useState("");
  const [blockStartTime, setBlockStartTime] = useState("08:00");
  const [blockEndDate, setBlockEndDate] = useState("");
  const [blockEndTime, setBlockEndTime] = useState("18:00");
  const [blockReason, setBlockReason] = useState("");
  const [blockSubmitting, setBlockSubmitting] = useState(false);
  const [blockError, setBlockError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [calRes, bRes] = await Promise.all([
      fetch(`/api/admin/calendar?date=${date}`),
      fetch(`/api/admin/schedule-blackouts?from=${date}&to=${date}`),
    ]);
    const calData = await calRes.json();
    const bData = await bRes.json();
    setTeams(calData.teams ?? []);
    setBookings(calData.bookings ?? []);
    setBlackouts(bData.blackouts ?? []);
    setLoading(false);
  }, [date]);

  function openBlockModal() {
    setBlockTeamId("");
    setBlockStartDate(date);
    setBlockStartTime("08:00");
    setBlockEndDate(date);
    setBlockEndTime("18:00");
    setBlockReason("");
    setBlockError("");
    setShowBlockModal(true);
  }

  async function submitBlock() {
    if (blockSubmitting) return;
    if (!blockReason.trim()) {
      setBlockError("Reason is required.");
      return;
    }
    const starts_at = `${blockStartDate}T${blockStartTime}:00+04:00`;
    const ends_at = `${blockEndDate}T${blockEndTime}:00+04:00`;
    if (new Date(ends_at) <= new Date(starts_at)) {
      setBlockError("End must be after start.");
      return;
    }
    setBlockSubmitting(true);
    setBlockError("");
    try {
      const res = await fetch("/api/admin/schedule-blackouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: blockTeamId || null,
          starts_at,
          ends_at,
          reason: blockReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlockError(
          data.conflicts?.length
            ? `${data.error} (${data.conflicts.length} conflicting booking${data.conflicts.length > 1 ? "s" : ""})`
            : data.error || "Failed to block time."
        );
        return;
      }
      setShowBlockModal(false);
      await fetchData();
    } catch {
      setBlockError("Network error.");
    } finally {
      setBlockSubmitting(false);
    }
  }

  async function deleteBlackout(id: string) {
    if (!confirm("Remove this blocked time? This will free up the slot for bookings.")) return;
    await fetch(`/api/admin/schedule-blackouts/${id}`, { method: "DELETE" });
    await fetchData();
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const unassigned = bookings.filter((b) => !b.team_id);

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  }

  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-AE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const columns = [
    ...teams.map((t) => ({ id: t.id, label: t.name })),
    ...(unassigned.length > 0 ? [{ id: "__unassigned__", label: "Unassigned" }] : []),
  ];

  return (
    <div>
      {/* Date navigation */}
      <div className="flex items-center gap-4 mb-5">
        <button
          type="button"
          onClick={() => shiftDate(-1)}
          className="w-9 h-9 rounded-[10px] border-2 flex items-center justify-center hover:bg-[rgb(247,248,250)] transition-colors"
          style={{ borderColor: "rgb(230,230,230)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(100,105,115)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div>
          <h2
            className="text-[16px] font-normal tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
          >
            {displayDate}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => shiftDate(1)}
          className="w-9 h-9 rounded-[10px] border-2 flex items-center justify-center hover:bg-[rgb(247,248,250)] transition-colors"
          style={{ borderColor: "rgb(230,230,230)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(100,105,115)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="ml-2 rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px] text-[rgb(61,61,61)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        />
        <button
          type="button"
          onClick={() => setDate(new Date().toISOString().split("T")[0])}
          className="text-[13px] font-medium hover:opacity-80 transition-opacity"
          style={{ fontFamily: "var(--font-cta)", color: "rgb(80,160,160)" }}
        >
          Today
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={openBlockModal}
            className="text-[13px] font-medium px-4 py-2 rounded-[10px] text-white hover:brightness-110 transition-all"
            style={{
              background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
              fontFamily: "var(--font-cta)",
            }}
          >
            + Block time
          </button>
        </div>
      </div>

      {/* Active blackouts on this date */}
      {blackouts.length > 0 && (
        <div className="mb-5 rounded-[14px] border-2 p-4" style={{ background: "rgb(252,250,240)", borderColor: "rgb(245,225,140)" }}>
          <p className="text-[12px] mb-2 font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(140,110,20)" }}>
            Blocked time on this date
          </p>
          <ul className="space-y-1.5">
            {blackouts.map((bo) => {
              const teamName = bo.team_id ? teams.find((t) => t.id === bo.team_id)?.name ?? "Unknown team" : "All teams";
              return (
                <li key={bo.id} className="flex items-center justify-between gap-3 text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(80,80,80)" }}>
                  <span>
                    <strong>{teamName}</strong> · {formatTime(bo.starts_at)} – {formatTime(bo.ends_at)} · {bo.reason}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteBlackout(bo.id)}
                    className="text-[12px] px-2.5 py-1 rounded-[6px] hover:bg-[rgba(180,60,60,0.08)] transition-colors"
                    style={{ fontFamily: "var(--font-cta)", color: "rgb(180,60,60)" }}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
        </div>
      ) : columns.length === 0 ? (
        <div className="py-20 text-center" style={CARD}>
          <p className="text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
            No active teams scheduled for this day.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto" style={CARD}>
          <div className="min-w-[600px]">
            {/* Column headers */}
            <div className="flex border-b" style={{ borderColor: "rgb(238,240,244)" }}>
              <div
                className="shrink-0 w-[70px] px-3 flex items-center"
                style={{ height: HEADER_HEIGHT, fontFamily: "var(--font-body)", color: "rgb(160,165,175)", fontSize: 12 }}
              >
                Time
              </div>
              {columns.map((col) => (
                <div
                  key={col.id}
                  className="flex-1 min-w-[160px] px-3 flex items-center border-l"
                  style={{
                    height: HEADER_HEIGHT,
                    borderColor: "rgb(245,246,248)",
                    fontFamily: "var(--font-body)",
                    color: "rgb(61,61,61)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {col.label}
                </div>
              ))}
            </div>

            {/* Timeline grid */}
            <div className="flex relative">
              {/* Time labels */}
              <div className="shrink-0 w-[70px]">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="border-b relative"
                    style={{
                      height: HOUR_HEIGHT,
                      borderColor: "rgb(248,249,250)",
                    }}
                  >
                    <span
                      className="absolute top-[-8px] left-3 text-[11px]"
                      style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,195)" }}
                    >
                      {h > 12 ? h - 12 : h}:00 {h >= 12 ? "PM" : "AM"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Team columns */}
              {columns.map((col) => {
                const colBookings = col.id === "__unassigned__"
                  ? unassigned
                  : bookings.filter((b) => b.team_id === col.id);

                return (
                  <div
                    key={col.id}
                    className="flex-1 min-w-[160px] border-l relative"
                    style={{ borderColor: "rgb(245,246,248)" }}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="border-b"
                        style={{ height: HOUR_HEIGHT, borderColor: "rgb(248,249,250)" }}
                      />
                    ))}

                    {/* Booking blocks */}
                    {colBookings.map((b) => {
                      const startMins = toUAEMins(b.slot_start);
                      let endMins = toUAEMins(b.slot_end);
                      // Handle midnight wrap (end time crosses into next UAE day)
                      if (endMins < startMins) endMins += 24 * 60;

                      // Clamp to visible grid range (DAY_START – DAY_END)
                      const gridStart = DAY_START * 60;
                      const gridEnd = DAY_END * 60;
                      const clampedStart = Math.max(startMins, gridStart);
                      const clampedEnd = Math.min(endMins, gridEnd);
                      if (clampedStart >= clampedEnd) return null; // fully outside range

                      const topPx = ((clampedStart - gridStart) / 60) * HOUR_HEIGHT;
                      const heightPx = Math.max(((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT - 4, 24);

                      return (
                        <div
                          key={b.id}
                          className="absolute left-1 right-1 rounded-[8px] px-2 py-1.5 cursor-pointer hover:brightness-95 transition-all overflow-hidden"
                          style={{
                            top: topPx + 2,
                            height: heightPx,
                            background: STATUS_BG[b.status] ?? "rgba(156,163,175,0.1)",
                            borderLeft: `3px solid ${STATUS_COLOR[b.status] ?? "rgb(156,163,175)"}`,
                          }}
                          onClick={() => router.push(`/admin/bookings/${b.id}`)}
                          title={`${b.customers?.name ?? "Unknown"} — ${b.address}`}
                        >
                          <p
                            className="text-[11px] font-medium truncate"
                            style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}
                          >
                            {b.customers?.name ?? "Unknown"}
                          </p>
                          <p
                            className="text-[10px] truncate"
                            style={{ fontFamily: "var(--font-body)", color: "rgb(120,125,135)" }}
                          >
                            {formatTime(b.slot_start)} – {formatTime(b.slot_end)}
                          </p>
                          {heightPx > 44 && (
                            <p
                              className="text-[10px] truncate mt-0.5"
                              style={{ fontFamily: "var(--font-body)", color: "rgb(155,160,170)" }}
                            >
                              {b.address}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Block-time modal */}
      {showBlockModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => !blockSubmitting && setShowBlockModal(false)}
        >
          <div
            className="w-full max-w-[460px] p-6 rounded-[16px]"
            style={{ background: "white", border: "2px solid rgb(238,240,244)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-[18px] font-normal tracking-[-0.02em] mb-1"
              style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
            >
              Block time
            </h2>
            <p
              className="text-[12px] mb-5"
              style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}
            >
              Prevents new bookings inside this range. Existing bookings in the same window must be cancelled first.
            </p>

            <div className="space-y-3 mb-5">
              <label className="block">
                <span className="block text-[12px] mb-1.5" style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)" }}>
                  Team
                </span>
                <select
                  value={blockTeamId}
                  onChange={(e) => setBlockTeamId(e.target.value)}
                  className="w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px] focus:border-[rgb(147,216,216)] focus:outline-none"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <option value="">All teams (global blackout)</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[12px] mb-1.5" style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)" }}>
                    Start date
                  </span>
                  <input
                    type="date"
                    value={blockStartDate}
                    onChange={(e) => setBlockStartDate(e.target.value)}
                    className="w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px]"
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] mb-1.5" style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)" }}>
                    Start time
                  </span>
                  <input
                    type="time"
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px]"
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] mb-1.5" style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)" }}>
                    End date
                  </span>
                  <input
                    type="date"
                    value={blockEndDate}
                    onChange={(e) => setBlockEndDate(e.target.value)}
                    className="w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px]"
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] mb-1.5" style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)" }}>
                    End time
                  </span>
                  <input
                    type="time"
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    className="w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px]"
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-[12px] mb-1.5" style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)" }}>
                  Reason
                </span>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Public holiday, team training"
                  maxLength={500}
                  className="w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px] focus:border-[rgb(147,216,216)] focus:outline-none"
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </label>
            </div>

            {blockError && (
              <div
                className="mb-4 rounded-[10px] p-3 text-[12px]"
                style={{ background: "rgb(255,245,245)", border: "1px solid rgb(255,200,200)", color: "rgb(180,60,60)", fontFamily: "var(--font-body)" }}
              >
                {blockError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                disabled={blockSubmitting}
                className="px-4 py-2 rounded-[10px] border-2 border-[rgb(230,230,230)] text-[13px] text-[rgb(109,109,109)] hover:bg-[rgb(247,248,250)] transition-colors disabled:opacity-50"
                style={{ fontFamily: "var(--font-cta)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitBlock}
                disabled={blockSubmitting}
                className="px-4 py-2 rounded-[10px] text-white text-[13px] hover:brightness-110 transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
                  fontFamily: "var(--font-cta)",
                }}
              >
                {blockSubmitting ? "Blocking…" : "Block time"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
