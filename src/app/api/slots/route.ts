import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { getTravelTime } from "@/lib/travel-math";
import {
  type BookingRecord,
  type LockRecord,
  minsToTime,
  generateCandidateSlots,
  timestampToMins,
  pass1DbFilter,
  pass2BufferFilter,
} from "@/lib/slot-helpers";

const DEFAULT_JOB_DURATION_MINS = 90;
const MINIMUM_TRAVEL_BUFFER_MINS = 20;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const STALE_BOOKING_TTL_MINS = 15;

// Throttle: only run stale booking cleanup once per 60 seconds
let lastCleanupTime = 0;
const CLEANUP_THROTTLE_MS = 60_000;

// ─── Pass 2b: Travel-Aware Filter ──────────────────────────────────────────
// When customer address is known, compute per-team availability windows
// using Google Maps travel time + 20-min buffer instead of a flat gap.

async function pass2TravelFilter(
  candidates: number[],
  jobDurationMins: number,
  bookings: BookingRecord[],
  locks: LockRecord[],
  customerAddress: string,
  activeTeamIds: string[],
  referenceDate: Date
): Promise<number[]> {
  // Group confirmed bookings by team
  const teamBookings = new Map<string, BookingRecord[]>();
  const unassigned: BookingRecord[] = [];

  for (const id of activeTeamIds) teamBookings.set(id, []);

  for (const b of bookings) {
    if (b.team_id && teamBookings.has(b.team_id)) {
      teamBookings.get(b.team_id)!.push(b);
    } else {
      unassigned.push(b);
    }
  }

  // Sort each team's bookings by start time
  const teamEntries = Array.from(teamBookings.entries());
  for (const [, bks] of teamEntries) {
    bks.sort((a, b) => timestampToMins(a.slot_start) - timestampToMins(b.slot_start));
  }

  // Collect unique booking addresses and batch-compute travel times in parallel
  const uniqueAddresses = new Set<string>();
  for (const [, bks] of teamEntries) {
    for (const b of bks) {
      if (b.address) uniqueAddresses.add(b.address);
    }
  }

  const travelFrom = new Map<string, number>(); // booking addr → customer
  const travelTo = new Map<string, number>();   // customer → booking addr

  await Promise.all(
    Array.from(uniqueAddresses).map(async (addr) => {
      const [fromTime, toTime] = await Promise.all([
        getTravelTime(addr, customerAddress, referenceDate),
        getTravelTime(customerAddress, addr, referenceDate),
      ]);
      travelFrom.set(addr, fromTime);
      travelTo.set(addr, toTime);
    })
  );

  // Compute per-team availability windows
  const dayStart = DAY_START_HOUR * 60;
  const dayEnd = DAY_END_HOUR * 60;
  const allWindows: { start: number; end: number }[] = [];

  for (const [, bks] of teamEntries) {
    if (bks.length === 0) {
      allWindows.push({ start: dayStart, end: dayEnd });
      continue;
    }

    // Window before first booking
    const firstStart = timestampToMins(bks[0].slot_start);
    const firstAddr = bks[0].address;
    const toFirst = firstAddr
      ? (travelTo.get(firstAddr) ?? MINIMUM_TRAVEL_BUFFER_MINS)
      : MINIMUM_TRAVEL_BUFFER_MINS;
    const beforeEnd = firstStart - toFirst - MINIMUM_TRAVEL_BUFFER_MINS;
    if (beforeEnd > dayStart) {
      allWindows.push({ start: dayStart, end: beforeEnd });
    }

    // Windows between consecutive bookings
    for (let i = 0; i < bks.length - 1; i++) {
      const prevEnd = timestampToMins(bks[i].slot_end);
      const nextStart = timestampToMins(bks[i + 1].slot_start);

      const prevAddr = bks[i].address;
      const fromPrev = prevAddr
        ? (travelFrom.get(prevAddr) ?? MINIMUM_TRAVEL_BUFFER_MINS)
        : MINIMUM_TRAVEL_BUFFER_MINS;
      const nextAddr = bks[i + 1].address;
      const toNext = nextAddr
        ? (travelTo.get(nextAddr) ?? MINIMUM_TRAVEL_BUFFER_MINS)
        : MINIMUM_TRAVEL_BUFFER_MINS;

      const gapStart = prevEnd + fromPrev + MINIMUM_TRAVEL_BUFFER_MINS;
      const gapEnd = nextStart - toNext - MINIMUM_TRAVEL_BUFFER_MINS;

      if (gapEnd > gapStart) {
        allWindows.push({ start: gapStart, end: gapEnd });
      }
    }

    // Window after last booking
    const lastEnd = timestampToMins(bks[bks.length - 1].slot_end);
    const lastAddr = bks[bks.length - 1].address;
    const fromLast = lastAddr
      ? (travelFrom.get(lastAddr) ?? MINIMUM_TRAVEL_BUFFER_MINS)
      : MINIMUM_TRAVEL_BUFFER_MINS;
    const afterStart = lastEnd + fromLast + MINIMUM_TRAVEL_BUFFER_MINS;
    if (afterStart < dayEnd) {
      allWindows.push({ start: afterStart, end: dayEnd });
    }
  }

  // Filter candidates
  return candidates.filter((slotStart) => {
    const slotEnd = slotStart + jobDurationMins;

    // Flat buffer for unassigned bookings (no team yet — conservative)
    for (const b of unassigned) {
      const bStart = timestampToMins(b.slot_start);
      const bEnd = timestampToMins(b.slot_end);
      if (slotStart - bEnd >= 0 && slotStart - bEnd < MINIMUM_TRAVEL_BUFFER_MINS) return false;
      if (bStart - slotEnd >= 0 && bStart - slotEnd < MINIMUM_TRAVEL_BUFFER_MINS) return false;
    }

    // Flat buffer for locks (no address/team info)
    for (const l of locks) {
      const lStart = timestampToMins(l.slot_start);
      const lEnd = lStart + jobDurationMins;
      if (slotStart - lEnd >= 0 && slotStart - lEnd < MINIMUM_TRAVEL_BUFFER_MINS) return false;
      if (lStart - slotEnd >= 0 && lStart - slotEnd < MINIMUM_TRAVEL_BUFFER_MINS) return false;
    }

    // Slot available if it fits in any team's availability window
    for (const w of allWindows) {
      if (slotStart >= w.start && slotEnd <= w.end) return true;
    }
    return false;
  });
}

