"use client";

import { useState, useEffect } from "react";
import { PLANS, type PlanConfig } from "@/lib/pricing";

const CARD: React.CSSProperties = {
  background: "white",
  border: "2px solid rgb(238,240,244)",
  borderRadius: 16,
};

const INPUT_CLASS =
  "w-full rounded-[10px] border-2 border-[rgb(230,230,230)] bg-white px-3 py-2 text-[13px] text-[rgb(61,61,61)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

interface PlanRate {
  key: string;
  label: string;
  rate: number;
  setupMins: number;
  perThermostatMins: number;
}

interface DiscountRuleView {
  id: number;
  discount_percent: number;
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
}

interface DiscountCodeView {
  code: string;
  discount_percent: number;
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  issued_to_email: string | null;
  created_at: string | null;
}

export default function SettingsPage() {
  const [copied, setCopied] = useState("");
  const [rates, setRates] = useState<PlanRate[]>([]);
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  /* discount generator state */
  const [rule, setRule] = useState<DiscountRuleView | null>(null);
  const [codes, setCodes] = useState<DiscountCodeView[]>([]);
  const [ruleDraft, setRuleDraft] = useState<{ discount_percent: string; max_uses: string; expires_at: string }>({
    discount_percent: "50",
    max_uses: "",
    expires_at: "",
  });
  const [savingRule, setSavingRule] = useState(false);
  const [ruleMsg, setRuleMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/discounts")
      .then((r) => r.json())
      .then((data) => {
        if (data.rule) {
          setRule(data.rule);
          setRuleDraft({
            discount_percent: String(data.rule.discount_percent ?? 50),
            max_uses: data.rule.max_uses == null ? "" : String(data.rule.max_uses),
            expires_at: data.rule.expires_at ? String(data.rule.expires_at).slice(0, 10) : "",
          });
        }
        setCodes(data.codes ?? []);
      })
      .catch(() => {});

    fetch("/api/admin/settings/pricing")
      .then((r) => r.json())
      .then((data) => {
        const dbRates = (data.pricing ?? []) as { plan_key: string; rate: number }[];
        const merged = Object.values(PLANS).map((p) => {
          const db = dbRates.find((r: { plan_key: string }) => r.plan_key === p.key);
          return {
            key: p.key,
            label: p.label,
            rate: db ? db.rate : p.rate,
            setupMins: p.setupMins,
            perThermostatMins: p.perThermostatMins,
          };
        });
        setRates(merged);
        const init: Record<string, number> = {};
        merged.forEach((p) => { init[p.key] = p.rate; });
        setEditing(init);
      })
      .catch(() => {
        const fallback = Object.values(PLANS).map((p) => ({
          key: p.key,
          label: p.label,
          rate: p.rate,
          setupMins: p.setupMins,
          perThermostatMins: p.perThermostatMins,
        }));
        setRates(fallback);
        const init: Record<string, number> = {};
        fallback.forEach((p) => { init[p.key] = p.rate; });
        setEditing(init);
      });
  }, []);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const ratesPayload: Record<string, number> = {};
      rates.forEach((p) => {
        ratesPayload[p.key] = editing[p.key] ?? p.rate;
      });
      const res = await fetch("/api/admin/settings/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: ratesPayload }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveMsg(data.error || "Save failed."); return; }
      const updated = (data.pricing ?? []) as { plan_key: string; rate: number }[];
      setRates((prev) =>
        prev.map((p) => {
          const u = updated.find((r) => r.plan_key === p.key);
          return u ? { ...p, rate: u.rate } : p;
        })
      );
      setSaveMsg("Rates updated. Changes take effect within 60 seconds.");
    } catch {
      setSaveMsg("Network error.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 4000);
    }
  }

  function copyValue(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  async function saveRule() {
    if (savingRule) return;
    setSavingRule(true);
    setRuleMsg("");
    try {
      const percent = Math.max(1, Math.min(100, Math.floor(Number(ruleDraft.discount_percent) || 1)));
      const res = await fetch("/api/admin/discounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discount_percent: percent,
          max_uses: ruleDraft.max_uses ? Math.max(0, Math.floor(Number(ruleDraft.max_uses) || 0)) : null,
          expires_at: ruleDraft.expires_at ? new Date(ruleDraft.expires_at + "T23:59:59").toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRuleMsg(data.error || "Save failed."); return; }
      setRule(data.rule ?? rule);
      setRuleMsg("Campaign rule updated.");
    } catch {
      setRuleMsg("Network error.");
    } finally {
      setSavingRule(false);
      setTimeout(() => setRuleMsg(""), 4000);
    }
  }

  async function generateCode() {
    const res = await fetch("/api/admin/discounts/generate", { method: "POST" });
    const data = await res.json();
    if (res.ok && data.code) {
      setCodes((prev) => [data.code, ...prev]);
      setRuleMsg(`Generated ${data.code.code}`);
    } else {
      setRuleMsg(data.error || "Generate failed.");
    }
    setTimeout(() => setRuleMsg(""), 4000);
  }

  async function toggleCode(code: string, active: boolean) {
    const res = await fetch(`/api/admin/discounts/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (res.ok) {
      setCodes((prev) => prev.map((c) => (c.code === code ? { ...c, active: !active } : c)));
    }
  }

  async function resetCode(code: string) {
    await fetch(`/api/admin/discounts/${encodeURIComponent(code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    setCodes((prev) => prev.map((c) => (c.code === code ? { ...c, used_count: 0 } : c)));
  }

  async function deleteCode(code: string) {
    await fetch(`/api/admin/discounts/${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    setCodes((prev) => prev.map((c) => (c.code === code ? { ...c, active: false } : c)));
  }

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
    { label: "Google Maps (Server)", env: "GOOGLE_MAPS_API_KEY", status: "Optional" },
    { label: "Google Maps (Client)", env: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", status: "Optional" },
    { label: "OpenRouter (AI Agent)", env: "OPENROUTER_API_KEY", status: "Optional" },
    { label: "n8n: Booking Confirmed", env: "N8N_WEBHOOK_BOOKING_CONFIRMED", status: "Optional" },
    { label: "n8n: Payment Failed", env: "N8N_WEBHOOK_PAYMENT_FAILED", status: "Optional" },
    { label: "n8n: Team Dispatch", env: "N8N_WEBHOOK_TEAM_DISPATCH", status: "Optional" },
  ];

  const hasDbConfig = rates.length > 0;

  return (
    <div className="max-w-3xl">

      {/* Pricing — now configurable */}
      <div className="p-5 mb-6" style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-normal tracking-[-0.02em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
            Pricing & Duration
          </h3>
          {hasDbConfig && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{ fontFamily: "var(--font-cta)", background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))" }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
        {saveMsg && (
          <div className="mb-3 text-[12px] px-3 py-2 rounded-[8px]" style={{ fontFamily: "var(--font-body)", background: "rgba(34,197,94,0.08)", color: "rgb(34,160,84)" }}>
            {saveMsg}
          </div>
        )}
        <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: "rgb(238,240,244)" }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "rgb(247,248,250)" }}>
                {["Plan", "Rate / Thermostat (AED)", "Setup Time", "Per Thermostat", "Example (2 units)"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(hasDbConfig ? rates : Object.values(PLANS).map((p) => ({
                key: p.key, label: p.label, rate: p.rate, setupMins: p.setupMins, perThermostatMins: p.perThermostatMins,
              }))).map((p) => {
                const currentRate = hasDbConfig ? (editing[p.key] ?? p.rate) : p.rate;
                const exampleDuration = p.setupMins + p.perThermostatMins * 2;
                return (
                  <tr key={p.key} style={{ borderTop: "1px solid rgb(245,246,248)" }}>
                    <td className="px-4 py-2.5 font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>{p.label}</td>
                    <td className="px-4 py-2.5">
                      {hasDbConfig ? (
                        <input
                          type="number"
                          className={INPUT_CLASS}
                          style={{ fontFamily: "var(--font-body)", width: 100 }}
                          value={editing[p.key] ?? p.rate}
                          min={1}
                          max={100000}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [p.key]: Math.max(1, Number(e.target.value) || 1) }))}
                        />
                      ) : (
                        <span style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>AED {p.rate}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>{p.setupMins} min</td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>{p.perThermostatMins} min</td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                      {exampleDuration} min / AED {currentRate * 2}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] mt-2" style={{ fontFamily: "var(--font-body)", color: "rgb(160,160,160)" }}>
          {hasDbConfig
            ? "Rates are stored in the database. Changes take effect after save."
            : "Rates are loaded from compile-time defaults. Add the pricing_config table to enable editing."}
        </p>
      </div>

      {/* Discount Codes — campaign rule + generator */}
      <div className="p-5 mb-6" style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-normal tracking-[-0.02em]" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>
            Discount Codes
          </h3>
          <button
            type="button"
            onClick={generateCode}
            disabled={!rule?.active}
            className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
            style={{ fontFamily: "var(--font-cta)", background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))" }}
          >
            Generate Code
          </button>
        </div>

        {ruleMsg && (
          <div className="mb-3 text-[12px] px-3 py-2 rounded-[8px]" style={{ fontFamily: "var(--font-body)", background: "rgba(34,197,94,0.08)", color: "rgb(34,160,84)" }}>
            {ruleMsg}
          </div>
        )}

        {/* Campaign rule editor */}
        {rule && (
          <div className="rounded-[10px] border p-4 mb-4" style={{ borderColor: "rgb(238,240,244)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                Campaign rule
              </p>
              <span
                className="text-[12px] px-2.5 py-1 rounded-full"
                style={{
                  fontFamily: "var(--font-badge)",
                  background: rule.active ? "rgb(240,252,240)" : "rgb(250,245,245)",
                  color: rule.active ? "rgb(34,160,84)" : "rgb(190,80,80)",
                }}
              >
                {rule.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <div>
                <label className="block text-[12px] font-medium text-[rgb(140,145,155)] mb-1.5" style={{ fontFamily: "var(--font-body)" }}>
                  Discount %
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={INPUT_CLASS}
                  style={{ fontFamily: "var(--font-body)", width: "100%" }}
                  value={ruleDraft.discount_percent}
                  onChange={(e) => setRuleDraft((prev) => ({ ...prev, discount_percent: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[rgb(140,145,155)] mb-1.5" style={{ fontFamily: "var(--font-body)" }}>
                  Max uses <span className="font-normal">(blank = unlimited)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  className={INPUT_CLASS}
                  style={{ fontFamily: "var(--font-body)", width: "100%" }}
                  value={ruleDraft.max_uses}
                  placeholder="Unlimited"
                  onChange={(e) => setRuleDraft((prev) => ({ ...prev, max_uses: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[rgb(140,145,155)] mb-1.5" style={{ fontFamily: "var(--font-body)" }}>
                  Expires
                </label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  style={{ fontFamily: "var(--font-body)", width: "100%" }}
                  value={ruleDraft.expires_at}
                  onChange={(e) => setRuleDraft((prev) => ({ ...prev, expires_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                Used {rule.used_count}{rule.max_uses != null ? ` / ${rule.max_uses}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch("/api/admin/discounts", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ active: !rule.active }),
                    });
                    const data = await res.json();
                    if (res.ok && data.rule) setRule(data.rule);
                  }}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium border-2 transition-colors"
                  style={{
                    fontFamily: "var(--font-body)",
                    borderColor: "rgb(230,230,230)",
                    color: "rgb(80,85,95)",
                  }}
                >
                  {rule.active ? "Pause" : "Activate"}
                </button>
                <button
                  type="button"
                  disabled={savingRule}
                  onClick={saveRule}
                  className="px-4 py-1.5 rounded-[8px] text-[12px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ fontFamily: "var(--font-cta)", background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))" }}
                >
                  {savingRule ? "Saving..." : "Save Rule"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Minted codes table */}
        <div className="overflow-hidden rounded-[10px] border" style={{ borderColor: "rgb(238,240,244)" }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "rgb(247,248,250)" }}>
                {["Code", "Discount", "Status", "Uses", "Issued to", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[13px]" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
                    No codes yet. Click &quot;Generate Code&quot; to mint the first one.
                  </td>
                </tr>
              ) : (
                codes.map((c) => (
                  <tr key={c.code} style={{ borderTop: "1px solid rgb(245,246,248)" }}>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => copyValue(c.code, c.code)}
                        className="font-mono text-[12px] hover:opacity-70 transition-opacity"
                        style={{ color: "rgb(147,216,216)" }}
                        title="Click to copy"
                      >
                        {copied === c.code ? "Copied!" : c.code}
                      </button>
                    </td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>
                      {c.discount_percent}%
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[12px] px-2.5 py-1 rounded-full"
                        style={{
                          fontFamily: "var(--font-badge)",
                          background: c.active ? "rgb(240,252,240)" : "rgb(250,245,245)",
                          color: c.active ? "rgb(34,160,84)" : "rgb(190,80,80)",
                        }}
                      >
                        {c.active ? "Active" : "Off"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" style={{ fontFamily: "var(--font-body)", color: "rgb(80,85,95)" }}>
                      {c.used_count}{c.max_uses != null ? ` / ${c.max_uses}` : ""}
                    </td>
                    <td className="px-4 py-2.5 max-w-[160px] truncate" style={{ fontFamily: "var(--font-body)", color: "rgb(140,145,155)" }}>
                      {c.issued_to_email || "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCode(c.code, c.active)}
                          className="text-[12px] hover:opacity-70 transition-opacity"
                          style={{ fontFamily: "var(--font-body)", color: "rgb(100,160,180)" }}
                        >
                          {c.active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => resetCode(c.code)}
                          className="text-[12px] hover:opacity-70 transition-opacity"
                          style={{ fontFamily: "var(--font-body)", color: "rgb(170,150,80)" }}
                        >
                          Reset
                        </button>
                        {c.active && (
                          <button
                            type="button"
                            onClick={() => deleteCode(c.code)}
                            className="text-[12px] hover:opacity-70 transition-opacity"
                            style={{ fontFamily: "var(--font-body)", color: "rgb(190,110,110)" }}
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] mt-2" style={{ fontFamily: "var(--font-body)", color: "rgb(160,160,160)" }}>
          Codes are minted at the campaign rule&apos;s percent and emailed to customers who sign up through the site popup.
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
