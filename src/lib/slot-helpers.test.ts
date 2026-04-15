import { describe, it, expect } from "vitest";
import {
  minsToTime,
  generateCandidateSlots,
  rangesOverlap,
  timestampToMins,
  pass1DbFilter,
  pass2BufferFilter,
  type BookingRecord,
  type LockRecord,
} from "./slot-helpers";

// ─── minsToTime ─────────────────────────────────────────────────────────────

describe("minsToTime", () => {
  it("converts 0 mins to 00:00", () => {
    expect(minsToTime(0)).toBe("00:00");
  });

  it("converts 480 mins (8h) to 08:00", () => {
    expect(minsToTime(480)).toBe("08:00");
  });

  it("converts 1080 mins (18h) to 18:00", () => {
    expect(minsToTime(1080)).toBe("18:00");
  });

  it("converts 615 mins to 10:15", () => {
    expect(minsToTime(615)).toBe("10:15");
  });

  it("pads single-digit hours and minutes", () => {
    expect(minsToTime(65)).toBe("01:05");
  });
});

// ─── generateCandidateSlots ────────────────────────────────────────────────

describe("generateCandidateSlots", () => {
  it("generates correct slots for 90-min job (08:00 to 16:30)", () => {
    const slots = generateCandidateSlots(90);
    // 08:00 (480) to 16:30 (990), step 30
    // Last valid: 990 + 90 = 1080 = 18:00 ✓
    expect(slots[0]).toBe(480); // 08:00
    expect(slots[slots.length - 1]).toBe(990); // 16:30
    expect(slots.length).toBe(18); // (990-480)/30 + 1 = 18
  });

  it("generates correct slots for 30-min job", () => {
    const slots = generateCandidateSlots(30);
    expect(slots[0]).toBe(480); // 08:00
    expect(slots[slots.length - 1]).toBe(1050); // 17:30
    expect(slots.length).toBe(20);
  });

  it("generates correct slots for 480-min (8h full-day) job", () => {
    const slots = generateCandidateSlots(480);
    // Only 08:00 fits (480 + 480 = 960 < 1080? No, 960 < 1080 ✓) wait...
    // 480 + 480 = 960 ≤ 1080? yes. 510 + 480 = 990 ≤ 1080? yes. ... 600 + 480 = 1080 ≤ 1080? yes.
    expect(slots[0]).toBe(480);
    expect(slots[slots.length - 1]).toBe(600); // 10:00 + 480 = 1080 = 18:00
    expect(slots.length).toBe(5);
  });

  it("generates empty array when job exceeds full day", () => {
    const slots = generateCandidateSlots(601); // > 600 min (10h window)
    expect(slots).toEqual([]);
  });
});

// ─── rangesOverlap ─────────────────────────────────────────────────────────

describe("rangesOverlap", () => {
  it("detects overlapping ranges", () => {
    expect(
      rangesOverlap({ startMins: 480, endMins: 570 }, { startMins: 540, endMins: 630 })
    ).toBe(true);
  });

  it("detects contained range", () => {
    expect(
      rangesOverlap({ startMins: 480, endMins: 630 }, { startMins: 510, endMins: 570 })
    ).toBe(true);
  });

  it("returns false for adjacent ranges (no overlap)", () => {
    expect(
      rangesOverlap({ startMins: 480, endMins: 570 }, { startMins: 570, endMins: 660 })
    ).toBe(false);
  });

  it("returns false for non-overlapping ranges", () => {
    expect(
      rangesOverlap({ startMins: 480, endMins: 570 }, { startMins: 600, endMins: 690 })
    ).toBe(false);
  });

  it("returns true for identical ranges", () => {
    expect(
      rangesOverlap({ startMins: 480, endMins: 570 }, { startMins: 480, endMins: 570 })
    ).toBe(true);
  });
});

// ─── timestampToMins ───────────────────────────────────────────────────────

describe("timestampToMins", () => {
  it("converts UTC midnight to 04:00 UAE (240 mins)", () => {
    expect(timestampToMins("2025-04-15T00:00:00Z")).toBe(240);
  });

  it("converts 08:00 UAE (04:00 UTC) correctly", () => {
    expect(timestampToMins("2025-04-15T04:00:00Z")).toBe(480);
  });

  it("handles +04:00 offset timestamps", () => {
    // 10:30 +04:00 = 06:30 UTC, UAE = 06:30 + 4 = 10:30 = 630 mins
    expect(timestampToMins("2025-04-15T10:30:00+04:00")).toBe(630);
  });

  it("wraps around midnight correctly (UTC 22:00 = UAE 02:00)", () => {
    // UTC 22:00 + 4 = 26 % 24 = 2 = 120 mins
    expect(timestampToMins("2025-04-15T22:00:00Z")).toBe(120);
  });
});