// ─── Route Handler ──────────────────────────────────────────────────────────

/**
 * GET /api/slots?date=YYYY-MM-DD&address=...&job_duration_mins=90
 *
 * Layer 1 - Deterministic Slot Filter (customer-facing, synchronous)
 *
 * Two-Pass filter:
 *   Pass 1: Remove slots where all teams are occupied (bookings + locks)
 *   Pass 2: Remove slots that violate travel buffer
 *          - With address: per-team Google Maps travel time + 20-min buffer
 *          - Without address: flat 20-min buffer (fallback)
 *
 * Returns a clean JSON array of available time strings.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const address = searchParams.get("address");
  const jobDurationParam = searchParams.get("job_duration_mins");

  // Validate date format and value
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid or missing date parameter. Use YYYY-MM-DD format." },
      { status: 400 }
    );
  }

  const parsedDate = new Date(date + "T12:00:00+04:00");
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid date value." },
      { status: 400 }
    );
  }

  const jobDurationMins = jobDurationParam
    ? parseInt(jobDurationParam, 10)
    : DEFAULT_JOB_DURATION_MINS;

  if (isNaN(jobDurationMins) || jobDurationMins < 30 || jobDurationMins > 480) {
    return NextResponse.json(
      { error: "job_duration_mins must be between 30 and 480." },
      { status: 400 }
    );
  }

  try {
    const supabase = supabaseAdmin;

    // Cleanup: expire pending bookings older than 15 min (throttled to once per 60s)
    const now = Date.now();
    if (now - lastCleanupTime > CLEANUP_THROTTLE_MS) {
      lastCleanupTime = now;
      const staleCutoff = new Date(now - STALE_BOOKING_TTL_MINS * 60 * 1000).toISOString();
      await supabase
        .from("bookings")
        .update({ status: "expired" } as never)
        .eq("status", "pending")
        .lt("created_at", staleCutoff);
    }

    // Parse date as UAE local — "T12:00:00+04:00" ensures correct day-of-week
    const dayOfWeek = new Date(date + "T12:00:00+04:00").getDay();

    // ── 1. Fetch active team schedules for this day ──────────────────────

    const { data: schedules, error: scheduleError } = await supabase
      .from("team_schedules")
      .select("team_id, start_time, end_time")
      .eq("day_of_week", dayOfWeek)
      .eq("active", true)
      .returns<{ team_id: string; start_time: string; end_time: string }[]>();

    if (scheduleError) {
      console.error("Schedule query error:", scheduleError);
      return NextResponse.json(
        { error: "Failed to fetch team schedules." },
        { status: 500 }
      );
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ date, slots: [], total_teams: 0 });
    }

    const activeTeamIds = Array.from(new Set(schedules.map((s) => s.team_id)));
    const totalActiveTeams = activeTeamIds.length;

    // ── 2. Generate candidate slots (every 30 mins, 08:00–18:00) ─────────

    const candidates = generateCandidateSlots(jobDurationMins);

    // ── 3. Query existing bookings for this date (non-cancelled) ─────────

    // UAE midnight = 20:00 UTC previous day. Use +04:00 offset for correct range.
    const dayStart = `${date}T00:00:00+04:00`;
    const dayEnd = `${date}T23:59:59+04:00`;

    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("slot_start, slot_end, team_id, address")
      .gte("slot_start", dayStart)
      .lte("slot_start", dayEnd)
      .in("status", ["pending", "confirmed"])
      .returns<BookingRecord[]>();

    if (bookingsError) {
      console.error("Bookings query error:", bookingsError);
      return NextResponse.json(
        { error: "Failed to fetch existing bookings." },
        { status: 500 }
      );
    }

    // ── 4. Query active (non-expired) booking locks for this date ────────

    const { data: locks, error: locksError } = await supabase
      .from("booking_locks")
      .select("slot_start")
      .gte("slot_start", dayStart)
      .lte("slot_start", dayEnd)
      .gt("expires_at", new Date().toISOString())
      .returns<LockRecord[]>();

    if (locksError) {
      console.error("Locks query error:", locksError);
      return NextResponse.json(
        { error: "Failed to fetch booking locks." },
        { status: 500 }
      );
    }

    // ── 5. Pass 1: DB Filter — remove fully-occupied slots ───────────────

    const afterPass1 = pass1DbFilter(
      candidates,
      jobDurationMins,
      bookings || [],
      locks || [],
      totalActiveTeams
    );

    // ── 6. Pass 2: Travel-aware filter (or flat buffer fallback) ──────────

    const referenceDate = new Date(date + "T12:00:00+04:00");
    const afterPass2 = address && process.env.GOOGLE_MAPS_API_KEY
      ? await pass2TravelFilter(
          afterPass1, jobDurationMins, bookings || [], locks || [],
          address, activeTeamIds, referenceDate
        )
      : pass2BufferFilter(afterPass1, bookings || [], jobDurationMins);

    // ── 7. Return clean time strings ─────────────────────────────────────

    const availableSlots = afterPass2.map(minsToTime);

    return NextResponse.json({
      date,
      slots: availableSlots,
      total_teams: totalActiveTeams,
    });
  } catch (error) {
    console.error("Slot availability error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
