/**
 * Pure helper functions for slot availability computation.
 * Extracted from the slots API route for testability.
 */

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 18;
const SLOT_INCREMENT_MINS = 30;
const MINIMUM_TRAVEL_BUFFER_MINS = 20;
/** UAE is UTC+4 year-round (no DST). Single source of truth for timezone offset. */
export const UAE_OFFSET_HOURS = 4;
/** Timezone offset string for date queries (e.g., "T00:00:00+04:00"). */
export const UAE_TZ_SUFFIX = "+04:00";

export interface TimeRange {
  startMins: number;
  endMins: number;
}

export interface BookingRecord {
  slot_start: string;
  slot_end: string;
  team_id: string | null;
  address: string | null;
}

export interface LockRecord {
  slot_start: string;
}

/** Convert total minutes from midnight to "HH:MM" */
export function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Generate candidate slot start times (every 30 mins from 08:00 to 18:00) */
export function generateCandidateSlots(jobDurationMins: number): number[] {
  const slots: number[] = [];
  const startMins = DAY_START_HOUR * 60;
  const endMins = DAY_END_HOUR * 60;

  for (let m = startMins; m + jobDurationMins <= endMins; m += SLOT_INCREMENT_MINS) {
    slots.push(m);
  }
  return slots;
}

/** Check if two time ranges overlap */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startMins < b.endMins && b.startMins < a.endMins;
}

/**
 * Extract minute-of-day in UAE local time (UTC+4) from a timestamp string.
 */
export function timestampToMins(ts: string): number {
  const d = new Date(ts);
  const uaeHours = (d.getUTCHours() + UAE_OFFSET_HOURS) % 24;
  return uaeHours * 60 + d.getUTCMinutes();
}

/**
 * Pass 1: DB Filter — remove slots where all teams are occupied.
 */
export function pass1DbFilter(
  candidates: number[],
  jobDurationMins: number,
  bookings: BookingRecord[],
  locks: LockRecord[],
  totalActiveTeams: number
): number[] {
  return candidates.filter((slotStart) => {
    const candidateRange: TimeRange = {
      startMins: slotStart,
      endMins: slotStart + jobDurationMins,
    };

    let occupiedCount = 0;

    for (const b of bookings) {
      const bookingRange: TimeRange = {
        startMins: timestampToMins(b.slot_start),
        endMins: timestampToMins(b.slot_end),
      };
      if (rangesOverlap(candidateRange, bookingRange)) {
        occupiedCount++;
      }
    }

    for (const l of locks) {
      const lockRange: TimeRange = {
        startMins: timestampToMins(l.slot_start),
        endMins: timestampToMins(l.slot_start) + jobDurationMins,
      };
      if (rangesOverlap(candidateRange, lockRange)) {
        occupiedCount++;
      }
    }

    return occupiedCount < totalActiveTeams;
  });
}

/**
 * Pass 2: Buffer Filter — enforce minimum travel gap between bookings.
 */
export function pass2BufferFilter(
  candidates: number[],
  bookings: BookingRecord[],
  jobDurationMins: number
): number[] {
  if (bookings.length === 0) return candidates;

  return candidates.filter((slotStart) => {
    const candidateEnd = slotStart + jobDurationMins;

    for (const b of bookings) {
      const bookingStart = timestampToMins(b.slot_start);
      const bookingEnd = timestampToMins(b.slot_end);

      const forwardGap = slotStart - bookingEnd;
      if (forwardGap >= 0 && forwardGap < MINIMUM_TRAVEL_BUFFER_MINS) {
        return false;
      }

      const backwardGap = bookingStart - candidateEnd;
      if (backwardGap >= 0 && backwardGap < MINIMUM_TRAVEL_BUFFER_MINS) {
        return false;
      }
    }
    return true;
  });
}
