"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Stats {
  total_bookings: number;
  today_bookings: number;
  pending: number;
  confirmed: number;
  active_teams: number;
  total_teams: number;
}

interface Workload {
  team_id: string;
  team_name: string;
  bookings_this_week: number;
  bookings_this_month: number;
}

interface Booking {
  id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  status: string;
  team_id: string | null;
}

/* ─── Shared styles ──────────────────────────────────────────────────── */

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

/* ─── Component ──────────────────────────────────────────────────────── */

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setWorkloads(data.workloads);
        setRecentBookings(data.recent_bookings);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div
          className="w-8 h-8 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  const statCards = [
    {
      label: "Today's Bookings",
      value: stats?.today_bookings ?? 0,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(147,216,216)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      label: "Pending",
      value: stats?.pending ?? 0,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(234,179,8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      label: "Confirmed",
      value: stats?.confirmed ?? 0,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      label: "Active Teams",
      value: `${stats?.active_teams ?? 0}/${stats?.total_teams ?? 0}`,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(149,207,140)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
  ];

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-AE", {
        month: "short",
        day: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-AE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    );
  }

  return (
    <div>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="p-5"
            style={CARD}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[13px]"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "rgb(140,145,155)",
                }}
              >
                {card.label}
              </span>
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center"
                style={{ background: "rgb(247,248,250)" }}
              >
                {card.icon}
              </div>
            </div>
            <p
              className="text-[28px] font-normal tracking-[-0.04em]"
              style={{
                fontFamily: "var(--font-heading)",
                color: "rgb(61,61,61)",
              }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Bookings */}
        <div className="lg:col-span-2" style={CARD}>
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "rgb(238,240,244)" }}
          >
            <h2
              className="text-[16px] font-normal tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-heading)",
                color: "rgb(61,61,61)",
              }}
            >
              Recent Bookings
            </h2>
            <Link
              href="/admin/bookings"
              className="text-[13px] font-medium hover:opacity-80 transition-opacity"
              style={{
                fontFamily: "var(--font-cta)",
                color: "rgb(80,160,160)",
              }}
            >
              View all
            </Link>
          </div>
          <div>
            {recentBookings.length === 0 ? (
              <p
                className="px-5 py-12 text-center text-[14px]"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "rgb(160,165,175)",
                }}
              >
                No bookings yet.
              </p>
            ) : (
              recentBookings.map((b, i) => (
                <div
                  key={b.id}
                  className="px-5 py-3.5 flex items-center justify-between"
                  style={{
                    borderTop: i > 0 ? "1px solid rgb(245,246,248)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: STATUS_DOT[b.status] ?? "rgb(156,163,175)",
                      }}
                    />
                    <div className="min-w-0">
                      <p
                        className="text-[14px] font-medium"
                        style={{
                          fontFamily: "var(--font-body)",
                          color: "rgb(61,61,61)",
                        }}
                      >
                        {formatDateTime(b.slot_start)}
                      </p>
                      <p
                        className="text-[12px] mt-0.5 truncate max-w-[280px]"
                        style={{
                          fontFamily: "var(--font-body)",
                          color: "rgb(160,165,175)",
                        }}
                      >
                        {b.address}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[12px] font-medium px-2.5 py-1 rounded-full shrink-0"
                    style={{
                      fontFamily: "var(--font-badge)",
                      background: STATUS_BG[b.status] ?? "rgba(156,163,175,0.08)",
                      color: STATUS_DOT[b.status] ?? "rgb(156,163,175)",
                    }}
                  >
                    {b.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team Workloads */}
        <div style={CARD}>
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "rgb(238,240,244)" }}
          >
            <h2
              className="text-[16px] font-normal tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-heading)",
                color: "rgb(61,61,61)",
              }}
            >
              Team Workloads
            </h2>
            <Link
              href="/admin/teams"
              className="text-[13px] font-medium hover:opacity-80 transition-opacity"
              style={{
                fontFamily: "var(--font-cta)",
                color: "rgb(80,160,160)",
              }}
            >
              Manage
            </Link>
          </div>
          <div>
            {workloads.length === 0 ? (
              <p
                className="px-5 py-12 text-center text-[14px]"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "rgb(160,165,175)",
                }}
              >
                No team data.
              </p>
            ) : (
              workloads.map((w, i) => (
                <div
                  key={w.team_id}
                  className="px-5 py-4"
                  style={{
                    borderTop: i > 0 ? "1px solid rgb(245,246,248)" : undefined,
                  }}
                >
                  <p
                    className="text-[14px] font-medium"
                    style={{
                      fontFamily: "var(--font-body)",
                      color: "rgb(61,61,61)",
                    }}
                  >
                    {w.team_name}
                  </p>
                  <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-[4px] h-[16px] rounded-full"
                        style={{ background: "rgb(147,216,216)" }}
                      />
                      <span
                        className="text-[12px]"
                        style={{
                          fontFamily: "var(--font-body)",
                          color: "rgb(140,145,155)",
                        }}
                      >
                        Week: {w.bookings_this_week}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-[4px] h-[16px] rounded-full"
                        style={{ background: "rgb(149,207,140)" }}
                      />
                      <span
                        className="text-[12px]"
                        style={{
                          fontFamily: "var(--font-body)",
                          color: "rgb(140,145,155)",
                        }}
                      >
                        Month: {w.bookings_this_month}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
