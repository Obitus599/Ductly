"use client";

import { useState, useEffect, useCallback } from "react";

interface ErrorEntry {
  id: string;
  flow_name: string;
  error_message: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const INPUT =
  "rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px] text-[rgb(61,61,61)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [flows, setFlows] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [flowFilter, setFlowFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (flowFilter) params.set("flow", flowFilter);

    const res = await fetch(`/api/admin/errors?${params}`);
    const data = await res.json();
    setErrors(data.errors ?? []);
    setFlows(data.flows ?? []);
    setTotal(data.total);
    setPages(data.pages);
    setLoading(false);
  }, [page, flowFilter]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-AE", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    );
  }

  const FLOW_COLORS: Record<string, string> = {
    stripe_webhook: "rgb(99,91,255)",
    team_assignment: "rgb(147,216,216)",
    reschedule_team_assignment: "rgb(234,179,8)",
    payment_failed: "rgb(239,68,68)",
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select
          value={flowFilter}
          onChange={(e) => { setFlowFilter(e.target.value); setPage(1); }}
          className={INPUT}
          style={{ fontFamily: "var(--font-body)" }}
          title="Filter by flow"
        >
          <option value="">All flows</option>
          {flows.map((f) => (
            <option key={f} value={f}>{f.replace(/_/g, " ")}</option>
          ))}
        </select>
        {flowFilter && (
          <button type="button" onClick={() => { setFlowFilter(""); setPage(1); }}
            className="text-[13px] font-medium hover:opacity-80 transition-opacity"
            style={{ fontFamily: "var(--font-cta)", color: "rgb(80,160,160)" }}>
            Clear
          </button>
        )}
        <span className="ml-auto text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
          {total} error{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Error List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
          </div>
        ) : errors.length === 0 ? (
          <div className="py-16 text-center" style={CARD}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgb(34,197,94)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
              No errors recorded. System is healthy.
            </p>
          </div>
        ) : (
          errors.map((err) => (
            <div key={err.id} style={CARD} className="overflow-hidden">
              <button
                type="button"
                className="w-full px-5 py-4 text-left flex items-start gap-4 transition-colors hover:bg-[rgb(250,251,252)]"
                onClick={() => setExpanded(expanded === err.id ? null : err.id)}
              >
                {/* Flow badge */}
                <span
                  className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full mt-0.5"
                  style={{
                    fontFamily: "var(--font-badge)",
                    background: `${FLOW_COLORS[err.flow_name] ?? "rgb(130,135,145)"}15`,
                    color: FLOW_COLORS[err.flow_name] ?? "rgb(130,135,145)",
                  }}
                >
                  {err.flow_name.replace(/_/g, " ")}
                </span>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                    {err.error_message}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,190)" }}>
                    {formatDateTime(err.created_at)}
                  </p>
                </div>

                {/* Expand icon */}
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(200,205,210)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`shrink-0 mt-1 transition-transform ${expanded === err.id ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Expanded payload */}
              {expanded === err.id && err.payload && (
                <div className="px-5 pb-4 pt-0">
                  <div className="rounded-[10px] p-4 overflow-x-auto" style={{ background: "rgb(247,248,250)" }}>
                    <pre className="text-[12px] font-mono whitespace-pre-wrap" style={{ color: "rgb(80,85,95)" }}>
                      {JSON.stringify(err.payload, null, 2)}
                    </pre>
                  </div>
                </div>
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
