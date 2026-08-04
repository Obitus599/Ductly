"use client";

import { useEffect, useRef, useState } from "react";

interface TabbyPromoProps {
  price: number; // in fils (integer)
  currency?: string;
  source?: "product" | "checkout";
}

declare global {
  interface Window {
    TabbyPromo?: new (cfg: Record<string, string>) => { destroy: () => void };
  }
}

/**
 * Tabby Promo Snippet — renders "4 interest-free payments of AED X"
 * using Tabby's official promo SDK. Self-loads the script once and
 * re-initialises when price changes.
 */
export default function TabbyPromo({
  price,
  currency = "AED",
  source = "product",
}: TabbyPromoProps) {
  const [scriptReady, setScriptReady] = useState(false);
  const id = useRef(`tabby-promo-${Math.random().toString(36).slice(2, 8)}`).current;
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  const loadedRef = useRef(false);

  // Load Tabby promo script once globally
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const el = document.createElement("script");
    el.src = "https://checkout.tabby.ai/tabby-promo.js";
    el.async = true;
    el.onload = () => setScriptReady(true);
    el.onerror = () => console.warn("Tabby promo script failed to load");
    document.head.appendChild(el);
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  // Initialise / re-initialise on price change or script ready
  useEffect(() => {
    if (!window.TabbyPromo || !price) return;
    if (instanceRef.current) {
      instanceRef.current.destroy();
      instanceRef.current = null;
    }
    const container = document.getElementById(id);
    if (!container) return;
    // Clear any previous content so Tabby can re-render cleanly
    container.innerHTML = "";
    try {
      instanceRef.current = new window.TabbyPromo({
        selector: `#${id}`,
        currency,
        price: (price / 100).toFixed(2), // fils → major units
        lang: "en",
        merchantCode:
          process.env.NEXT_PUBLIC_TABBY_MERCHANT_CODE || "DuctlyAe",
        publicKey: process.env.NEXT_PUBLIC_TABBY_PUBLIC_KEY || "",
        source,
      });
    } catch (err) {
      console.error("TabbyPromo init failed:", err);
    }
  }, [price, currency, source, id, scriptReady]);

  const totalFils = price || 0;
  const splitAED = (totalFils / 4 / 100).toFixed(2);
  const totalAED = (totalFils / 100).toFixed(2);

  return (
    <div className="mt-2">
      <div id={id}>
        {/* Fallback static snippet visible until the Tabby script boots */}
        <div
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "rgb(130,135,145)", fontFamily: "var(--font-body)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <rect width="16" height="16" rx="4" fill="rgb(62,255,177)" />
            <path
              d="M4.5 8.5L6 10L11 5"
              stroke="rgb(30,30,45)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            4 interest-free payments of{" "}
            <strong style={{ fontWeight: 600 }}>AED {splitAED}</strong>. No fees.
          </span>
        </div>
      </div>
    </div>
  );
}
