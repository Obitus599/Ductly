"use client";

import { useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface GeoResult {
  lat: number;
  lng: number;
  formatted: string;
}

interface TravelResult {
  origin: GeoResult;
  destination: GeoResult;
  origin_geohash: string;
  dest_geohash: string;
  distance_km: number;
  duration_normal_mins: number;
  duration_traffic_mins: number;
  traffic_model: string;
  departure_time: string;
  day_of_week: string;
  time_bucket: string;
  buffer_mins: number;
  total_blocked_mins: number;
}

interface HistoryEntry extends TravelResult {
  /** Stable key for React rendering */
  _key: string;
}

/* ─── Shared styles ──────────────────────────────────────────────────── */

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const INPUT: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  border: "2px solid rgb(238,240,244)",
  borderRadius: 10,
  padding: "10px 14px",
  width: "100%",
  outline: "none",
  color: "rgb(61,61,61)",
  transition: "border-color 0.2s",
};

const LABEL: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "rgb(130,135,145)",
  fontWeight: 500,
  display: "block",
  marginBottom: 6,
};

/* ─── Component ──────────────────────────────────────────────────────── */

export default function TravelCalculatorPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [trafficModel, setTrafficModel] = useState("pessimistic");
  const [departureTime, setDepartureTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TravelResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  async function calculate() {
    if (!origin.trim() || !destination.trim()) {
      setError("Both origin and destination are required.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const body: Record<string, string> = {
        origin: origin.trim(),
        destination: destination.trim(),
        traffic_model: trafficModel,
      };
      if (departureTime) body.departure_time = new Date(departureTime).toISOString();

      const res = await fetch("/api/admin/travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Calculation failed.");
        return;
      }

      setResult(data);
      const entry: HistoryEntry = {
        ...data,
        _key: `${data.origin_geohash}-${data.dest_geohash}-${Date.now()}`,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 20));
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function swapAddresses() {
    const tmp = origin;
    setOrigin(destination);
    setDestination(tmp);
  }

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Input Form ─────────────────────────────────── */}
        <div style={CARD} className="p-6">
          <h2
            className="text-[16px] font-normal tracking-[-0.02em] mb-5"
            style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
          >
            Travel Time Calculator
          </h2>

          <div className="space-y-4">
            <div>
              <label style={LABEL}>Origin Address</label>
              <input
                style={INPUT}
                placeholder="e.g. Al Barsha 2, Dubai, UAE"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && calculate()}
              />
            </div>

            <div className="flex justify-center">
              <button
                onClick={swapAddresses}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: "rgb(247,248,250)", border: "1px solid rgb(238,240,244)" }}
                title="Swap addresses"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(130,135,145)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            <div>
              <label style={LABEL}>Destination Address</label>
              <input
                style={INPUT}
                placeholder="e.g. Dubai Marina, Dubai, UAE"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && calculate()}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={LABEL}>Traffic Model</label>
                <select
                  style={{ ...INPUT, cursor: "pointer" }}
                  value={trafficModel}
                  onChange={(e) => setTrafficModel(e.target.value)}
                >
                  <option value="pessimistic">Pessimistic (worst case)</option>
                  <option value="best_guess">Best Guess (average)</option>
                  <option value="optimistic">Optimistic (best case)</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>Departure Time</label>
                <input
                  style={INPUT}
                  type="datetime-local"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div
                className="rounded-[10px] p-3 text-[13px]"
                style={{
                  background: "rgb(255,245,245)",
                  border: "1px solid rgb(255,200,200)",
                  color: "rgb(180,60,60)",
                  fontFamily: "var(--font-body)",
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={calculate}
              disabled={loading}
              className="w-full py-3 text-[14px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
                borderRadius: 10,
                fontFamily: "var(--font-cta)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Calculating...
                </span>
              ) : (
                "Calculate Travel Time"
              )}
            </button>
          </div>
        </div>

        {/* ── Map + Result ──────────────────────────────── */}
        <div className="space-y-4">
          <div style={CARD} className="overflow-hidden">
            {result ? (
              <div>
                {/* Address summary (no API key exposure) */}
                <div className="h-[200px] flex items-center justify-center relative" style={{ background: "linear-gradient(135deg, rgb(247,248,250), rgb(240,248,248))" }}>
                  <div className="text-center px-6">
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <span
                        className="inline-block w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center"
                        style={{ background: "rgb(34,197,94)", color: "white", fontFamily: "var(--font-badge)" }}
                      >
                        A
                      </span>
                      <p className="text-[13px] max-w-[200px] truncate" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                        {result.origin.formatted.split(",").slice(0, 2).join(",")}
                      </p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(200,205,210)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                    <div className="flex items-center justify-center gap-3">
                      <span
                        className="inline-block w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center"
                        style={{ background: "rgb(239,68,68)", color: "white", fontFamily: "var(--font-badge)" }}
                      >
                        B
                      </span>
                      <p className="text-[13px] max-w-[200px] truncate" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                        {result.destination.formatted.split(",").slice(0, 2).join(",")}
                      </p>
                    </div>
                  </div>
                  {/* Distance badge */}
                  <div
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-[12px] font-medium"
                    style={{ background: "white", border: "1px solid rgb(238,240,244)", fontFamily: "var(--font-badge)", color: "rgb(61,61,61)" }}
                  >
                    {result.distance_km} km
                  </div>
                </div>

                {/* Result breakdown */}
                <div className="p-5">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-[12px] mb-1" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                        Distance
                      </p>
                      <p className="text-[22px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
                        {result.distance_km}<span className="text-[13px] ml-0.5">km</span>
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[12px] mb-1" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                        Travel Time
                      </p>
                      <p className="text-[22px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
                        {result.duration_traffic_mins}<span className="text-[13px] ml-0.5">min</span>
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[12px] mb-1" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                        Total Block
                      </p>
                      <p className="text-[22px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(147,216,216)" }}>
                        {result.total_blocked_mins}<span className="text-[13px] ml-0.5">min</span>
                      </p>
                    </div>
                  </div>

                  {/* Detail rows */}
                  <div className="space-y-2">
                    {[
                      { label: "Normal duration", value: `${result.duration_normal_mins} min` },
                      { label: `Traffic (${result.traffic_model})`, value: `${result.duration_traffic_mins} min`, highlight: true },
                      { label: "Safety buffer", value: `+${result.buffer_mins} min` },
                      { label: "Origin geohash", value: result.origin_geohash, mono: true },
                      { label: "Dest geohash", value: result.dest_geohash, mono: true },
                      { label: "Day / bucket", value: `${result.day_of_week} · ${result.time_bucket}` },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between py-2 px-3 rounded-[8px]"
                        style={{ background: row.highlight ? "rgba(147,216,216,0.08)" : "rgb(247,248,250)" }}
                      >
                        <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}>
                          {row.label}
                        </span>
                        <span
                          className="text-[13px] font-medium"
                          style={{
                            fontFamily: row.mono ? "monospace" : "var(--font-body)",
                            color: row.highlight ? "rgb(60,140,130)" : "rgb(61,61,61)",
                          }}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t" style={{ borderColor: "rgb(238,240,244)" }}>
                    <p className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,190)" }}>
                      The slot system blocks <strong style={{ color: "rgb(61,61,61)" }}>{result.total_blocked_mins} minutes</strong> total
                      ({result.duration_traffic_mins} min travel + {result.buffer_mins} min buffer) to ensure no scheduling conflicts.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center" style={{ background: "rgb(247,248,250)" }}>
                <div className="text-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgb(220,225,230)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <p className="text-[14px]" style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,190)" }}>
                    Enter two addresses to calculate travel time
                  </p>
                  <p className="text-[12px] mt-1" style={{ fontFamily: "var(--font-body)", color: "rgb(200,205,210)" }}>
                    Results will show route, distance, and slot blocking
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Calculation History ─────────────────────────── */}
      {history.length > 0 && (
        <div style={CARD} className="mt-6">
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "rgb(238,240,244)" }}
          >
            <h2
              className="text-[16px] font-normal tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
            >
              Calculation History
            </h2>
            <button
              onClick={() => setHistory([])}
              className="text-[12px] hover:opacity-70 transition-opacity"
              style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,190)" }}
            >
              Clear
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "rgb(247,248,250)" }}>
                  {["Origin", "Destination", "Distance", "Normal", "Traffic", "Buffer", "Total Block", "Model", "Day"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[12px] font-medium"
                      style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr
                    key={r._key}
                    className="transition-colors hover:bg-[rgb(250,251,252)]"
                    style={{ borderTop: "1px solid rgb(245,246,248)" }}
                  >
                    <td className="px-4 py-3 text-[13px] max-w-[160px] truncate" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                      {r.origin.formatted.split(",").slice(0, 2).join(",")}
                    </td>
                    <td className="px-4 py-3 text-[13px] max-w-[160px] truncate" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                      {r.destination.formatted.split(",").slice(0, 2).join(",")}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                      {r.distance_km} km
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                      {r.duration_normal_mins} min
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                      {r.duration_traffic_mins} min
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                      +{r.buffer_mins} min
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(60,140,130)" }}>
                      {r.total_blocked_mins} min
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                      {r.traffic_model}
                    </td>
                    <td className="px-4 py-3 text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                      {r.day_of_week}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
