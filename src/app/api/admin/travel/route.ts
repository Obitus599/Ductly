import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import ngeohash from "ngeohash";

const UAE_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4

interface GeoResult {
  lat: number;
  lng: number;
  formatted: string;
}

interface TravelResult {
  origin: GeoResult;
  destination: GeoResult;
  origin_geohash: string;
  dest_geohash: string;
  distance_km: number;
  duration_normal_mins: number;
  duration_traffic_mins: number;
  traffic_model: string;
  departure_time: string;
  day_of_week: string;
  time_bucket: string;
  buffer_mins: number;
  total_blocked_mins: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ABBREVS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const VALID_TRAFFIC_MODELS = ["pessimistic", "best_guess", "optimistic"];

/** Get time bucket in UAE local time (UTC+4) */
function getTimeBucket(date: Date): string {
  const uaeMs = date.getTime() + UAE_OFFSET_MS;
  const uaeDate = new Date(uaeMs);
  const day = DAY_ABBREVS[uaeDate.getUTCDay()];
  const hour = uaeDate.getUTCHours();
  if (hour < 12) return `${day}_0600`;
  if (hour < 17) return `${day}_1200`;
  return `${day}_1700`;
}

/** Get day-of-week name in UAE local time (UTC+4) */
function uaeDayName(date: Date): string {
  const uaeMs = date.getTime() + UAE_OFFSET_MS;
  return DAY_NAMES[new Date(uaeMs).getUTCDay()];
}

async function geocode(address: string, apiKey: string): Promise<GeoResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "OK" && data.results.length > 0) {
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng, formatted: data.results[0].formatted_address };
  }
  return null;
}

async function distanceMatrix(
  origin: GeoResult,
  dest: GeoResult,
  departureTime: Date,
  trafficModel: string,
  apiKey: string
): Promise<{
  distance_km: number;
  duration_normal_mins: number;
  duration_traffic_mins: number;
} | null> {
  const departureSecs = Math.floor(departureTime.getTime() / 1000);
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origin.lat},${origin.lng}` +
    `&destinations=${dest.lat},${dest.lng}` +
    `&departure_time=${departureSecs}` +
    `&traffic_model=${encodeURIComponent(trafficModel)}` +
    `&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
    const el = data.rows[0].elements[0];
    return {
      distance_km: Math.round((el.distance?.value ?? 0) / 100) / 10,
      duration_normal_mins: Math.ceil((el.duration?.value ?? 0) / 60),
      duration_traffic_mins: Math.ceil((el.duration_in_traffic?.value ?? el.duration?.value ?? 0) / 60),
    };
  }
  return null;
}

/**
 * POST /api/admin/travel
 *
 * Calculates travel time between two addresses with full diagnostic breakdown.
 * Body: {
 *   origin: string,
 *   destination: string,
 *   departure_time?: string (ISO),
 *   traffic_model?: "pessimistic" | "best_guess" | "optimistic"
 * }
 */
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  // Read API key per-request (supports key rotation without restart)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const { origin, destination, departure_time, traffic_model } = body as {
    origin?: string;
    destination?: string;
    departure_time?: string;
    traffic_model?: string;
  };

  if (!origin || !destination) {
    return NextResponse.json(
      { error: "origin and destination addresses are required." },
      { status: 400 }
    );
  }

  // Validate traffic model against whitelist
  const trafficModel = VALID_TRAFFIC_MODELS.includes(traffic_model || "")
    ? traffic_model!
    : "pessimistic";

  const departureDate = departure_time
    ? new Date(departure_time as string)
    : new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now default

  if (isNaN(departureDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid departure_time." },
      { status: 400 }
    );
  }

  // Ensure departure is in the future (Google requires this)
  if (departureDate.getTime() < Date.now()) {
    departureDate.setTime(Date.now() + 60 * 60 * 1000);
  }

  try {
    // Geocode both addresses in parallel
    const [originGeo, destGeo] = await Promise.all([
      geocode(origin, apiKey),
      geocode(destination, apiKey),
    ]);

    if (!originGeo) {
      return NextResponse.json(
        { error: "Could not geocode the origin address." },
        { status: 400 }
      );
    }
    if (!destGeo) {
      return NextResponse.json(
        { error: "Could not geocode the destination address." },
        { status: 400 }
      );
    }

    // Compute geohashes
    const originGeohash = ngeohash.encode(originGeo.lat, originGeo.lng, 6);
    const destGeohash = ngeohash.encode(destGeo.lat, destGeo.lng, 6);

    // Distance Matrix
    const dm = await distanceMatrix(originGeo, destGeo, departureDate, trafficModel, apiKey);

    if (!dm) {
      return NextResponse.json(
        { error: "Distance Matrix API returned no results." },
        { status: 502 }
      );
    }

    const BUFFER_MINS = 20;
    const result: TravelResult = {
      origin: originGeo,
      destination: destGeo,
      origin_geohash: originGeohash,
      dest_geohash: destGeohash,
      distance_km: dm.distance_km,
      duration_normal_mins: dm.duration_normal_mins,
      duration_traffic_mins: dm.duration_traffic_mins,
      traffic_model: trafficModel,
      departure_time: departureDate.toISOString(),
      day_of_week: uaeDayName(departureDate),
      time_bucket: getTimeBucket(departureDate),
      buffer_mins: BUFFER_MINS,
      total_blocked_mins: dm.duration_traffic_mins + BUFFER_MINS,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Travel calculation error:", error);
    return NextResponse.json(
      { error: "Travel calculation failed." },
      { status: 500 }
    );
  }
}
