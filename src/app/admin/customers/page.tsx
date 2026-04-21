"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  whatsapp_opt_in: boolean;
  last_booking: string | null;
  created_at: string;
  booking_count: number;
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const INPUT =
  "rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3.5 py-2 text-[13px] text-[rgb(61,61,61)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);

    const res = await fetch(`/api/admin/customers?${params}`);
    const data = await res.json();
    setCustomers(data.customers ?? []);
    setTotal(data.total);
    setPages(data.pages);
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-AE", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div>
      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(180,185,190)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className={`${INPUT} pl-10 w-full`}
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-white transition-all hover:brightness-110"
          style={{ background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))", fontFamily: "var(--font-cta)" }}
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
            className="text-[13px] font-medium hover:opacity-80 transition-opacity"
            style={{ fontFamily: "var(--font-cta)", color: "rgb(80,160,160)" }}
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.open("/api/admin/export?type=customers", "_blank")}
            className="px-3.5 py-2 rounded-[10px] border-2 text-[12px] font-medium hover:bg-[rgb(247,248,250)] transition-colors"
            style={{ fontFamily: "var(--font-cta)", borderColor: "rgb(230,230,230)", color: "rgb(100,105,115)" }}
          >
            Export CSV
          </button>
          <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
            {total} customer{total !== 1 ? "s" : ""}
          </span>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-hidden" style={CARD}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ background: "rgb(247,248,250)" }}>
              {["Name", "Phone", "Email", "Bookings", "WhatsApp", "Joined"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left font-medium border-b"
                  style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)", borderColor: "rgb(238,240,244)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <div className="flex justify-center">
                    <div className="w-6 h-6 rounded-full border-[3px] border-[rgb(238,240,244)] border-t-[rgb(147,216,216)] animate-spin" />
                  </div>
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                  {search ? "No customers match your search." : "No customers yet."}
                </td>
              </tr>
            ) : (
              customers.map((c, i) => (
                <tr
                  key={c.id}
                  className="transition-colors"
                  style={{ borderTop: i > 0 ? "1px solid rgb(245,246,248)" : undefined }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgb(250,251,252)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-5 py-3.5" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                    <span className="font-medium">{c.name}</span>
                  </td>
                  <td className="px-5 py-3.5" style={{ fontFamily: "var(--font-body)", color: "rgb(100,105,115)" }}>
                    <Link href={`tel:${c.phone}`} className="hover:underline">{c.phone}</Link>
                  </td>
                  <td className="px-5 py-3.5" style={{ fontFamily: "var(--font-body)", color: "rgb(100,105,115)" }}>
                    <Link href={`mailto:${c.email}`} className="hover:underline">{c.email}</Link>
                  </td>
                  <td className="px-5 py-3.5 text-center" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                    <span
                      className="inline-block min-w-[24px] text-[12px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: c.booking_count > 0 ? "rgba(147,216,216,0.15)" : "rgb(247,248,250)", color: c.booking_count > 0 ? "rgb(60,140,130)" : "rgb(180,185,190)" }}
                    >
                      {c.booking_count}
                    </span>
                  </td>
                  <td className="px-5 py-3.5" style={{ fontFamily: "var(--font-body)" }}>
                    {c.whatsapp_opt_in ? (
                      <span className="text-[12px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", color: "rgb(34,197,94)" }}>Yes</span>
                    ) : (
                      <span className="text-[12px]" style={{ color: "rgb(200,205,215)" }}>No</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                    {formatDate(c.created_at)}
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
