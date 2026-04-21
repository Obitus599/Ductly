"use client";

import { useState } from "react";
import { PLANS } from "@/app/book/shared";

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

interface PlanSettings {
  rate: number;
  setupMins: number;
  perThermostatMins: number;
}

/**
 * Settings page — displays current hardcoded config values as a reference.
 * These values are compiled into the code (shared.tsx, slot-helpers.ts, etc.)
 * and require a code change + redeploy to modify.
 *
 * This page serves as a central view of all business rules.
 */
export default function SettingsPage() {
  const [copied, setCopied] = useState("");

  // Derive from the single source of truth in shared.tsx
  const plans: Record<string, PlanSettings> = Object.fromEntries(
    Object.values(PLANS).map((p) => [
      p.name,
      { rate: p.rate, setupMins: p.setupMins, perThermostatMins: p.perThermostatMins },
    ])
  );

  const scheduling = [
    { label: "Working Hours", value: "08:00 – 18:00", code: "DAY_START_HOUR / DAY_END_HOUR" },
    { label: "Slot Increment", value: "30 minutes", code: "SLOT_INCREMENT_MINS" },
    { label: "Minimum Travel Buffer", value: "20 minutes", code: "MINIMUM_TRAVEL_BUFFER_MINS" },
    { label: "Default Job Duration", value: "90 minutes", code: "DEFAULT_JOB_DURATION_MINS" },
    { label: "Booking Lock TTL", value: "10 minutes", code: "booking_locks.expires_at" },
    { label: "Work Week", value: "Sunday – Thursday (days 0–4)", code: "team_schedules.day_of_week" },
  ];

  const policies = [
    { label: "Customer Cancel Window", value: "24 hours before slot", code: "manage/[token]/cancel" },
    { label: "Customer Reschedule Window", value: "24 hours before slot", code: "manage/[token]/reschedule" },
    { label: "Admin Cancel", value: "No time restriction", code: "admin/bookings/[id]/cancel" },
    { label: "Stale Booking Cleanup", value: "15 minutes (pending)", code: "STALE_BOOKING_TTL_MINS" },
    { label: "Rate Limit: Checkout", value: "10 per 5 minutes per IP", code: "checkout/route.ts" },
    { label: "Rate Limit: Cancel", value: "5 per 5 minutes per IP", code: "manage/[token]/cancel" },
    { label: "Rate Limit: Reschedule", value: "5 per 5 minutes per IP", code: "manage/[token]/reschedule" },
  ];

  const integrations = [
    { label: "Stripe", env: "STRIPE_SECRET_KEY", status: "Required" },
    { label: "Stripe Webhook", env: "STRIPE_WEBHOOK_SECRET", status: "Required" },
    { label: "Supabase", env: "NEXT_PUBLIC_SUPABASE_URL", status: "Required" },
    { label: "Google Maps (Server)", env: "GOOGLE_MAPS_API_KEY", status: "Optional — fallback: flat 20-min buffer" },
    { label: "Google Maps (Client)", env: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", status: "Optional — fallback: text address input" },
    { label: "OpenRouter (AI Agent)", env: "OPENROUTER_API_KEY", status: "Optional — fallback: least-booked team" },
    { label: "n8n: Booking Confirmed", env: "N8N_WEBHOOK_BOOKING_CONFIRMED", status: "Optional — no notification if unset" },
    { label: "n8n: Payment Failed", env: "N8N_WEBHOOK_PAYMENT_FAILED", status: "Optional — no notification if unset" },
    { label: "n8n: Team Dispatch", env: "N8N_WEBHOOK_TEAM_DISPATCH", status: "Optional — no notification if unset" },
  ];

  function copyValue(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div className="max-w-3xl">
      {/* Info banner */}
      <div
        className="p-4 rounded-[12px] mb-6 flex items-start gap-3"
        style={{ background: "rgba(147,216,216,0.08)", border: "1px solid rgba(147,216,216,0.2)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(80,160,160)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(60,140,130)" }}>
          These values are currently hardcoded in the application. To change them, update the source code and redeploy.
          A future update will make these configurable from this page.
        </p>
      </div>

      {/* Pricing */}
      <div className="p-5 mb-6" style={CARD}>
        <h3 className="text-[16px] font-normal tracking-[-0.02em] mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
          Pricing & Duration
        </h3>
        <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: "rgb(238,240,244)" }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "rgb(247,248,250)" }}>
                {["Plan", "Rate / Thermostat", "Setup Time", "Per Thermostat", "Example (2 units)"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(plans).map(([name, p]) => {
                const exampleDuration = p.setupMins + p.perThermostatMins * 2;
                return (
                  <tr key={name} style={{ borderTop: "1px solid rgb(245,246,248)" }}>
                    <td className="px-4 py-2.5 font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{name}</td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>AED {p.rate}</td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>{p.setupMins} min</td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>{p.perThermostatMins} min</td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>{exampleDuration} min / AED {p.rate * 2}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] mt-2" style={{ fontFamily: "var(--font-body)", color: "rgb(180,185,195)" }}>
          Source: src/app/book/shared.tsx
        </p>
      </div>

      {/* Scheduling */}
      <div className="p-5 mb-6" style={CARD}>
        <h3 className="text-[16px] font-normal tracking-[-0.02em] mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
          Scheduling Rules
        </h3>
        <div className="space-y-3">
          {scheduling.map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <div>
                <p className="text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{item.label}</p>
                <p className="text-[11px] font-mono" style={{ color: "rgb(190,195,205)" }}>{item.code}</p>
              </div>
              <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Policies */}
      <div className="p-5 mb-6" style={CARD}>
        <h3 className="text-[16px] font-normal tracking-[-0.02em] mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
          Policies & Rate Limits
        </h3>
        <div className="space-y-3">
          {policies.map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <div>
                <p className="text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{item.label}</p>
                <p className="text-[11px] font-mono" style={{ color: "rgb(190,195,205)" }}>{item.code}</p>
              </div>
              <span className="text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Integrations */}
      <div className="p-5" style={CARD}>
        <h3 className="text-[16px] font-normal tracking-[-0.02em] mb-4" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
          Integrations
        </h3>
        <div className="space-y-3">
          {integrations.map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1">
              <div className="min-w-0">
                <p className="text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{item.label}</p>
                <button
                  type="button"
                  onClick={() => copyValue(item.env, item.label)}
                  className="text-[11px] font-mono hover:opacity-70 transition-opacity"
                  style={{ color: "rgb(147,216,216)" }}
                  title="Click to copy env var name"
                >
                  {copied === item.label ? "Copied!" : item.env}
                </button>
              </div>
              <span className="text-[12px] shrink-0" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>{item.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
