import { supabaseAdmin } from "@/utils/supabase/admin";
import ngeohash from "ngeohash";

const DEFAULT_TRAVEL_MINS = 30;
const CACHE_TTL_DAYS = 7;
const GEOHASH_PRECISION = 6; // ~1.2km grid

/**
 * Determine the time_bucket string for a given date in Dubai (GST, UTC+4).
 * Buckets: 0600-1159 → "DAY_0600", 1200-1659 → "DAY_1200", 1700-2359 → "DAY_1700"
 */
export function getTimeBucket(date: Date): string {
  // Use Intl to get the Dubai-local day/hour regardless of server timezone
  const dubaiParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const weekday = dubaiParts.find((p) => p.type === "weekday")?.value?.toUpperCase().slice(0, 3) || "MON";
  // Node 20's older ICU returns "24" for midnight in `hour12: false` mode;
  // Node 22+ correctly returns "0". `% 24` normalises either way.
  const hour = Number(dubaiParts.find((p) => p.type === "hour")?.value ?? 12) % 24;

  // Map Intl weekday abbreviations to our DAY_ABBREVS
  const dayMap: Record<string, string> = {
    SUN: "SUN", MON: "MON", TUE: "TUE", WED: "WED", THU: "THU", FRI: "FRI", SAT: "SAT",
  };
  const day = dayMap[weekday] || weekday;

  if (hour < 12) return `${day}_0600`;
  if (hour < 17) return `${day}_1200`;
  return `${day}_1700`;
}

/**
 * Geocode an address to lat/lng using Google Maps Geocoding API.
 * Returns null if geocoding fails.
 */
async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_MAPS_SERVER_KEY (or GOOGLE_MAPS_API_KEY) is not configured");
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }

    console.error(`Geocoding failed for "${address}": ${data.status}`);
    return null;
  } catch (error) {
    console.error(`Geocoding error for "${address}":`, error);
    return null;
  }
}

/**
 * Call Google Maps Distance Matrix API with pessimistic traffic model.
 * Returns travel duration in minutes, or null on failure.
 */
async function fetchDistanceMatrix(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  departureTime: Date
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const departureSecs = Math.floor(departureTime.getTime() / 1000);
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${originLat},${originLng}` +
    `&destinations=${destLat},${destLng}` +
    `&departure_time=${departureSecs}` +
    `&traffic_model=pessimistic` +
    `&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (
      data.status === "OK" &&
      data.rows?.[0]?.elements?.[0]?.status === "OK"
    ) {
      const element = data.rows[0].elements[0];
      // Prefer duration_in_traffic (pessimistic), fallback to duration
      const durationSecs =
        element.duration_in_traffic?.value ?? element.duration?.value;
      return Math.ceil(durationSecs / 60);
    }

    console.error("Distance Matrix API error:", data.status);
    return null;
  } catch (error) {
    console.error("Distance Matrix fetch error:", error);
    return null;
  }
}

/**
 * Get travel time between two addresses in minutes.
 *
 * Logic flow:
 * 1. Geocode both addresses to lat/lng
 * 2. Convert to precision-6 geohashes (~1.2km grid)
 * 3. Determine time_bucket from date
 * 4. Check travel_cache in Supabase — return cached value if valid
 * 5. On cache miss, call Google Maps Distance Matrix (pessimistic traffic)
 * 6. Save result to travel_cache with 7-day TTL
 * 7. Return duration in minutes (defaults to 30 mins if all APIs fail)
 */
export async function getTravelTime(
  originAddress: string,
  destAddress: string,
  date: Date
): Promise<number> {
  // Step 1: Geocode both addresses
  const [originCoords, destCoords] = await Promise.all([
    geocodeAddress(originAddress),
    geocodeAddress(destAddress),
  ]);

  if (!originCoords || !destCoords) {
    console.warn("Geocoding failed, returning default travel time");
    return DEFAULT_TRAVEL_MINS;
  }

  // Step 2: Convert to geohashes
  const originGeohash = ngeohash.encode(
    originCoords.lat,
    originCoords.lng,
    GEOHASH_PRECISION
  );
  const destGeohash = ngeohash.encode(
    destCoords.lat,
    destCoords.lng,
    GEOHASH_PRECISION
  );

  // Step 3: Determine time bucket
  const timeBucket = getTimeBucket(date);

  // Step 4: Check cache
  try {
    const supabase = supabaseAdmin;
    const now = new Date().toISOString();

    const { data: cached } = await supabase
      .from("travel_cache")
      .select("duration_mins")
      .eq("origin_geohash", originGeohash)
      .eq("dest_geohash", destGeohash)
      .eq("time_bucket", timeBucket)
      .gt("expires_at", now)
      .returns<{ duration_mins: number }[]>()
      .single();

    if (cached) {
      return cached.duration_mins;
    }
  } catch {
    // Cache miss or query error — continue to API call
  }

  // Step 5: Call Google Maps Distance Matrix
  const durationMins = await fetchDistanceMatrix(
    originCoords.lat,
    originCoords.lng,
    destCoords.lat,
    destCoords.lng,
    date
  );

  if (durationMins === null) {
    console.warn("Distance Matrix failed, returning default travel time");
    return DEFAULT_TRAVEL_MINS;
  }

  // Step 6: Save to cache
  try {
    const supabase = supabaseAdmin;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

    await supabase.from("travel_cache").upsert(
      {
        origin_geohash: originGeohash,
        dest_geohash: destGeohash,
        time_bucket: timeBucket,
        duration_mins: durationMins,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      } as never,
      { onConflict: "origin_geohash,dest_geohash,time_bucket" }
    );
  } catch (error) {
    console.error("Failed to write travel cache:", error);
  }

  // Step 7: Return the duration
  return durationMins;
}
