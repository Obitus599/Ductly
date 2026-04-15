import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before imports
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockCacheSelect = vi.fn();
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "travel_cache") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gt: () => ({
                    returns: () => ({
                      single: () => mockCacheSelect(),
                    }),
                  }),
                }),
              }),
            }),
          }),
          upsert: (...args: unknown[]) => mockUpsert(...args),
        };
      }
      return {};
    },
  },
}));

// Mock ngeohash
vi.mock("ngeohash", () => ({
  default: { encode: vi.fn().mockReturnValue("abc123") },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getTimeBucket, getTravelTime } from "./travel-math";

describe("getTimeBucket", () => {
  // All tests use UTC timestamps — getTimeBucket must convert to Dubai (UTC+4)

  it("returns morning bucket for 08:00 Dubai (04:00 UTC)", () => {
    // Tuesday 2025-04-15 04:00 UTC = Tuesday 08:00 Dubai
    expect(getTimeBucket(new Date("2025-04-15T04:00:00Z"))).toBe("TUE_0600");
  });

  it("returns morning bucket for 11:59 Dubai (07:59 UTC)", () => {
    expect(getTimeBucket(new Date("2025-04-15T07:59:00Z"))).toBe("TUE_0600");
  });

  it("returns afternoon bucket for 12:00 Dubai (08:00 UTC)", () => {
    expect(getTimeBucket(new Date("2025-04-15T08:00:00Z"))).toBe("TUE_1200");
  });

  it("returns afternoon bucket for 16:59 Dubai (12:59 UTC)", () => {
    expect(getTimeBucket(new Date("2025-04-15T12:59:00Z"))).toBe("TUE_1200");
  });

  it("returns evening bucket for 17:00 Dubai (13:00 UTC)", () => {
    expect(getTimeBucket(new Date("2025-04-15T13:00:00Z"))).toBe("TUE_1700");
  });

  it("returns evening bucket for 23:59 Dubai (19:59 UTC)", () => {
    expect(getTimeBucket(new Date("2025-04-15T19:59:00Z"))).toBe("TUE_1700");
  });

  // Midnight boundary: UTC 20:00 = Dubai 00:00 (next day)
  it("handles midnight boundary — UTC 20:00 = Dubai 00:00 next day (Wednesday)", () => {
    // Tuesday 20:00 UTC = Wednesday 00:00 Dubai
    expect(getTimeBucket(new Date("2025-04-15T20:00:00Z"))).toBe("WED_0600");
  });

  it("handles late night UTC — 22:00 UTC = 02:00 Dubai next day", () => {
    // Tuesday 22:00 UTC = Wednesday 02:00 Dubai
    expect(getTimeBucket(new Date("2025-04-15T22:00:00Z"))).toBe("WED_0600");
  });

  // Day-of-week correctness
  it("returns correct day for Sunday", () => {
    // Sunday 2025-04-13 06:00 UTC = Sunday 10:00 Dubai
    expect(getTimeBucket(new Date("2025-04-13T06:00:00Z"))).toBe("SUN_0600");
  });

  it("returns correct day for Friday", () => {
    // Friday 2025-04-18 09:00 UTC = Friday 13:00 Dubai
    expect(getTimeBucket(new Date("2025-04-18T09:00:00Z"))).toBe("FRI_1200");
  });

  it("returns correct day for Saturday evening", () => {
    // Saturday 2025-04-19 14:00 UTC = Saturday 18:00 Dubai
    expect(getTimeBucket(new Date("2025-04-19T14:00:00Z"))).toBe("SAT_1700");
  });

  // Timestamps with +04:00 offset
  it("handles +04:00 offset timestamps correctly", () => {
    // 15:30 Dubai time on Tuesday
    expect(getTimeBucket(new Date("2025-04-15T15:30:00+04:00"))).toBe("TUE_1200");
  });

  it("handles +04:00 morning correctly", () => {
    expect(getTimeBucket(new Date("2025-04-15T06:00:00+04:00"))).toBe("TUE_0600");
  });
});

// ─── getTravelTime ─────────────────────────────────────────────────────────

describe("getTravelTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    mockCacheSelect.mockRejectedValue(new Error("cache miss")); // default: no cache
  });

  it("returns default 30 mins when GOOGLE_MAPS_API_KEY is not set", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await getTravelTime("Origin", "Dest", new Date());
    expect(result).toBe(30);
  });

  it("returns default 30 mins when geocoding fails", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ status: "ZERO_RESULTS", results: [] }),
    });
    const result = await getTravelTime("Bad address", "Dest", new Date());
    expect(result).toBe(30);
  });

  it("returns cached travel time on cache hit", async () => {
    // Override the default rejected mock for this test
    mockCacheSelect.mockReset();
    mockCacheSelect.mockResolvedValue({ data: { duration_mins: 25 }, error: null });
    // Geocode must still succeed (called before cache check)
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: "OK",
        results: [{ geometry: { location: { lat: 25, lng: 55 } } }],
      }),
    });

    const result = await getTravelTime("A", "B", new Date());
    expect(result).toBe(25);
  });

  it("calls Distance Matrix and caches result on cache miss", async () => {
    // Geocode succeeds for both
    let fetchCall = 0;
    mockFetch.mockImplementation(() => {
      fetchCall++;
      if (fetchCall <= 2) {
        // Geocode
        return Promise.resolve({
          json: () => Promise.resolve({
            status: "OK",
            results: [{ geometry: { location: { lat: 25.2, lng: 55.3 } } }],
          }),
        });
      }
      // Distance Matrix
      return Promise.resolve({
        json: () => Promise.resolve({
          status: "OK",
          rows: [{
            elements: [{
              status: "OK",
              duration: { value: 1200 },
              duration_in_traffic: { value: 1500 },
            }],
          }],
        }),
      });
    });

    const result = await getTravelTime("Origin", "Dest", new Date("2025-04-15T10:00:00+04:00"));
    expect(result).toBe(25); // ceil(1500/60) = 25
    // Should have written to cache
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("returns default when Distance Matrix fails", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        status: "OK",
        results: [{ geometry: { location: { lat: 25, lng: 55 } } }],
        rows: [{ elements: [{ status: "NOT_FOUND" }] }],
      }),
    });

    const result = await getTravelTime("A", "B", new Date());
    // After geocoding succeeds but distance matrix fails
    expect(result).toBe(30);
  });

  it("returns default when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const result = await getTravelTime("A", "B", new Date());
    expect(result).toBe(30);
  });
});
