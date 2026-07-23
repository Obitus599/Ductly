"use client";

import { CARD, CTA, Row, formatSlot, formatDate } from "./shared";
import { vatFromNet, filsToAedString, VAT_RATE_PERCENT } from "@/lib/vat";

interface CheckoutStepProps {
  plan: { name: string; rate: number };
  name: string;
  email: string;
  phone: string;
  address: string;
  propertyLabel: string;
  bedroomLabel: string;
  thermostats: number;
  selectedDate: string;
  selectedSlot: string;
  lockCountdown: number;
  hasLock: boolean;
  submitting: boolean;
  consentChecked: boolean;
  setConsentChecked: (v: boolean) => void;
  onBack: () => void;
  onCheckout: () => void;
  /** Show the Tabby BNPL option (NEXT_PUBLIC_ENABLE_TABBY). */
  enableTabby: boolean;
  paymentMethod: "card" | "tabby";
  setPaymentMethod: (v: "card" | "tabby") => void;
}

export default function CheckoutStep({
  plan, name, email, phone, address, propertyLabel, bedroomLabel,
  thermostats, selectedDate, selectedSlot, lockCountdown, hasLock,
  submitting, consentChecked, setConsentChecked, onBack, onCheckout,
  enableTabby, paymentMethod, setPaymentMethod,
}: CheckoutStepProps) {
  return (
    <div className="p-7 md:p-10" style={CARD}>
      <div className="flex items-center justify-between mb-7">
        <h2
          className="text-[22px] font-normal tracking-[-0.03em] text-[rgb(61,61,61)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Review &amp; Pay
        </h2>
        {hasLock && (
          <span
            className="text-[13px] font-medium px-3 py-1.5 rounded-full"
            style={{
              background: lockCountdown < 60 ? "rgb(255,240,240)" : "rgb(240,252,252)",
              color: lockCountdown < 60 ? "rgb(200,80,80)" : "rgb(80,160,160)",
              fontFamily: "var(--font-badge)",
            }}
          >
            {Math.floor(lockCountdown / 60)}:{(lockCountdown % 60).toString().padStart(2, "0")} reserved
          </span>
        )}
      </div>

      {/* Summary card */}
      <div
        className="rounded-[14px] border-2 border-[rgb(244,244,244)] p-6 mb-6"
        style={{ background: "rgb(252,252,252)" }}
      >
        <Row label="Plan" value={plan.name} />
        <Row label="Name" value={name} />
        <Row label="Email" value={email} />
        <Row label="Mobile" value={phone} />
        <Row label="Address" value={address} />
        <Row label="Property" value={`${propertyLabel} — ${bedroomLabel}`} />
        <Row label="Thermostats" value={String(thermostats)} />
        <div className="border-t border-[rgb(240,240,240)] mt-2 pt-2">
          <Row label="Date" value={formatDate(selectedDate)} />
          <Row label="Time" value={formatSlot(selectedSlot)} />
        </div>
        {(() => {
          // Prices are quoted NET; 5% VAT is added on top at payment.
          const vat = vatFromNet(plan.rate * thermostats * 100);
          return (
            <div className="border-t-2 border-[rgb(230,230,230)] mt-3 pt-3 space-y-1.5">
              <Row label="Subtotal" value={`AED ${filsToAedString(vat.netFils)}`} />
              <Row label={`VAT (${VAT_RATE_PERCENT}%)`} value={`AED ${filsToAedString(vat.vatFils)}`} />
              <div className="flex justify-between items-center pt-1">
                <span
                  className="text-[16px] font-medium text-[rgb(61,61,61)]"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Total
                </span>
                <span
                  className="text-[22px] font-medium tracking-[-0.02em]"
                  style={{
                    fontFamily: "var(--font-heading)",
                    background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  AED {filsToAedString(vat.totalFils)}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* PDPL consent (UAE Federal Decree-Law 45/2021) */}
      <label
        className="flex items-start gap-3 mb-5 cursor-pointer"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[rgb(149,207,140)] cursor-pointer"
        />
        <span className="text-[13px] leading-[1.55] text-[rgb(109,109,109)]">
          I agree to Ductly&apos;s{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-[rgb(80,160,160)]">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-[rgb(80,160,160)]">
            Terms
          </a>
          , and consent to the processing of my personal data as described.
        </span>
      </label>

      {/* Payment method (Tabby BNPL is flag-gated) */}
      {enableTabby && (
        <div className="mb-5">
          <p
            className="text-[13px] font-medium mb-2 text-[rgb(130,135,145)]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Payment method
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "card", title: "Card", sub: "Pay in full" },
              { id: "tabby", title: "Tabby", sub: "4 interest-free payments" },
            ] as const).map((opt) => {
              const active = paymentMethod === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPaymentMethod(opt.id)}
                  aria-pressed={active}
                  className="text-left rounded-[12px] border-2 p-3 transition-colors"
                  style={{
                    borderColor: active ? "rgb(147,216,216)" : "rgb(230,230,230)",
                    background: active ? "rgb(240,252,252)" : "white",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <div className="text-[15px] font-medium text-[rgb(61,61,61)]">{opt.title}</div>
                  <div className="text-[12px] text-[rgb(140,140,140)]">{opt.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button" onClick={onBack}
          className="px-6 py-4 rounded-[40px] border-2 border-[rgb(230,230,230)] text-[15px] text-[rgb(109,109,109)] hover:border-[rgb(200,200,200)] transition-colors"
          style={{ fontFamily: "var(--font-cta)", fontWeight: 500 }}
        >
          Back
        </button>
        <button
          type="button" disabled={submitting || !consentChecked} onClick={onCheckout}
          className="flex-1 px-6 py-4 text-[16px] text-white hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={CTA}
        >
          {submitting
            ? "Redirecting to payment..."
            : enableTabby && paymentMethod === "tabby"
            ? "Continue with Tabby"
            : "Proceed to Payment"}
        </button>
      </div>
    </div>
  );
}
