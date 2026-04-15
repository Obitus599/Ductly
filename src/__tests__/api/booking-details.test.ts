import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRetrieve = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockRetrieve(...args),
      },
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { GET } from "@/app/api/booking-details/route";

function makeRequest(sessionId?: string): NextRequest {
  const url = sessionId
    ? `http://localhost:3000/api/booking-details?session_id=${sessionId}`
    : "http://localhost:3000/api/booking-details";
  return new NextRequest(url);
}

describe("GET /api/booking-details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when session_id is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 when session_id doesn't start with cs_", async () => {
    const res = await GET(makeRequest("invalid_id"));
    expect(res.status).toBe(400);
  });

  it("returns 402 when payment is not completed", async () => {
    mockRetrieve.mockResolvedValue({
      payment_status: "unpaid",
      metadata: {},
    });
    const res = await GET(makeRequest("cs_test_abc123"));
    expect(res.status).toBe(402);
  });

  it("returns booking details for paid session", async () => {
    mockRetrieve.mockResolvedValue({
      payment_status: "paid",
      metadata: {
        plan: "signature",
        address: "123 Test St",
        slot_start: "2025-04-15T10:00:00+04:00",
        property_type: "villa",
        bedrooms: "3",
        thermostats: "4",
        price_aed: "3000",
      },
    });

    const res = await GET(makeRequest("cs_test_abc123"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plan).toBe("signature");
    expect(data.address).toBe("123 Test St");
    expect(data.thermostats).toBe("4");
    expect(data.price_aed).toBe("3000");
  });

  it("returns defaults when metadata fields are missing", async () => {
    mockRetrieve.mockResolvedValue({
      payment_status: "paid",
      metadata: {},
    });

    const res = await GET(makeRequest("cs_test_abc123"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plan).toBe("signature");
    expect(data.bedrooms).toBe("0");
  });

  it("returns 500 when Stripe API throws", async () => {
    mockRetrieve.mockRejectedValue(new Error("Stripe down"));
    const res = await GET(makeRequest("cs_test_abc123"));
    expect(res.status).toBe(500);
  });
});
