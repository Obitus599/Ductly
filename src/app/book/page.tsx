"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { type Step, PLANS, calcJobDuration, type SlotResponse, type LockResponse } from "./shared";
import DetailsStep from "./DetailsStep";
import CalendarStep from "./CalendarStep";
import CheckoutStep from "./CheckoutStep";
import { type AddressDetails, EMPTY_ADDRESS } from "./AddressPicker";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { isUaeMobile } from "@/lib/phone-uae";

/* ─── Step Indicator ────────────────────────────────────────────────── */

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "calendar", label: "Schedule" },
  { key: "checkout", label: "Checkout" },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center justify-center mb-10">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = s.key === current;
        return (
          <div key={s.key} className="flex items-center">
            {i > 0 && (
              <div
                className="w-10 sm:w-16 h-[2px] mx-1"
                style={{ background: done ? "rgb(149,207,140)" : "rgb(230,230,230)" }}
              />
            )}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-medium transition-all"
                style={
                  active
                    ? { background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))", color: "white", fontFamily: "var(--font-badge)" }
                    : done
                    ? { background: "rgb(149,207,140)", color: "white", fontFamily: "var(--font-badge)" }
                    : { border: "2px solid rgb(220,220,220)", color: "rgb(185,185,185)", fontFamily: "var(--font-badge)" }
                }
              >
                {done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className="text-[13px]"
                style={{
                  fontFamily: "var(--font-body)",
                  color: active ? "rgb(61,61,61)" : done ? "rgb(109,109,109)" : "rgb(185,185,185)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Booking Flow ──────────────────────────────────────────────────── */

function BookingFlow() {
  const searchParams = useSearchParams();
  const planKey = searchParams.get("plan") ?? "signature";
  const plan = PLANS[planKey] ?? PLANS.signature;

  const [step, setStep] = useState<Step>("details");

  /* form state */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const verificationEnabled = process.env.NEXT_PUBLIC_REQUIRE_CONTACT_VERIFICATION === "true";
  // Phone verification is gated separately — it rides on WhatsApp (Meta
  // template approval) while email always works. Off until that's ready.
  const phoneVerificationEnabled = process.env.NEXT_PUBLIC_REQUIRE_PHONE_VERIFICATION === "true";
  const [propertyType, setPropertyType] = useState<"villa" | "apartment" | "office">("apartment");
  const [bedrooms, setBedrooms] = useState(1);
  const [thermostats, setThermostats] = useState(1);
  const [addressDetails, setAddressDetails] = useState<AddressDetails>(EMPTY_ADDRESS);

  /* calendar state */
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [totalTeams, setTotalTeams] = useState(0);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");

  /* calendar view */
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());

  /* lock state */
  const [lock, setLock] = useState<LockResponse | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [sessionId] = useState(() => {
    try {
      const stored = sessionStorage.getItem("ductly_booking_session");
      if (stored) return stored;
      const id = crypto.randomUUID();
      sessionStorage.setItem("ductly_booking_session", id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  });

  /* checkout state */
  const [submitting, setSubmitting] = useState(false);
  const [lockingSlot, setLockingSlot] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  /* refs for async handlers */
  const abortRef = useRef<AbortController | null>(null);
  const lockRef = useRef<LockResponse | null>(null);
  useEffect(() => { lockRef.current = lock; }, [lock]);

  /* #7: editing a verified contact invalidates its verification */
  useEffect(() => { setEmailVerified(false); }, [email]);
  useEffect(() => { setPhoneVerified(false); }, [phone]);

  /* check for cancelled from Stripe redirect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cancelled") === "true") {
      setCancelled(true);
      window.history.replaceState({}, "", `/book?plan=${planKey}`);
    }
  }, [planKey]);

  /* release lock if user closes/navigates away */
  useEffect(() => {
    if (!lock) return;
    const handleUnload = () => {
      fetch("/api/booking-locks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, slot_start: lock.slot_start }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [lock, sessionId]);

  /* min date = tomorrow (memoized to avoid midnight shift during session) */
  const minDate = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }, []);

  /* job duration depends on plan + thermostat count */
  const jobDurationMins = useMemo(
    () => calcJobDuration(plan, thermostats),
    [plan, thermostats]
  );

  /* fetch slots (aborts stale requests on rapid date clicks) */
  const fetchSlots = useCallback(async (date: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingSlots(true);
    setError("");
    setSlots([]);
    setSelectedSlot("");
    try {
      const params = new URLSearchParams({ date, job_duration_mins: String(jobDurationMins) });
      if (addressDetails.formatted_address.trim()) params.set("address", addressDetails.formatted_address.trim());
      const res = await fetch(`/api/slots?${params}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) { setError("Failed to load available slots."); return; }
      const data: SlotResponse = await res.json();
      setSlots(data.slots ?? []);
      setTotalTeams(data.total_teams ?? 0);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load available slots.");
    } finally {
      if (!controller.signal.aborted) setLoadingSlots(false);
    }
  }, [addressDetails.formatted_address, jobDurationMins]);

  /* lock countdown timer */
  useEffect(() => {
    if (!lock) return;
    const interval = setInterval(() => {
      const expiresAt = /[Zz]|[+-]\d{2}:\d{2}$/.test(lock.expires_at)
        ? lock.expires_at : lock.expires_at + "+04:00";
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining <= 0) {
        setLock(null);
        setSelectedSlot("");
        setError("Your slot reservation expired. Please select a time again.");
        setStep("calendar");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lock]);

  /* browser back-button → step back instead of leaving page */
  useEffect(() => {
    if (step !== "details") {
      window.history.pushState(null, "");
    }
  }, [step]);

  useEffect(() => {
    const handlePopState = () => {
      setStep((prev) => {
        if (prev === "checkout") {
          const currentLock = lockRef.current;
          if (currentLock) {
            fetch("/api/booking-locks", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: sessionId, slot_start: currentLock.slot_start }),
            }).catch(() => {});
          }
          setLock(null);
          setSelectedSlot("");
          return "calendar";
        }
        if (prev === "calendar") return "details";
        return prev;
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [sessionId]);

  /* acquire lock + advance to checkout */
  async function selectSlot(slot: string) {
    setLockingSlot(slot);
    setSelectedSlot(slot);
    setError("");
    try {
      const slotStart = `${selectedDate}T${slot}:00+04:00`;
      const res = await fetch("/api/booking-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_start: slotStart, session_id: sessionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "This slot is no longer available.");
        setSelectedSlot("");
        setLockingSlot(null);
        return;
      }
      const lockData: LockResponse = await res.json();
      setLock(lockData);
      setLockingSlot(null);
      setStep("checkout");
    } catch {
      setError("Failed to reserve slot.");
      setSelectedSlot("");
      setLockingSlot(null);
    }
  }

  /* release lock helper */
  function releaseLock() {
    if (lock) {
      fetch("/api/booking-locks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, slot_start: lock.slot_start }),
      }).catch(() => {});
    }
    setLock(null);
    setSelectedSlot("");
  }

  /* submit to Stripe checkout */
  async function handleCheckout() {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const slotStart = `${selectedDate}T${selectedSlot}:00+04:00`;
    const slotEnd = new Date(new Date(slotStart).getTime() + jobDurationMins * 60 * 1000).toISOString();

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name, customer_email: email, customer_phone: phone,
          address: addressDetails.formatted_address,
          address_details: addressDetails,
          property_type: propertyType, bedrooms, thermostats, ducts: thermostats,
          plan: planKey, slot_start: slotStart, slot_end: slotEnd, session_id: sessionId,
          consent_version: CURRENT_CONSENT_VERSION,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Checkout failed."); setSubmitting(false); return; }
      window.location.href = data.checkout_url;
    } catch {
      setError("Checkout failed. Please try again.");
      setSubmitting(false);
    }
  }

  /* derived */
  const detailsValid = !!(
    name.trim() && email.trim() &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) &&
    isUaeMobile(phone) && addressDetails.formatted_address.trim() && thermostats >= 1 &&
    (!verificationEnabled || (emailVerified && (!phoneVerificationEnabled || phoneVerified)))
  );

  const bedroomLabel = propertyType === "office" ? "N/A" : bedrooms === 0 ? "Studio" : `${bedrooms} bedroom${bedrooms > 1 ? "s" : ""}`;
  const propertyLabel = propertyType === "villa" ? "Villa" : propertyType === "office" ? "Office" : "Apartment";

  return (
    <div>
      {/* Plan badge */}
      <div className="text-center mb-2">
        <span
          className="inline-block text-[13px] text-white px-4 py-1.5 rounded-full"
          style={{ background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))", fontFamily: "var(--font-badge)" }}
        >
          {plan.name} Plan
        </span>
      </div>

      <h1
        className="text-[28px] md:text-[36px] font-normal tracking-[-0.04em] text-[rgb(61,61,61)] text-center mb-8"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Book Your Service
      </h1>

      <StepIndicator current={step} />

      {/* Notices */}
      {cancelled && (
        <div className="mb-6 rounded-[12px] bg-[rgb(255,252,240)] border-2 border-[rgb(245,225,140)] p-4 text-[14px] text-[rgb(140,110,20)]" style={{ fontFamily: "var(--font-body)" }}>
          Payment was cancelled. You can try again below.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-[12px] bg-[rgb(255,245,245)] border-2 border-[rgb(255,200,200)] p-4 text-[14px] text-[rgb(180,60,60)]" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </div>
      )}

      {/* Steps */}
      {step === "details" && (
        <DetailsStep
          name={name} setName={setName}
          email={email} setEmail={setEmail}
          phone={phone} setPhone={setPhone}
          addressDetails={addressDetails} setAddressDetails={setAddressDetails}
          propertyType={propertyType} setPropertyType={setPropertyType}
          bedrooms={bedrooms} setBedrooms={setBedrooms}
          thermostats={thermostats} setThermostats={setThermostats}
          onContinue={() => { setError(""); setStep("calendar"); }}
          valid={detailsValid}
          verificationEnabled={verificationEnabled}
          phoneVerificationEnabled={phoneVerificationEnabled}
          emailVerified={emailVerified} setEmailVerified={setEmailVerified}
          phoneVerified={phoneVerified} setPhoneVerified={setPhoneVerified}
        />
      )}

      {step === "calendar" && (
        <CalendarStep
          plan={plan}
          jobDurationMins={jobDurationMins}
          viewMonth={viewMonth} viewYear={viewYear}
          setViewMonth={setViewMonth} setViewYear={setViewYear}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          minDate={minDate}
          slots={slots} totalTeams={totalTeams} loadingSlots={loadingSlots}
          fetchSlots={fetchSlots} selectSlot={selectSlot}
          lockingSlot={lockingSlot}
          onBack={() => setStep("details")}
        />
      )}

      {step === "checkout" && (
        <CheckoutStep
          plan={plan}
          name={name} email={email} phone={phone} address={addressDetails.formatted_address}
          propertyLabel={propertyLabel} bedroomLabel={bedroomLabel}
          thermostats={thermostats}
          selectedDate={selectedDate} selectedSlot={selectedSlot}
          lockCountdown={lockCountdown} hasLock={!!lock}
          submitting={submitting}
          consentChecked={consentChecked} setConsentChecked={setConsentChecked}
          onBack={() => { releaseLock(); setStep("calendar"); }}
          onCheckout={handleCheckout}
        />
      )}
    </div>
  );
}

/* ─── Page (with Suspense for useSearchParams) ──────────────────────── */

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div
            className="w-8 h-8 rounded-full border-[3px] border-[rgb(244,244,244)] border-t-[rgb(147,216,216)] animate-spin"
            role="status" aria-label="Loading"
          />
        </div>
      }
    >
      <BookingFlow />
    </Suspense>
  );
}
