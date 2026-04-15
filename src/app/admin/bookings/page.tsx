"use client";

import { useState, useEffect, useCallback } from "react";

interface Booking {
  id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  status: string;
  payment_intent_id: string | null;
  created_at: string;
  customer_id: string;
  team_id: string | null;
}

const STATUS_OPTIONS = [
  "",
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "payment_failed",
  "expired",
  "failed",
];

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

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const INPUT =
  "rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px] text-[rgb(61,61,61)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (dateFilter) params.set("date", dateFilter);

    const res = await fetch(`/api/admin/bookings?${params}`);
    const data = await res.json();
    setBookings(data.bookings);
    setTotal(data.total);
    setPages(data.pages);
    setLoading(false);
  }, [page, statusFilter, dateFilter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-AE", {
        weekday: "short",
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
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          title="Filter by status"
          className={INPUT}
          style={{ fontFamily: "var(--font-body)" }}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
          title="Filter by date"
          className={INPUT}
          style={{ fontFamily: "var(--font-body)" }}
        />
        {(statusFilter || dateFilter) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("");
              setDateFilter("");
              setPage(1);
            }}
            className="text-[13px] font-medium hover:opacity-80 transition-opacity"
            style={{
              fontFamily: "var(--font-cta)",
              color: "rgb(80,160,160)",
            }}
          >
            Clear filters
          </button>
        )}
        <span
          className="ml-auto text-[13px]"
          style={{
            fontFamily: "var(--font-body)",
            color: "rgb(160,165,175)",
          }}
        >
          {total} booking{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden" style={CARD}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ background: "rgb(247,248,250)" }}>
              {["Time", "Address", "Status", "Team"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left font-medium border-b"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: "rgb(140,145,155)",
                    borderColor: "rgb(238,240,244)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <div className="flex justify-center">
                    <div className="w-6 h-6 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
                  </div>
                </td>
              </tr>
            ) : bookings.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-12 text-center text-[14px]"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: "rgb(160,165,175)",
                  }}
                >
                  No bookings found.
                </td>
              </tr>
            ) : (
              bookings.map((b, i) => (
                <tr
                  key={b.id}
                  className="transition-colors"
                  style={{
                    borderTop:
                      i > 0 ? "1px solid rgb(245,246,248)" : undefined,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgb(250,251,252)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <td
                    className="px-5 py-3.5 whitespace-nowrap"
                    style={{
                      fontFamily: "var(--font-body)",
                      color: "rgb(61,61,61)",
                    }}
                  >
                    {formatDateTime(b.slot_start)}
                  </td>
                  <td
                    className="px-5 py-3.5 truncate max-w-[300px]"
                    style={{
                      fontFamily: "var(--font-body)",
                      color: "rgb(100,105,115)",
                    }}
                  >
                    {b.address}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-[12px] font-medium px-2.5 py-1 rounded-full"
                      style={{
                        fontFamily: "var(--font-badge)",
                        background:
                          STATUS_BG[b.status] ?? "rgba(156,163,175,0.08)",
                        color: STATUS_DOT[b.status] ?? "rgb(156,163,175)",
                      }}
                    >
                      {b.status.replace("_", " ")}
                    </span>
                  </td>
                  <td
                    className="px-5 py-3.5 font-mono text-[12px]"
                    style={{
                      color: b.team_id
                        ? "rgb(100,105,115)"
                        : "rgb(190,195,205)",
                    }}
                  >
                    {b.team_id ? b.team_id.slice(0, 8) : "Unassigned"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-[10px] border-2 text-[13px] font-medium transition-colors disabled:opacity-30"
            style={{
              fontFamily: "var(--font-cta)",
              borderColor: "rgb(230,230,230)",
              color: "rgb(100,105,115)",
            }}
          >
            Previous
          </button>
          <span
            className="text-[13px]"
            style={{
              fontFamily: "var(--font-body)",
              color: "rgb(140,145,155)",
            }}
          >
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-[10px] border-2 text-[13px] font-medium transition-colors disabled:opacity-30"
            style={{
              fontFamily: "var(--font-cta)",
              borderColor: "rgb(230,230,230)",
              color: "rgb(100,105,115)",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
