"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Newsletter promo popup.
 *
 * Single modal shell that captures an email and marks the signup as a
 * customer lead (POST /api/newsletter). No discount code is minted and
 * nothing is emailed back — the submit only records the contact.
 *
 * Enabled only when NEXT_PUBLIC_POPUP_VARIANT=newsletter; any other value
 * (or unset) turns the popup off.
 *
 * Shell behaviour:
 *   - centered modal, z-index below the chat widget so they don't collide
 *   - backdrop / × / ESC to dismiss
 *   - auto-opens ONCE per browser session after a delay
 *   - generic form state machine: idle → submitting → success/error
 */

const TITLE = "Get 50% off your first cleaning";
const SUBTITLE =
  "Enter your email and we'll mark you as a customer. Your discount code is revealed right here — no spam, ever.";
const CTA = "Get my code";
const SUCCESS_TITLE = "Your 50% off code";
const COUPON_CODE = "DUCTLY50";
const SUCCESS_BODY = "Use this code at checkout for 50% off your first cleaning.";
const ENDPOINT = "/api/newsletter";
const ONCE_KEY = "ductly_popup_newsletter_seen";
const DELAY_MS = 4000;

function active(): boolean {
  if (typeof window === "undefined") return false;
  return process.env.NEXT_PUBLIC_POPUP_VARIANT === "newsletter";
}

const INPUT_CLASS =
  "w-full rounded-[12px] border-2 border-[rgb(230,230,230)] bg-white px-4 py-3.5 text-[15px] text-[rgb(61,61,61)] placeholder:text-[rgb(185,185,185)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

export default function PromoPopup() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const dismissedRef = useRef(false);

  /* Auto-open once per browser session after the delay. */
  useEffect(() => {
    if (!active()) return;
    const alreadySeen = (() => {
      try { return sessionStorage.getItem(ONCE_KEY) === "1"; } catch { return false; }
    })();
    if (alreadySeen) return;
    const t = setTimeout(() => {
      if (!dismissedRef.current) setOpen(true);
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  /* ESC to close. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePopup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closePopup = useCallback(() => {
    dismissedRef.current = true;
    setOpen(false);
    try { sessionStorage.setItem(ONCE_KEY, "1"); } catch {}
  }, []);

  const emailValid = /^[^\s@,()<>"';:]+@[^\s@,()<>"';:]+\.[^\s@,()<>"';:]{2,}$/.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid || state === "submitting") return;
    setState("submitting");
    setError("");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setState("success");
    } catch {
      setState("error");
      setError("Network error. Please try again.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={closePopup}
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
    >
      <div
        className="relative w-full max-w-[440px] rounded-[20px] bg-white p-8"
        style={{
          boxShadow: "0px 16px 48px rgba(0,0,0,0.2)",
          border: "2px solid rgb(244,244,244)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={closePopup}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-[rgb(150,155,165)] hover:bg-[rgb(245,246,248)] transition-colors"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {state === "success" ? (
          <div className="text-center py-4">
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-5"
              style={{ background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-[22px] font-normal tracking-[-0.03em] text-[rgb(61,61,61)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
              {SUCCESS_TITLE}
            </h3>
            <div
              className="mx-auto max-w-[240px] rounded-[12px] py-3 px-4 mb-3 border-2 border-dashed"
              style={{ borderColor: "rgb(147,216,216)", background: "rgb(246,252,252)" }}
            >
              <span className="text-[22px] font-semibold tracking-[0.12em] text-[rgb(38,120,116)]" style={{ fontFamily: "var(--font-cta)" }}>
                {COUPON_CODE}
              </span>
            </div>
            <p className="text-[15px] text-[rgb(109,109,109)] leading-[1.5]" style={{ fontFamily: "var(--font-body)" }}>
              {SUCCESS_BODY}
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-[24px] font-normal tracking-[-0.03em] text-[rgb(61,61,61)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
              {TITLE}
            </h3>
            <p className="text-[14px] text-[rgb(109,109,109)] leading-[1.5] mb-6" style={{ fontFamily: "var(--font-body)" }}>
              {SUBTITLE}
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-[14px] font-medium text-[rgb(61,61,61)] mb-2" style={{ fontFamily: "var(--font-body)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={INPUT_CLASS}
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>

              {state === "error" && (
                <p className="text-[13px] text-[rgb(200,70,70)]" style={{ fontFamily: "var(--font-body)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!emailValid || state === "submitting"}
                className="w-full px-6 py-3.5 text-[16px] text-white hover:brightness-110 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
                  borderRadius: 40,
                  boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)",
                  fontFamily: "var(--font-cta)",
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                }}
              >
                {state === "submitting" ? "Subscribing..." : CTA}
              </button>
            </form>

            <button
              type="button"
              onClick={closePopup}
              className="w-full text-center text-[13px] text-[rgb(153,153,153)] hover:text-[rgb(61,61,61)] transition-colors mt-4"
              style={{ fontFamily: "var(--font-body)" }}
            >
              No thanks
            </button>
          </>
        )}
      </div>
    </div>
  );
}
