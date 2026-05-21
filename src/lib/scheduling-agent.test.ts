import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseAdmin before import
const mockFrom = vi.fn();
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { uaeDayOfWeek, assignTeamToBooking } from "./scheduling-agent";

// ─── uaeDayOfWeek ──────────────────────────────────────────────────────────

describe("uaeDayOfWeek", () => {
  it("returns correct day for Tuesday Dubai (UTC timestamp)", () => {
    // 2025-04-15 04:00 UTC = Tuesday 08:00 Dubai → day 2
    expect(uaeDayOfWeek("2025-04-15T04:00:00Z")).toBe(2);
  });

  it("returns next day when UTC is late evening", () => {
    // 2025-04-15 22:00 UTC = Wednesday 02:00 Dubai → day 3
    expect(uaeDayOfWeek("2025-04-15T22:00:00Z")).toBe(3);
  });

  it("handles +04:00 offset correctly", () => {
    // 2025-04-15T10:00:00+04:00 = Tuesday → day 2
    expect(uaeDayOfWeek("2025-04-15T10:00:00+04:00")).toBe(2);
  });

  it("returns Sunday (0) correctly", () => {
    // 2025-04-13 06:00 UTC = Sunday 10:00 Dubai → day 0
    expect(uaeDayOfWeek("2025-04-13T06:00:00Z")).toBe(0);
  });

  it("returns Saturday (6) correctly", () => {
    // 2025-04-19 06:00 UTC = Saturday 10:00 Dubai → day 6
    expect(uaeDayOfWeek("2025-04-19T06:00:00Z")).toBe(6);
  });
});

// ─── assignTeamToBooking (deterministic fallback) ──────────────────────────

describe("assignTeamToBooking — deterministic fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No OpenRouter key → goes straight to deterministic fallback
    delete process.env.OPENROUTER_API_KEY;
  });

  it("assigns least-booked team among available teams", async () => {
    // Setup: 2 teams, team-a has 2 bookings, team-b has 0
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [
                    { team_id: "team-a", day_of_week: 2, start_time: "08:00", end_time: "18:00" },
                    { team_id: "team-b", day_of_week: 2, start_time: "08:00", end_time: "18:00" },
                  ],
                }),
              }),
            }),
          }),
        };
      }
      if (table === "teams") {
        return {
          select: () => ({
            in: () => ({
              returns: vi.fn().mockResolvedValue({
                data: [
                  { id: "team-a", name: "Alpha" },
                  { id: "team-b", name: "Bravo" },
                ],
              }),
            }),
            eq: () => ({
              returns: vi.fn().mockResolvedValue({
                data: [
                  { id: "team-a", name: "Alpha" },
                  { id: "team-b", name: "Bravo" },
                ],
              }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        const bookingData = [
          { team_id: "team-a", slot_start: "2025-04-15T08:00:00+04:00", slot_end: "2025-04-15T09:30:00+04:00", address: "addr1", address_details: null },
          { team_id: "team-a", slot_start: "2025-04-15T12:00:00+04:00", slot_end: "2025-04-15T13:30:00+04:00", address: "addr2", address_details: null },
        ];
        return {
          select: () => ({
            // Single-booking lookup for address_details (new code path)
            eq: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({ data: { address_details: null }, error: null }),
              }),
            }),
            // List query for getExistingBookingsForDate
            gte: () => ({
              lte: () => ({
                not: () => ({
                  not: () => ({
                    returns: vi.fn().mockResolvedValue({ data: bookingData }),
                  }),
                  returns: vi.fn().mockResolvedValue({ data: bookingData }),
                }),
              }),
            }),
          }),
          // Conditional team_id update (only when team_id IS NULL)
          update: () => ({
            eq: () => ({
              is: () => ({
                select: () => ({
                  returns: vi.fn().mockResolvedValue({ data: [{ id: "booking-123" }], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "slot_locks") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                returns: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const result = await assignTeamToBooking(
      "booking-123",
      "2025-04-15T10:00:00+04:00",
      "123 Test St"
    );

    expect(result.method).toBe("fallback");
    expect(result.teamId).toBe("team-b"); // least booked
  });

  it("throws when no teams are available", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
        };
      }
      if (table === "teams") {
        return {
          select: () => ({
            in: () => ({
              returns: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                not: () => ({
                  not: () => ({
                    returns: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                  returns: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "slot_locks") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                returns: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    await expect(
      assignTeamToBooking("booking-123", "2025-04-15T10:00:00+04:00", "addr")
    ).rejects.toThrow("No teams available");
  });
});

// ─── Agent path (OpenRouter fails → fallback) ─────────────────────────────

describe("assignTeamToBooking — agent path failure → fallback", () => {
  const mockGlobalFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "real-key";
    vi.stubGlobal("fetch", mockGlobalFetch);

    // Setup team data for fallback
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [{ team_id: "team-a", day_of_week: 2, start_time: "08:00", end_time: "18:00" }],
                }),
              }),
            }),
          }),
        };
      }
      if (table === "teams") {
        return {
          select: () => ({
            in: () => ({
              returns: vi.fn().mockResolvedValue({
                data: [{ id: "team-a", name: "Alpha" }],
              }),
            }),
            eq: () => ({
              returns: vi.fn().mockResolvedValue({
                data: [{ id: "team-a", name: "Alpha" }],
              }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({ data: { address_details: null }, error: null }),
              }),
            }),
            gte: () => ({
              lte: () => ({
                not: () => ({
                  not: () => ({
                    returns: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                  returns: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              is: () => ({
                select: () => ({
                  returns: vi.fn().mockResolvedValue({ data: [{ id: "booking-123" }], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "slot_locks") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                returns: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });
  });

  it("falls back when OpenRouter returns non-200", async () => {
    mockGlobalFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await assignTeamToBooking(
      "booking-123",
      "2025-04-15T10:00:00+04:00",
      "123 St"
    );
    expect(result.method).toBe("fallback");
    expect(result.teamId).toBe("team-a");
  });

  it("falls back when OpenRouter throws a network error", async () => {
    mockGlobalFetch.mockRejectedValue(new Error("network error"));

    const result = await assignTeamToBooking(
      "booking-123",
      "2025-04-15T10:00:00+04:00",
      "123 St"
    );
    expect(result.method).toBe("fallback");
  });

  it("falls back when agent returns no tool calls (no assignment)", async () => {
    mockGlobalFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            role: "assistant",
            content: "I cannot determine the best team.",
            tool_calls: [],
          },
        }],
      }),
    });

    const result = await assignTeamToBooking(
      "booking-123",
      "2025-04-15T10:00:00+04:00",
      "123 St"
    );
    expect(result.method).toBe("fallback");
  });

  it("skips placeholder OpenRouter key", async () => {
    process.env.OPENROUTER_API_KEY = "your_openrouter_api_key";

    const result = await assignTeamToBooking(
      "booking-123",
      "2025-04-15T10:00:00+04:00",
      "123 St"
    );
    expect(result.method).toBe("fallback");
    // Should NOT have called fetch (OpenRouter)
    expect(mockGlobalFetch).not.toHaveBeenCalled();
  });
});
