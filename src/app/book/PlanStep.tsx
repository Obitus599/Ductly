"use client";

import { CARD, CTA, type PlanConfig } from "./shared";

interface PlanStepProps {
  plans: Record<string, PlanConfig>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onContinue: () => void;
  canContinue: boolean;
}

/* Replicates the landing-page plan look (name, price, "+5% VAT", tagline,
   features, "Best Deal" badge) but lays the three options out VERTICALLY —
   one full-width row per plan — with explicit left alignment everywhere
   (buttons default to center-align text, which caused the earlier
   misalignment) and larger feature points. Cards are selectable buttons. */

const CARD_BASE: React.CSSProperties = {
  background: "linear-gradient(117deg, rgb(244,244,244) 0%, rgb(250,250,250) 100%)",
  borderRadius: 16,
  boxShadow: "0px 6px 8px 0px rgba(0,0,0,0.05)",
  textAlign: "left",
  cursor: "pointer",
  transition: "border-color 0.15s ease, transform 0.15s ease",
};

const BEST_WRAP: React.CSSProperties = {
  borderRadius: 20,
  padding: 2,
  background: "linear-gradient(208deg, rgb(149,207,140) 0%, rgb(147,216,216) 35%)",
};

function CheckIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0 mt-[2px]">
      <circle cx="12" cy="12" r="12" fill="rgb(149,207,140)" fillOpacity="0.15" />
      <path d="M7 12.5l3.2 3.2L17.5 8.5" stroke="rgb(149,207,140)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({
  plan, selected, best, onSelect,
}: {
  plan: PlanConfig;
  selected: boolean;
  best: boolean;
  onSelect: () => void;
}) {
  const border = selected ? "3px solid rgb(147,216,216)" : "2px solid rgb(244,244,244)";
  const card = (
    <div
      className="p-5 md:p-6 flex flex-col md:flex-row md:items-start gap-5 relative"
      style={{
        ...CARD_BASE,
        textAlign: "left",
        border,
        boxShadow: selected
          ? "0px 8px 16px -4px rgba(147,216,216,0.35)"
          : "0px 6px 8px 0px rgba(0,0,0,0.05)",
      }}
    >
      {best && (
        <div
          className="absolute top-5 right-5 text-[14px] text-white px-4 py-1.5 rounded-[40px]"
          style={{ background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))", fontFamily: "var(--font-badge)", letterSpacing: "-0.02em" }}
        >
          Best Deal
        </div>
      )}

      {/* Selection indicator — radio-style badge */}
      <div
        className="absolute top-5 left-5 w-7 h-7 rounded-full flex items-center justify-center"
        style={{
          border: selected ? "2px solid rgb(147,216,216)" : "2px solid rgb(200,200,200)",
          background: selected ? "rgb(147,216,216)" : "white",
        }}
        aria-hidden="true"
      >
        {selected && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Plan identity — left column */}
      <div className="md:w-[250px] shrink-0 text-left">
        <h3
          className="text-[24px] md:text-[26px] font-normal tracking-[-0.04em] text-[rgb(61,61,61)] mb-1.5 leading-[1.15] mt-8"
          style={{ fontFamily: "var(--font-heading)", textAlign: "left" }}
        >
          {plan.name}
        </h3>
        <div className="flex items-baseline gap-2 mb-1" style={{ textAlign: "left" }}>
          <span className="text-[28px] md:text-[30px] font-medium text-[rgb(61,61,61)] leading-none" style={{ fontFamily: "var(--font-stat)" }}>{plan.rate}</span>
          <span className="text-[13px] text-[rgb(153,153,153)]" style={{ fontFamily: "var(--font-body)" }}>AED / per thermostat</span>
        </div>
        <p className="text-[12px] text-[rgb(170,170,170)] mb-2" style={{ fontFamily: "var(--font-body)", textAlign: "left" }}>+ 5% VAT</p>
        <p className="text-[14px] text-[rgb(109,109,109)] leading-[1.45]" style={{ fontFamily: "var(--font-body)", textAlign: "left" }}>{plan.tagline}</p>
      </div>

      {/* Feature points — right column */}
      <ul className="space-y-1.5 flex-1 min-w-0 text-left md:pt-7">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5" style={{ textAlign: "left" }}>
            <CheckIcon size={18} />
            <span className="text-[13px] text-[rgb(61,61,61)] leading-[1.5]" style={{ fontFamily: "var(--font-body)" }}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return best ? (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full block text-left"
      style={{ ...BEST_WRAP, border: "none", cursor: "pointer", textAlign: "left" }}
    >
      {card}
    </button>
  ) : (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full block text-left"
      style={{ border: "none", cursor: "pointer", background: "transparent", textAlign: "left" }}
    >
      {card}
    </button>
  );
}

export default function PlanStep({
  plans, selectedKey, onSelect, onContinue, canContinue,
}: PlanStepProps) {
  return (
    <div className="p-7 md:p-10" style={CARD} data-step="plan">
      <h2
        className="text-[22px] font-normal tracking-[-0.03em] text-[rgb(61,61,61)] mb-2"
        style={{ fontFamily: "var(--font-heading)", textAlign: "left" }}
      >
        Choose Your Plan
      </h2>
      <p
        className="text-[14px] text-[rgb(109,109,109)] mb-8 max-w-[560px] leading-[1.5]"
        style={{ fontFamily: "var(--font-body)", textAlign: "left" }}
      >
        Pick the cleaning level that fits your home. All plans are priced per
        thermostat — the exact total is calculated on checkout (+ 5% VAT).
      </p>

      <div className="space-y-5">
        {Object.entries(plans).map(([key, plan]) => (
          <PlanCard
            key={key}
            plan={plan}
            selected={selectedKey === key}
            best={key === "signature"}
            onSelect={() => onSelect(key)}
          />
        ))}
      </div>

      <button
        type="button" disabled={!canContinue} onClick={onContinue}
        className="w-full mt-8 px-6 py-4 text-[16px] text-white hover:brightness-110 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        style={CTA}
      >
        Continue to Details
      </button>
    </div>
  );
}
