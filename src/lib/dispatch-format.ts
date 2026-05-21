/**
 * Formatting helpers for team dispatch payloads.
 *
 * These run server-side in the Stripe webhook. They take raw DB data
 * and produce human-readable strings + a Google Maps deep link the
 * team can tap to navigate.
 */

const UAE_TZ = "Asia/Dubai";

/**
 * Build a Google Maps deep link. Prefers `place_id` (canonical, opens
 * the exact venue in Maps), then `lat,lng` (precise pin), then a text
 * query fallback (Maps will still parse "Dubai Marina, Tower 5" but
 * may pick the wrong tower if there are duplicates).
 *
 * The /search endpoint is intentional — it opens the location and
 * the team can tap "Directions" from there. /dir with `origin=current`
 * is more direct but doesn't allow the team to pick walking vs car.
 */
export function buildMapsLink(
  addressDetails: Record<string, unknown> | null,
  fallbackAddress: string
): string {
  const placeId = addressDetails?.place_id;
  if (typeof placeId === "string" && placeId.startsWith("ChIJ")) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      fallbackAddress
    )}&query_place_id=${encodeURIComponent(placeId)}`;
  }

  const lat = addressDetails?.lat;
  const lng = addressDetails?.lng;
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    fallbackAddress
  )}`;
}

/**
 * Format an ISO timestamp into a UAE-local human-readable string for
 * dispatch messages. "Tue 21 Apr, 10:00 AM" reads cleanly to a team
 * member glancing at WhatsApp on their phone.
 *
 * The 12-hour conversion is done manually rather than via `hour12: true`
 * — Node 20 ICU has known edge-case bugs around hour boundaries (it
 * has previously returned "0" or "24" at midnight). Doing the math
 * ourselves makes the output identical across runtimes.
 */
export function formatSlotForDispatch(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;

    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: UAE_TZ,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const wkday = get("weekday");
    const day = get("day");
    const month = get("month");
    const minute = get("minute") || "00";

    // Node 20 ICU can return "24" for midnight — normalize to 0-23 first.
    const rawHour = Number(get("hour") || "0") % 24;
    const hour12 = rawHour % 12 || 12;
    const period = rawHour < 12 ? "AM" : "PM";

    return `${wkday} ${day} ${month}, ${hour12}:${minute} ${period}`;
  } catch {
    return iso;
  }
}

/**
 * Quality signal for an address. UNKNOWN means we have no coordinates
 * (free-form text only) — the Maps deep link still works but pin
 * accuracy is whatever Maps resolves the text to.
 */
export function addressQuality(
  addressDetails: Record<string, unknown> | null
): "verified" | "unverified" {
  const lat = addressDetails?.lat;
  const lng = addressDetails?.lng;
  if (typeof lat === "number" && typeof lng === "number") return "verified";
  return "unverified";
}
