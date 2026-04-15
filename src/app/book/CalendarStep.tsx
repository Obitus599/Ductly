"use client";

import { CARD, formatSlot, formatDate } from "./shared";

interface CalendarStepProps {
  plan: { name: string; rate: number; duration: number };
  viewMonth: number;
  viewYear: number;
  setViewMonth: (v: number) => void;
  setViewYear: (v: number) => void;
  selectedDate: string;
  setSelectedDate: (v: string) => void;
  minDate: string;
  slots: string[];
  totalTeams: number;
  loadingSlots: boolean;
  fetchSlots: (date: string) => void;
  selectSlot: (slot: string) => void;
  lockingSlot: string | null;
  onBack: () => void;
}

export default function CalendarStep({
  plan, viewMonth, viewYear, setViewMonth, setViewYear,
  selectedDate, setSelectedDate, minDate, slots, totalTeams,
  loadingSlots, fetchSlots, selectSlot, lockingSlot, onBack,
}: CalendarStepProps) {
  return (
    <div className="overflow-hidden" style={CARD}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-7 py-5 border-b"
        style={{ borderColor: "rgb(238,240,244)" }}
      >
        <div>
          <h2
            className="text-[20px] font-normal tracking-[-0.03em] text-[rgb(61,61,61)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Choose Date &amp; Time
          </h2>
          <p
            className="text-[13px] mt-0.5"
            style={{ fontFamily: "var(--font-body)", color: "rgb(170,175,185)" }}
          >
            {plan.name} Plan &middot; {plan.duration} min service
          </p>
        </div>
        <button
          type="button" onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] hover:opacity-70 transition-opacity"
          style={{ color: "rgb(100,170,160)", fontFamily: "var(--font-body)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Edit details
        </button>
      </div>

      <div className="flex flex-col md:flex-row min-h-[420px]">
        {/* ── Calendar ── */}
        <div
          className="p-6 md:w-[340px] shrink-0 md:border-r border-b md:border-b-0"
          style={{ borderColor: "rgb(238,240,244)" }}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
                else setViewMonth(viewMonth - 1);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[rgb(245,246,248)] transition-colors"
              style={{ color: "rgb(130,135,145)" }}
              aria-label="Previous month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span
              className="text-[15px] font-medium tracking-[-0.01em]"
              style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
            >
              {new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
                else setViewMonth(viewMonth + 1);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[rgb(245,246,248)] transition-colors"
              style={{ color: "rgb(130,135,145)" }}
              aria-label="Next month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="text-center text-[11px] font-medium py-2 uppercase tracking-wide"
                style={{ fontFamily: "var(--font-body)", color: "rgb(170,175,185)" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {(() => {
              const firstDay = new Date(viewYear, viewMonth, 1).getDay();
              const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
              const cells: React.ReactNode[] = [];
              const todayStr = new Date().toISOString().split("T")[0];

              for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} />);

              for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const dayOfWeek = new Date(viewYear, viewMonth, d).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isPast = dateStr < minDate || isWeekend;
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === todayStr;

                cells.push(
                  <button
                    key={d} type="button" disabled={isPast}
                    onClick={() => { setSelectedDate(dateStr); fetchSlots(dateStr); }}
                    className="relative aspect-square flex items-center justify-center text-[13px] rounded-full transition-all mx-auto w-[38px] h-[38px]"
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: isSelected ? 600 : isToday ? 500 : 400,
                      background: isSelected ? "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))" : "transparent",
                      color: isSelected ? "white" : isPast ? "rgb(215,215,215)" : isToday ? "rgb(60,140,130)" : "rgb(61,61,61)",
                      cursor: isPast ? "default" : "pointer",
                    }}
                    onMouseEnter={(e) => { if (!isPast && !isSelected) e.currentTarget.style.background = "rgb(243,253,253)"; }}
                    onMouseLeave={(e) => { if (!isPast && !isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    {d}
                    {isToday && !isSelected && (
                      <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: "rgb(147,216,216)" }} />
                    )}
                  </button>
                );
              }
              return cells;
            })()}
          </div>
        </div>

        {/* ── Time Slots ── */}
        <div className="flex-1 p-6">
          {loadingSlots ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
              <div className="w-7 h-7 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
              <p className="text-[13px] mt-3" style={{ fontFamily: "var(--font-body)", color: "rgb(170,175,185)" }}>
                Checking availability&hellip;
              </p>
            </div>
          ) : selectedDate && slots.length > 0 ? (
            <div>
              <p className="text-[15px] font-medium mb-0.5" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
                {formatDate(selectedDate)}
              </p>
              <p className="text-[13px] mb-5" style={{ fontFamily: "var(--font-body)", color: "rgb(170,175,185)" }}>
                {totalTeams} team{totalTeams !== 1 ? "s" : ""} available
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {slots.map((slot) => (
                  <button
                    key={slot} type="button" onClick={() => selectSlot(slot)}
                    disabled={!!lockingSlot}
                    className="w-full text-center px-4 py-3 rounded-[10px] border-2 text-[14px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: "rgb(238,240,244)", background: "white", color: "rgb(61,61,61)", fontFamily: "var(--font-body)" }}
                    onMouseEnter={(e) => { if (!lockingSlot) { e.currentTarget.style.borderColor = "rgb(147,216,216)"; e.currentTarget.style.background = "rgba(147,216,216,0.06)"; e.currentTarget.style.color = "rgb(60,140,130)"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgb(238,240,244)"; e.currentTarget.style.background = "white"; e.currentTarget.style.color = "rgb(61,61,61)"; }}
                  >
                    {lockingSlot === slot ? "Reserving..." : formatSlot(slot)}
                  </button>
                ))}
              </div>
            </div>
          ) : selectedDate && !loadingSlots ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgb(215,220,230)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="10" y1="14" x2="14" y2="18" /><line x1="14" y1="14" x2="10" y2="18" />
              </svg>
              <p className="text-[14px] mt-4" style={{ fontFamily: "var(--font-body)", color: "rgb(150,155,165)" }}>
                No available slots on this date
              </p>
              <p className="text-[12px] mt-1" style={{ fontFamily: "var(--font-body)", color: "rgb(190,195,205)" }}>
                We operate Monday through Friday
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgb(215,220,230)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <p className="text-[14px] mt-4" style={{ fontFamily: "var(--font-body)", color: "rgb(150,155,165)" }}>
                Select a date to view available times
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
