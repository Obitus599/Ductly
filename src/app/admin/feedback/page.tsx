"use client";

import { useState, useEffect, useCallback } from "react";

interface FeedbackEntry {
  id: string;
  booking_id: string;
  customer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  customer_name: string;
  customer_email: string;
  team_id: string | null;
  team_name: string;
  address: string;
  slot_start: string;
}

interface TeamSummary {
  team_id: string;
  team_name: string;
  avg_rating: number;
  review_count: number;
}

interface TeamOption {
  id: string;
  name: string;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const INPUT =
  "rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px] text-[rgb(61,61,61)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="14" height="14" viewBox="0 0 24 24" fill={n <= rating ? "rgb(234,179,8)" : "none"} stroke={n <= rating ? "rgb(234,179,8)" : "rgb(220,225,230)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [summary, setSummary] = useState<TeamSummary[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState("");

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (teamFilter) params.set("team_id", teamFilter);

    const res = await fetch(`/api/admin/feedback?${params}`);
    const data = await res.json();
    setFeedback(data.feedback ?? []);
    setSummary(data.summary ?? []);
    setTeams(data.teams ?? []);
    setTotal(data.total);
    setPages(data.pages);
    setLoading(false);
  }, [page, teamFilter]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-AE", { month: "short", day: "numeric", year: "numeric" });
  }

  const avgAll = summary.length > 0
    ? (summary.reduce((sum, s) => sum + s.avg_rating * s.review_count, 0) / summary.reduce((sum, s) => sum + s.review_count, 0)).toFixed(1)
    : "—";

  const totalReviews = summary.reduce((sum, s) => sum + s.review_count, 0);

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-5" style={CARD}>
          <p className="text-[13px] mb-2" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>Overall Rating</p>
          <p className="text-[28px] font-normal tracking-[-0.04em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(234,179,8)" }}>{avgAll}</p>
        </div>
        <div className="p-5" style={CARD}>
          <p className="text-[13px] mb-2" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>Total Reviews</p>
          <p className="text-[28px] font-normal tracking-[-0.04em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>{totalReviews}</p>
        </div>
        {summary.slice(0, 2).map((s) => (
          <div key={s.team_id} className="p-5" style={CARD}>
            <p className="text-[13px] mb-2" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>{s.team_name}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[28px] font-normal tracking-[-0.04em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>{Number(s.avg_rating).toFixed(1)}</p>
              <span className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,190)" }}>{s.review_count} reviews</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select
          value={teamFilter}
          onChange={(e) => { setTeamFilter(e.target.value); setPage(1); }}
          className={INPUT}
          style={{ fontFamily: "var(--font-body)" }}
          title="Filter by team"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {teamFilter && (
          <button type="button" onClick={() => { setTeamFilter(""); setPage(1); }}
            className="text-[13px] font-medium hover:opacity-80 transition-opacity"
            style={{ fontFamily: "var(--font-cta)", color: "rgb(80,160,160)" }}>
            Clear
          </button>
        )}
        <span className="ml-auto text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
          {total} review{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
          </div>
        ) : feedback.length === 0 ? (
          <div className="py-16 text-center" style={CARD}>
            <p className="text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
              No feedback yet.
            </p>
          </div>
        ) : (
          feedback.map((f) => (
            <div key={f.id} style={CARD} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-[14px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                      {f.customer_name}
                    </p>
                    <Stars rating={f.rating} />
                  </div>
                  <p className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                    {f.team_name} &middot; {f.slot_start ? formatDate(f.slot_start) : "Unknown date"}
                  </p>
                </div>
                <span className="text-[12px] shrink-0" style={{ fontFamily: "var(--font-body)", color: "rgb(200,205,215)" }}>
                  {formatDate(f.created_at)}
                </span>
              </div>
              {f.comment && (
                <p className="text-[13px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>
                  &ldquo;{f.comment}&rdquo;
                </p>
              )}
              {f.address && (
                <p className="text-[12px] mt-2" style={{ fontFamily: "var(--font-body)", color: "rgb(190,195,205)" }}>
                  {f.address}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-[10px] border-2 text-[13px] font-medium transition-colors disabled:opacity-30"
            style={{ fontFamily: "var(--font-cta)", borderColor: "rgb(230,230,230)", color: "rgb(100,105,115)" }}>
            Previous
          </button>
          <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
            Page {page} of {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-[10px] border-2 text-[13px] font-medium transition-colors disabled:opacity-30"
            style={{ fontFamily: "var(--font-cta)", borderColor: "rgb(230,230,230)", color: "rgb(100,105,115)" }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
