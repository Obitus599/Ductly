import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockStripeCreate = vi.fn().mockResolvedValue({
  url: "https://checkout.stripe.com/test",
});

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockStripeCreate(...args),
      },
    },
  },
}));

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "from") return mockSupabase.from;
      return undefined;
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { POST } from "@/app/api/checkout/route";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";

const VALID_BODY = {
  customer_name: "Alex Test",
  customer_email: "alex@test.com",
  customer_phone: "+971501234567",
  address: "123 Test St, Dubai",
  property_type: "villa",
  bedrooms: 3,
  thermostats: 4,
  ducts: 12,
  plan: "signature",
  slot_start: "2025-04-15T10:00:00+04:00",
  slot_end: "2025-04-15T11:30:00+04:00",
  session_id: "sess-abc-123",
  consent_version: CURRENT_CONSENT_VERSION,
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default Supabase mock chain: lock found → customer upserted → booking inserted
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "booking_locks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gt: () => ({
                  returns: () => ({
                    single: vi.fn().mockResolvedValue({ data: { id: "lock-1" }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "customers") {
        return {
          upsert: () => ({
            select: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({ data: { id: "cust-1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        return {
          insert: () => ({
            select: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({ data: { id: "book-1" }, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: vi.fn().mockResolvedValue({}),
          }),
        };
      }
      return {};
    });
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ customer_name: "Alex" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, customer_email: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid phone", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, customer_phone: "12" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid property type", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, property_type: "castle" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid plan", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, plan: "platinum" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid slot_start timestamp", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, slot_start: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for name that is too long", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, customer_name: "A".repeat(201) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when consent_version is missing (PDPL)", async () => {
    const { consent_version: _omit, ...withoutConsent } = VALID_BODY;
    void _omit;
    const res = await POST(makeRequest(withoutConsent));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/privacy policy/i);
  });

  it("returns 400 when consent_version is stale (PDPL)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, consent_version: "2020-01-01" }));
    expect(res.status).toBe(400);
  });

  it("returns checkout URL on success", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.checkout_url).toBe("https://checkout.stripe.com/test");
    expect(data.booking_id).toBe("book-1");
    expect(data.price_aed).toBe(2196); // 4 thermostats × 549 AED
  });

  it("passes correct args to Stripe (price, metadata, idempotency)", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockStripeCreate).toHaveBeenCalledTimes(1);
    const [createArgs, createOpts] = mockStripeCreate.mock.calls[0];

    // Price: signature plan (549) × 4 thermostats = 2196 AED = 219600 fils
    expect(createArgs.line_items[0].price_data.unit_amount).toBe(219600);
    expect(createArgs.line_items[0].price_data.currency).toBe("aed");

    // Metadata
    expect(createArgs.metadata.booking_id).toBe("book-1");
    expect(createArgs.metadata.plan).toBe("signature");
    expect(createArgs.metadata.thermostats).toBe("4");
    expect(createArgs.metadata.price_aed).toBe("2196");
    expect(createArgs.metadata.address).toBe("123 Test St, Dubai");

    // Idempotency key
    expect(createOpts.idempotencyKey).toBe("checkout_book-1");

    // client_reference_id
    expect(createArgs.client_reference_id).toBe("book-1");
  });

  it("calculates correct price for essential plan", async () => {
    await POST(makeRequest({ ...VALID_BODY, plan: "essential", thermostats: 2 }));
    const [createArgs] = mockStripeCreate.mock.calls[0];
    // essential (349) × 2 = 698 AED = 69800 fils
    expect(createArgs.line_items[0].price_data.unit_amount).toBe(69800);
  });

  it("calculates correct price for elite plan", async () => {
    await POST(makeRequest({ ...VALID_BODY, plan: "elite", thermostats: 1 }));
    const [createArgs] = mockStripeCreate.mock.calls[0];
    // elite (699) × 1 = 699 AED = 69900 fils
    expect(createArgs.line_items[0].price_data.unit_amount).toBe(69900);
  });

  it("returns 500 when customer upsert fails", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "booking_locks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gt: () => ({
                  returns: () => ({
                    single: vi.fn().mockResolvedValue({ data: { id: "lock-1" }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "customers") {
        return {
          upsert: () => ({
            select: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: "duplicate key" },
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it("returns 500 and cleans up when Stripe session creation fails", async () => {
    mockStripeCreate.mockRejectedValueOnce(new Error("Stripe API down"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("payment session");
  });

  it("returns 409 when booking lock has expired", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "booking_locks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gt: () => ({
                  returns: () => ({
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });
});
