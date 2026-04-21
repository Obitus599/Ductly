"use client";

import { useState, useEffect, useCallback } from "react";

interface Summary {
  total_bookings: number;
  paid_bookings: number;
  cancelled: number;
  failed: number;
  status_counts: Record<string, number>;
}

interface DailyEntry {
  date: string;
  total: number;
  paid: number;
  cancelled: number;
}

interface RecentPaid {
  id: string;
  status: string;
  created_at: string;
  slot_start: string;
  payment_intent_id: string | null;
  customers: { name: string; email: string } | null;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const PERIODS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
];

export default function RevenuePage() {
  const [period, setPeriod] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [recentPaid, setRecentPaid] = useState<RecentPaid[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/revenue?period=${period}`);
    const data = await res.json();
    setSummary(data.summary);
    setDaily(data.daily ?? []);
    setRecentPaid(data.recent_paid ?? []);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxDaily = Math.max(...daily.map((d) => d.total), 1);

  function formatDate(iso: string) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-AE", { month: "short", day: "numeric" });
  }

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-AE", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit", hour12: true })
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Bookings", value: summary?.total_bookings ?? 0, color: "rgb(61,61,61)" },
    { label: "Paid / Confirmed", value: summary?.paid_bookings ?? 0, color: "rgb(34,197,94)" },
    { label: "Cancelled", value: summary?.cancelled ?? 0, color: "rgb(156,163,175)" },
    { label: "Failed", value: summary?.failed ?? 0, color: "rgb(239,68,68)" },
  ];

  return (
    <div>
      {/* Period selector */}
      <div className="flex items-center gap-2 mb-6">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className="px-4 py-2 rounded-full text-[13px] font-medium transition-all"
            style={{
              fontFamily: "var(--font-cta)",
              background: period === p.value
                ? "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))"
                : "white",
              color: period === p.value ? "white" : "rgb(100,105,115)",
              border: period === p.value ? "none" : "2px solid rgb(230,230,230)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div
        className="p-3 rounded-[10px] mb-4 flex items-center gap-2"
        style={{ background: "rgba(147,216,216,0.08)", border: "1px solid rgba(147,216,216,0.18)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(80,160,160)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(60,140,130)" }}>
          Showing booking counts. Actual AED revenue is tracked in your Stripe dashboard.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="p-5" style={CARD}>
            <p
              className="text-[13px] mb-2"
              style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}
            >
              {card.label}
            </p>
            <p
              className="text-[28px] font-normal tracking-[-0.04em]"
              style={{ fontFamily: "var(--font-heading)", color: card.color }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="p-5 mb-6" style={CARD}>
        <h3
          className="text-[15px] font-normal tracking-[-0.02em] mb-4"
          style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
        >
          Daily Bookings
        </h3>
        <div className="flex items-end gap-[2px] h-[160px] overflow-x-auto">
          {daily.map((d) => {
            const paidH = (d.paid / maxDaily) * 140;
            const cancelH = (d.cancelled / maxDaily) * 140;
            const otherH = ((d.total - d.paid - d.cancelled) / maxDaily) * 140;

            return (
              <div
                key={d.date}
                className="flex-1 min-w-[4px] max-w-[16px] flex flex-col justify-end items-stretch gap-[1px]"
                title={`${formatDate(d.date)}: ${d.total} bookings (${d.paid} paid, ${d.cancelled} cancelled)`}
              >
                {otherH > 0 && (
                  <div
                    className="rounded-t-[2px]"
                    style={{ height: otherH, background: "rgb(234,179,8)", opacity: 0.6 }}
                  />
                )}
                {cancelH > 0 && (
                  <div style={{ height: cancelH, background: "rgb(200,205,215)" }} />
                )}
                {paidH > 0 && (
                  <div
                    className="rounded-b-[2px]"
                    style={{ height: Math.max(paidH, 2), background: "rgb(147,216,216)" }}
                  />
                )}
                {d.total === 0 && (
                  <div className="rounded-[2px]" style={{ height: 2, background: "rgb(238,240,244)" }} />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-5 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-[3px]" style={{ background: "rgb(147,216,216)" }} />
            <span className="text-[11px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>Paid</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-[3px]" style={{ background: "rgb(200,205,215)" }} />
            <span className="text-[11px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>Cancelled</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-[3px]" style={{ background: "rgb(234,179,8)", opacity: 0.6 }} />
            <span className="text-[11px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>Pending</span>
          </div>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="p-5" style={CARD}>
          <h3
            className="text-[15px] font-normal tracking-[-0.02em] mb-4"
            style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
          >
            Status Breakdown
          </h3>
          <div className="space-y-2">
            {Object.entries(summary?.status_counts ?? {})
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => {
                const pct = summary?.total_bookings
                  ? Math.round((count / summary.total_bookings) * 100)
                  : 0;
                const colors: Record<string, string> = {
                  confirmed: "rgb(34,197,94)",
                  completed: "rgb(59,130,246)",
                  pending: "rgb(234,179,8)",
                  cancelled: "rgb(156,163,175)",
                  no_show: "rgb(239,68,68)",
                  payment_failed: "rgb(239,68,68)",
                  expired: "rgb(180,185,195)",
                  failed: "rgb(239,68,68)",
                };
                return (
                  <div key={status}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[13px] capitalize" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>
                        {status.replace("_", " ")}
                      </span>
                      <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-[6px] rounded-full bg-[rgb(245,246,248)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: colors[status] ?? "rgb(180,185,195)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Recent paid */}
        <div style={CARD}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "rgb(238,240,244)" }}>
            <h3
              className="text-[15px] font-normal tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
            >
              Recent Paid Bookings
            </h3>
          </div>
          <div>
            {recentPaid.length === 0 ? (
              <p className="px-5 py-8 text-center text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                No paid bookings in this period.
              </p>
            ) : (
              recentPaid.map((b, i) => (
                <div
                  key={b.id}
                  className="px-5 py-3 flex items-center justify-between"
                  style={{ borderTop: i > 0 ? "1px solid rgb(245,246,248)" : undefined }}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                      {b.customers?.name ?? "Unknown"}
                    </p>
                    <p className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                      {formatDateTime(b.slot_start)}
                    </p>
                  </div>
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: "rgb(160,165,175)" }}
                  >
                    {b.payment_intent_id?.slice(0, 15)}...
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