// ─── pass1DbFilter ─────────────────────────────────────────────────────────

describe("pass1DbFilter", () => {
  const JOB = 90;

  it("returns all candidates when no bookings or locks", () => {
    const candidates = [480, 510, 540];
    const result = pass1DbFilter(candidates, JOB, [], [], 2);
    expect(result).toEqual(candidates);
  });

  it("removes slot when all teams are occupied by bookings", () => {
    const candidates = [480, 570, 660];
    // Two bookings overlapping the 08:00 slot (480-570), with 2 teams
    const bookings: BookingRecord[] = [
      { slot_start: "2025-04-15T04:00:00Z", slot_end: "2025-04-15T05:30:00Z", team_id: "t1", address: null },
      { slot_start: "2025-04-15T04:30:00Z", slot_end: "2025-04-15T06:00:00Z", team_id: "t2", address: null },
    ];
    const result = pass1DbFilter(candidates, JOB, bookings, [], 2);
    // 480 slot is fully occupied (2 bookings overlap, 2 teams) → removed
    expect(result).not.toContain(480);
    // 570 is partially occupied (1 booking overlaps) → kept
    // 660 has no overlap → kept
    expect(result).toContain(660);
  });

  it("keeps slot when only some teams are occupied", () => {
    const candidates = [480];
    const bookings: BookingRecord[] = [
      { slot_start: "2025-04-15T04:00:00Z", slot_end: "2025-04-15T05:30:00Z", team_id: "t1", address: null },
    ];
    const result = pass1DbFilter(candidates, JOB, bookings, [], 3);
    // 1 occupied out of 3 teams → still available
    expect(result).toContain(480);
  });

  it("counts locks toward occupancy", () => {
    const candidates = [480];
    const bookings: BookingRecord[] = [
      { slot_start: "2025-04-15T04:00:00Z", slot_end: "2025-04-15T05:30:00Z", team_id: "t1", address: null },
    ];
    const locks: LockRecord[] = [
      { slot_start: "2025-04-15T04:00:00Z" },
    ];
    // 1 booking + 1 lock = 2 occupied, only 2 teams → fully occupied
    const result = pass1DbFilter(candidates, JOB, bookings, locks, 2);
    expect(result).not.toContain(480);
  });
});

// ─── pass2BufferFilter ─────────────────────────────────────────────────────

describe("pass2BufferFilter", () => {
  const JOB = 90;

  it("returns all candidates when no bookings exist", () => {
    const candidates = [480, 540, 600];
    const result = pass2BufferFilter(candidates, [], JOB);
    expect(result).toEqual(candidates);
  });

  it("removes slot too close after a booking (forward gap < 20 min)", () => {
    // Booking: 08:00-09:30 (480-570). Candidate at 09:30 (570) → gap = 0 < 20 → removed
    const bookings: BookingRecord[] = [
      { slot_start: "2025-04-15T04:00:00Z", slot_end: "2025-04-15T05:30:00Z", team_id: "t1", address: null },
    ];
    const result = pass2BufferFilter([570], bookings, JOB);
    expect(result).not.toContain(570);
  });

  it("keeps slot with sufficient forward gap (>= 20 min)", () => {
    // Booking ends at 570. Candidate at 600 → gap = 30 >= 20 → kept
    const bookings: BookingRecord[] = [
      { slot_start: "2025-04-15T04:00:00Z", slot_end: "2025-04-15T05:30:00Z", team_id: "t1", address: null },
    ];
    const result = pass2BufferFilter([600], bookings, JOB);
    expect(result).toContain(600);
  });

  it("removes slot too close before a booking (backward gap < 20 min)", () => {
    // Candidate at 480, job 90 min → ends 570. Booking starts at 580 → gap = 10 < 20 → removed
    const bookings: BookingRecord[] = [
      { slot_start: "2025-04-15T05:40:00Z", slot_end: "2025-04-15T07:10:00Z", team_id: "t1", address: null },
    ];
    const result = pass2BufferFilter([480], bookings, JOB);
    expect(result).not.toContain(480);
  });

  it("keeps slot with exactly 20-min gap", () => {
    // Booking ends at 570. Candidate at 590 → gap = 20, which is NOT < 20 → kept
    const bookings: BookingRecord[] = [
      { slot_start: "2025-04-15T04:00:00Z", slot_end: "2025-04-15T05:30:00Z", team_id: "t1", address: null },
    ];
    const result = pass2BufferFilter([590], bookings, JOB);
    expect(result).toContain(590);
  });
});
