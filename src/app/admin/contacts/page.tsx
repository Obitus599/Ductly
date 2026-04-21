"use client";

import { useState, useEffect, useCallback } from "react";

interface Submission {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
}

interface Subscriber {
  id: string;
  email: string;
  subscribed_at: string;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

export default function ContactsPage() {
  const [tab, setTab] = useState<"submissions" | "newsletter">("submissions");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), tab });
    const res = await fetch(`/api/admin/contacts?${params}`);
    const data = await res.json();

    if (tab === "newsletter") {
      setSubscribers(data.subscribers ?? []);
    } else {
      setSubmissions(data.submissions ?? []);
    }
    setTotal(data.total);
    setPages(data.pages);
    setLoading(false);
  }, [page, tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-AE", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit", hour12: true })
    );
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 p-1 rounded-[12px] inline-flex" style={{ background: "rgb(247,248,250)" }}>
        {(["submissions", "newsletter"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className="px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all"
            style={{
              fontFamily: "var(--font-cta)",
              background: tab === t ? "white" : "transparent",
              color: tab === t ? "rgb(61,61,61)" : "rgb(160,165,175)",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {t === "submissions" ? "Contact Forms" : "Newsletter"}
          </button>
        ))}
      </div>

      <span className="ml-4 text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
        {total} {tab === "newsletter" ? "subscriber" : "submission"}{total !== 1 ? "s" : ""}
      </span>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12 mt-4">
          <div className="w-6 h-6 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
        </div>
      ) : tab === "newsletter" ? (
        /* Newsletter Table */
        <div className="overflow-hidden mt-4" style={CARD}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "rgb(247,248,250)" }}>
                {["Email", "Subscribed"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-medium border-b"
                    style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)", borderColor: "rgb(238,240,244)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscribers.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-5 py-12 text-center text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                    No subscribers yet.
                  </td>
                </tr>
              ) : (
                subscribers.map((s, i) => (
                  <tr key={s.id} style={{ borderTop: i > 0 ? "1px solid rgb(245,246,248)" : undefined }}
                    className="transition-colors"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgb(250,251,252)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-5 py-3.5" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{s.email}</td>
                    <td className="px-5 py-3.5" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>{formatDateTime(s.subscribed_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Contact Submissions */
        <div className="space-y-3 mt-4">
          {submissions.length === 0 ? (
            <div className="py-16 text-center" style={CARD}>
              <p className="text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                No contact submissions yet.
              </p>
            </div>
          ) : (
            submissions.map((s) => (
              <div key={s.id} style={CARD} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[14px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                      {s.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>{s.email}</span>
                      {s.phone && (
                        <>
                          <span className="text-[12px]" style={{ color: "rgb(220,225,230)" }}>&middot;</span>
                          <span className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>{s.phone}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[12px] shrink-0" style={{ fontFamily: "var(--font-body)", color: "rgb(200,205,215)" }}>
                    {formatDateTime(s.created_at)}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>
                  {s.message}
                </p>
              </div>
            ))
          )}
        </div>
      )}

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
