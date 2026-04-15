/* ─── Shared types & styles for the booking flow ─────────────────── */

export type Step = "details" | "calendar" | "checkout";

export const PLANS: Record<string, { name: string; rate: number; duration: number }> = {
  essential: { name: "Essential", rate: 500, duration: 90 },
  signature: { name: "Signature", rate: 750, duration: 90 },
  elite: { name: "Elite", rate: 900, duration: 90 },
};

export interface SlotResponse {
  date: string;
  slots: string[];
  total_teams: number;
}

export interface LockResponse {
  id: string;
  slot_start: string;
  session_id: string;
  expires_at: string;
}

export const CARD: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgb(255,255,255) 0%, rgb(250,250,250) 100%)",
  border: "2px solid rgb(244,244,244)",
  borderRadius: 20,
  boxShadow:
    "0px 0.6px 1.57px -1.5px rgba(0,0,0,0.10), 0px 2.29px 5.95px -3px rgba(0,0,0,0.08), 0px 10px 26px -4.5px rgba(0,0,0,0.02)",
};

export const CTA: React.CSSProperties = {
  background:
    "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
  borderRadius: 40,
  boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)",
  fontFamily: "var(--font-cta)",
  fontWeight: 500,
  letterSpacing: "-0.02em",
};

export const INPUT =
  "w-full rounded-[12px] border-2 border-[rgb(230,230,230)] bg-white px-4 py-3.5 text-[15px] text-[rgb(61,61,61)] placeholder:text-[rgb(185,185,185)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors";

export const LABEL = "block text-[14px] font-medium text-[rgb(61,61,61)] mb-2";

export function formatSlot(slot: string) {
  const parts = slot.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return slot;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-2">
      <span
        className="text-[14px] text-[rgb(153,153,153)]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {label}
      </span>
      <span
        className="text-[14px] text-[rgb(61,61,61)] text-right max-w-[60%]"
        style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
      >
        {value}
      </span>
    </div>
  );
}
