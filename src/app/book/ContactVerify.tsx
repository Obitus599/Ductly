"use client";

import { useState } from "react";

/**
 * Inline OTP verification for one contact channel (email or phone) on
 * the booking page (#7). Self-contained: manages its own send/check
 * flow and reports the verified state up via onVerifiedChange.
 *
 * Rendered only when verification is enabled (the parent gates on
 * NEXT_PUBLIC_REQUIRE_CONTACT_VERIFICATION); the server enforces the
 * same gate at /api/checkout.
 */
interface ContactVerifyProps {
  channel: "email" | "sms";
  value: string;
  valueValid: boolean;
  verified: boolean;
  onVerifiedChange: (v: boolean) => void;
}

const SMALL_BTN =
  "px-4 py-2 rounded-[40px] text-[13px] text-white hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed";
const SMALL_BTN_STYLE: React.CSSProperties = {
  background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
  fontFamily: "var(--font-cta)",
  fontWeight: 500,
};

export default function ContactVerify({
  channel,
  value,
  valueValid,
  verified,
  onVerifiedChange,
}: ContactVerifyProps) {
  const [phase, setPhase] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const label = channel === "email" ? "email" : "number";

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, identifier: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg({ kind: "error", text: data.error || "Could not send the code. Try again." });
        return;
      }
      setPhase("code");
      setMsg({ kind: "info", text: `We sent a 6-digit code to your ${label}.` });
    } catch {
      setMsg({ kind: "error", text: "Could not send the code. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!/^\d{6}$/.test(code)) {
      setMsg({ kind: "error", text: "Enter the 6-digit code." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, identifier: value, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.verified) {
        onVerifiedChange(true);
        setMsg(null);
        return;
      }
      const reason =
        data.reason === "expired"
          ? "That code expired. Send a new one."
          : data.reason === "too_many_attempts"
          ? "Too many attempts. Send a new code."
          : "That code isn't right. Try again.";
      setMsg({ kind: "error", text: reason });
    } catch {
      setMsg({ kind: "error", text: "Could not verify the code. Try again." });
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <div
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[rgb(60,140,100)]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
        Verified
      </div>
    );
  }

  return (
    <div className="mt-2">
      {phase === "idle" ? (
        <button
          type="button"
          onClick={send}
          disabled={!valueValid || busy}
          className={SMALL_BTN}
          style={SMALL_BTN_STYLE}
        >
          {busy ? "Sending…" : "Send code"}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="123456"
            className="w-[110px] rounded-[12px] border-2 border-[rgb(230,230,230)] bg-white px-3 py-2 text-[15px] tracking-[0.3em] text-[rgb(61,61,61)] placeholder:text-[rgb(200,200,200)] placeholder:tracking-normal focus:border-[rgb(147,216,216)] focus:outline-none"
            style={{ fontFamily: "var(--font-body)" }}
          />
          <button type="button" onClick={confirm} disabled={busy} className={SMALL_BTN} style={SMALL_BTN_STYLE}>
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="text-[13px] text-[rgb(80,160,160)] underline disabled:opacity-40"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Resend
          </button>
        </div>
      )}
      {msg && (
        <p
          className="mt-1.5 text-[12px]"
          style={{
            fontFamily: "var(--font-body)",
            color: msg.kind === "error" ? "rgb(180,60,60)" : "rgb(109,109,109)",
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
