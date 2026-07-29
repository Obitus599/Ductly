"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Neutral "we're confirming your payment" landing page.
 *
 * Shown when a payment provider redirected the customer back but we could
 * NOT positively verify the payment server-side — typically a provider
 * outage, or a payment still sitting in a non-terminal state. Claiming
 * success here would tell someone their slot is booked when it may not be,
 * so we tell the truth and poll until the webhook settles it.
 */
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 30; // ~2 minutes

function PendingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking_id");
  const [pollsExhausted, setPollsExhausted] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    let polls = 0;
    let cancelled = false;

    const tick = async () => {
      polls += 1;
      try {
        const res = await fetch(
          `/api/booking-details?booking_id=${encodeURIComponent(bookingId)}`
        );
        if (!cancelled && res.ok) {
          // booking-details only serves CONFIRMED bookings, so a 200 here
          // means the webhook finished the job while we waited.
          router.replace(`/book/success?booking_id=${encodeURIComponent(bookingId)}`);
          return;
        }
      } catch {
        // Network hiccup — just try again on the next tick.
      }
      if (!cancelled && polls >= MAX_POLLS) {
        setPollsExhausted(true);
        return;
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    let timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookingId, router]);

  return (
    <div className="text-center py-12">
      <div
        className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-8"
        style={{
          background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
          boxShadow: "0 8px 24px rgba(147,216,216,0.3)",
        }}
      >
        {pollsExhausted ? (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l2.5 2.5" />
          </svg>
        ) : (
          <div className="w-8 h-8 rounded-full border-[3px] border-white/40 border-t-white animate-spin" />
        )}
      </div>

      <h1
        className="text-[32px] md:text-[42px] font-normal tracking-[-0.04em] text-[rgb(61,61,61)] mb-4"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Confirming your payment
      </h1>

      <p
        className="text-[16px] text-[rgb(109,109,109)] mb-3 max-w-md mx-auto leading-[1.6]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {pollsExhausted
          ? "This is taking longer than usual. Your payment is safe — we'll confirm by WhatsApp and email as soon as it settles, and you won't be charged twice."
          : "We're checking with your payment provider. This usually takes a few seconds — please don't close this page or pay again."}
      </p>

      <p
        className="text-[14px] text-[rgb(153,153,153)] mb-10 max-w-sm mx-auto leading-[1.6]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Your slot is still being held. If anything goes wrong, nothing is
        charged and you can book again.
      </p>

      <Link
        href="/"
        className="inline-flex items-center justify-center px-8 py-3.5 text-[16px] text-white hover:brightness-110 transition-all duration-200"
        style={{
          background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
          borderRadius: 40,
          boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)",
          fontFamily: "var(--font-cta)",
          fontWeight: 500,
          letterSpacing: "-0.02em",
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}

export default function BookingPendingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-[3px] border-[rgb(244,244,244)] border-t-[rgb(147,216,216)] animate-spin" />
        </div>
      }
    >
      <PendingContent />
    </Suspense>
  );
}
