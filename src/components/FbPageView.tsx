"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { fbqEvent } from "@/lib/fbq";

/**
 * Fires a Meta pixel PageView on every client-side route change.
 *
 * The base pixel code (layout) already tracks PageView on the initial load,
 * so we skip the first mount and only fire on subsequent navigations — this
 * avoids double-counting the first page while still lighting up the dashboard
 * with activity across the whole booking flow.
 */
export default function FbPageView() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fbqEvent("PageView", { page_path: pathname });
  }, [pathname]);

  return null;
}
