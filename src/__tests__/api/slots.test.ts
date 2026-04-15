import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = { from: vi.fn() };

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => (prop === "from" ? mockSupabase.from : undefined),
  }),
}));

vi.mock("@/lib/travel-math", () => ({
  getTravelTime: vi.fn().mockResolvedValue(30),
}));

import { GET } from "@/app/api/slots/route";

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:3000/api/slots");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function setupDefaultMocks() {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "bookings") {
      // Stale cleanup update chain
      return {
        update: () => ({
          eq: () => ({
            lt: vi.fn().mockResolvedValue({}),
          }),
        }),
        select: () => ({
          gte: () => ({
            lte: () => ({
              in: () => ({
                returns: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "team_schedules") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              returns: vi.fn().mockResolvedValue({
                data: [
                  { team_id: "team-a", start_time: "08:00", end_time: "18:00" },
                  { team_id: "team-b", start_time: "08:00", end_time: "18:00" },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "booking_locks") {
      return {
        select: () => ({
          gte: () => ({
            lte: () => ({
              gt: () => ({
                returns: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

describe("GET /api/slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when date is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await GET(makeRequest({ date: "15-04-2025" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for job_duration_mins out of range", async () => {
    const res = await GET(makeRequest({ date: "2025-04-15", job_duration_mins: "999" }));
    expect(res.status).toBe(400);
  });

  it("returns empty slots when no teams are scheduled", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          update: () => ({ eq: () => ({ lt: vi.fn().mockResolvedValue({}) }) }),
        };
      }
      if (table === "team_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await GET(makeRequest({ date: "2025-04-15" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slots).toEqual([]);
    expect(data.total_teams).toBe(0);
  });

  it("returns available slots for a valid date with active teams", async () => {
    setupDefaultMocks();

    const res = await GET(makeRequest({ date: "2025-04-15" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.date).toBe("2025-04-15");
    expect(data.total_teams).toBe(2);
    expect(data.slots.length).toBeGreaterThan(0);
    // First slot should be 08:00
    expect(data.slots[0]).toBe("08:00");
  });

  it("returns 500 when team schedules query fails", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          update: () => ({ eq: () => ({ lt: vi.fn().mockResolvedValue({}) }) }),
        };
      }
      if (table === "team_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: "connection refused" },
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await GET(makeRequest({ date: "2025-04-15" }));
    expect(res.status).toBe(500);
  });

  it("accepts custom job_duration_mins", async () => {
    setupDefaultMocks();

    const res = await GET(makeRequest({ date: "2025-04-15", job_duration_mins: "60" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // With 60-min job, last slot should be later than with 90-min
    expect(data.slots).toContain("17:00");
  });

  it("uses travel-aware filter when address and GOOGLE_MAPS_API_KEY are set", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    setupDefaultMocks();

    // Add bookings with team_id and address for travel filter
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          update: () => ({ eq: () => ({ lt: vi.fn().mockResolvedValue({}) }) }),
          select: () => ({
            gte: () => ({
              lte: () => ({
                in: () => ({
                  returns: vi.fn().mockResolvedValue({
                    data: [
                      {
                        slot_start: "2025-04-15T06:00:00+04:00",
                        slot_end: "2025-04-15T07:30:00+04:00",
                        team_id: "team-a",
                        address: "123 Old St",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "team_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [
                    { team_id: "team-a", start_time: "08:00", end_time: "18:00" },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "booking_locks") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                gt: () => ({
                  returns: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await GET(makeRequest({
      date: "2025-04-15",
      address: "456 New St",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slots).toBeDefined();
    expect(Array.isArray(data.slots)).toBe(true);

    // Clean up
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("filters slots when bookings overlap with single team", async () => {
    // Setup: 1 team, 1 booking at 10:00-11:30 UAE (06:00-07:30 UTC)
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          update: () => ({ eq: () => ({ lt: vi.fn().mockResolvedValue({}) }) }),
          select: () => ({
            gte: () => ({
              lte: () => ({
                in: () => ({
                  returns: vi.fn().mockResolvedValue({
                    data: [
                      {
                        slot_start: "2025-04-15T06:00:00Z",
                        slot_end: "2025-04-15T07:30:00Z",
                        team_id: "team-a",
                        address: null,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "team_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [{ team_id: "team-a", start_time: "08:00", end_time: "18:00" }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "booking_locks") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                gt: () => ({
                  returns: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await GET(makeRequest({ date: "2025-04-15" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // 10:00 (=600 mins UAE) slot should be removed since team-a is booked
    expect(data.slots).not.toContain("10:00");
  });
});
