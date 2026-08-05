"use client";

import { CARD, CTA, Row, formatSlot, formatDate } from "./shared";
import { vatFromNet, filsToAedString, VAT_RATE_PERCENT } from "@/lib/vat";
import TabbyPromo from "@/components/TabbyPromo";

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

/** Shared pill style used for the payment method options. */
const PAY_METHOD_BTN =
  "text-left rounded-[12px] border-2 p-3 transition-colors w-full";

/** Inline Tabby logo — wordmark + checkmark. */
function TabbyLogo({ size = 16 }: { size?: number }) {
  const s = size;
  return (
    <svg
      width={s * 1.6}
      height={s}
      viewBox="0 0 26 16"
      fill="none"
      aria-label="Tabby"
      className="inline-block align-middle"
    >
      <rect width="16" height="16" rx="4" fill="rgb(62,255,177)" />
      <path
        d="M4.5 8.5L6 10L11 5"
        stroke="rgb(30,30,45)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="17"
        y="12.5"
        fill="rgb(30,30,45)"
        fontSize="12"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        tabby
      </text>
    </svg>
  );
}

export default function CheckoutStep({
  plan, name, email, phone, address, propertyLabel, bedroomLabel,
  thermostats, selectedDate, selectedSlot, lockCountdown, hasLock,
  submitting, consentChecked, setConsentChecked, onBack, onCheckout,
  enableTabby, paymentMethod, setPaymentMethod,
}: CheckoutStepProps) {
  const vat = vatFromNet(plan.rate * thermostats * 100);

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
          {/* Tabby product/pricing snippet — shows split amount near total */}
          {enableTabby && (
            <TabbyPromo price={vat.totalFils} source="product" />
          )}
        </div>
      </div>

      {/* PDPL consent */}
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
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              aria-pressed={paymentMethod === "card"}
              className={PAY_METHOD_BTN}
              style={{
                borderColor: paymentMethod === "card" ? "rgb(147,216,216)" : "rgb(230,230,230)",
                background: paymentMethod === "card" ? "rgb(240,252,252)" : "white",
                fontFamily: "var(--font-body)",
              }}
            >
              <div className="text-[15px] font-medium text-[rgb(61,61,61)]">Card</div>
              <div className="text-[12px] text-[rgb(140,140,140)]">Pay in full</div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("tabby")}
              aria-pressed={paymentMethod === "tabby"}
              className={PAY_METHOD_BTN}
              style={{
                borderColor: paymentMethod === "tabby" ? "rgb(147,216,216)" : "rgb(230,230,230)",
                background: paymentMethod === "tabby" ? "rgb(240,252,252)" : "white",
                fontFamily: "var(--font-body)",
              }}
            >
              <div className="text-[15px] font-medium text-[rgb(61,61,61)] flex items-center gap-1.5">
                <TabbyLogo size={14} />
                Pay later with Tabby
              </div>
              <div className="text-[12px] text-[rgb(140,140,140)]">4 interest-free payments</div>
            </button>
          </div>
          {/* Checkout snippet — installment breakdown when Tabby is selected */}
          {paymentMethod === "tabby" && (
            <TabbyPromo price={vat.totalFils} source="checkout" />
          )}
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
