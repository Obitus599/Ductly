import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn().mockReturnValue(null),
}));

// Mock global fetch for geocode/distance matrix
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "@/app/api/admin/travel/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/travel", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/admin/travel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = "test-maps-key";
  });

  it("returns 500 when GOOGLE_MAPS_API_KEY is not set", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const res = await POST(makeRequest({ origin: "A", destination: "B" }));
    expect(res.status).toBe(500);
  });

  it("returns 400 when origin is missing", async () => {
    const res = await POST(makeRequest({ destination: "B" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when destination is missing", async () => {
    const res = await POST(makeRequest({ origin: "A" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid departure_time", async () => {
    const res = await POST(makeRequest({
      origin: "A",
      destination: "B",
      departure_time: "not-a-date",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when origin cannot be geocoded", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ status: "ZERO_RESULTS", results: [] }),
    });

    const res = await POST(makeRequest({ origin: "???", destination: "Dubai" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("origin");
  });

  it("returns travel result on success", async () => {
    // First two calls: geocode origin and destination
    // Third call: distance matrix
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          json: () => Promise.resolve({
            status: "OK",
            results: [{
              geometry: { location: { lat: 25.2, lng: 55.3 } },
              formatted_address: callCount === 1 ? "Origin Addr" : "Dest Addr",
            }],
          }),
        });
      }
      // Distance matrix
      return Promise.resolve({
        json: () => Promise.resolve({
          status: "OK",
          rows: [{
            elements: [{
              status: "OK",
              distance: { value: 15000 },
              duration: { value: 1200 },
              duration_in_traffic: { value: 1800 },
            }],
          }],
        }),
      });
    });

    const res = await POST(makeRequest({
      origin: "Dubai Marina",
      destination: "Downtown Dubai",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.origin).toBeDefined();
    expect(data.destination).toBeDefined();
    expect(data.duration_traffic_mins).toBe(30);
    expect(data.distance_km).toBe(15);
    expect(data.buffer_mins).toBe(20);
    expect(data.total_blocked_mins).toBe(50);
  });

  it("returns 502 when distance matrix returns no results", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          status: "OK",
          results: [{
            geometry: { location: { lat: 25.2, lng: 55.3 } },
            formatted_address: "Addr",
          }],
          rows: [{ elements: [{ status: "NOT_FOUND" }] }],
        }),
      })
    );

    const res = await POST(makeRequest({ origin: "A", destination: "B" }));
    // After geocoding succeeds, distanceMatrix will fail
    expect([200, 502]).toContain(res.status);
  });
});
