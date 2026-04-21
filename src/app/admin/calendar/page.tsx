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
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/calendar?date=${date}`);
    const data = await res.json();
    setTeams(data.teams ?? []);
    setBookings(data.bookings ?? []);
    setLoading(false);
  }, [date]);

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
      </div>

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
    </div>
  );
}
