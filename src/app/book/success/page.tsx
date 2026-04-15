"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface BookingDetails {
  plan: string;
  address: string;
  slot_start: string;
  property_type: string;
  bedrooms: string;
  thermostats: string;
  price_aed: string;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [details, setDetails] = useState<BookingDetails | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/booking-details?session_id=${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setDetails(data);
      })
      .catch(() => {});

    // Clear booking session
    try { sessionStorage.removeItem("ductly_booking_session"); } catch {}
  }, [sessionId]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-AE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-AE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  return (
    <div className="text-center py-12">
      {/* Checkmark */}
      <div
        className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-8"
        style={{
          background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
          boxShadow: "0 8px 24px rgba(147,216,216,0.3)",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1
        className="text-[32px] md:text-[42px] font-normal tracking-[-0.04em] text-[rgb(61,61,61)] mb-4"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Booking Confirmed
      </h1>

      <p
        className="text-[16px] text-[rgb(109,109,109)] mb-3 max-w-md mx-auto leading-[1.6]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Your duct cleaning service has been booked successfully.
      </p>

      {/* Booking details card */}
      {details && (
        <div
          className="max-w-md mx-auto mt-8 mb-8 text-left p-6"
          style={{
            background: "white",
            border: "2px solid rgb(238,240,244)",
            borderRadius: 16,
          }}
        >
          <h2
            className="text-[16px] font-medium mb-4"
            style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
          >
            Your Booking
          </h2>
          <div className="space-y-3">
            {[
              { label: "Plan", value: details.plan.charAt(0).toUpperCase() + details.plan.slice(1) },
              { label: "Date", value: formatDate(details.slot_start) },
              { label: "Time", value: formatTime(details.slot_start) },
              { label: "Address", value: details.address },
              {
                label: "Property",
                value: `${details.property_type.charAt(0).toUpperCase() + details.property_type.slice(1)} — ${
                  details.bedrooms === "0" ? "Studio" : `${details.bedrooms} bedroom${Number(details.bedrooms) > 1 ? "s" : ""}`
                }`,
              },
              { label: "Thermostats", value: details.thermostats },
              { label: "Total", value: `AED ${Number(details.price_aed).toLocaleString()}`, highlight: true },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-2"
                style={{ borderBottom: "1px solid rgb(245,246,248)" }}
              >
                <span
                  className="text-[14px]"
                  style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}
                >
                  {row.label}
                </span>
                <span
                  className="text-[14px] font-medium"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: row.highlight ? "rgb(60,140,130)" : "rgb(61,61,61)",
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p
        className="text-[14px] text-[rgb(153,153,153)] mb-10 max-w-sm mx-auto leading-[1.6]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        You&apos;ll receive a confirmation via WhatsApp and email shortly
        with your assigned team and time details.
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

export default function BookingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-[3px] border-[rgb(244,244,244)] border-t-[rgb(147,216,216)] animate-spin" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
