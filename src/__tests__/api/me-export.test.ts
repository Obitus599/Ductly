import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = { from: vi.fn() };
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => (prop === "from" ? mockSupabase.from : undefined),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { GET } from "@/app/api/me/export/route";

function makeRequest(token?: string): NextRequest {
  const url = token
    ? `http://localhost:3000/api/me/export?token=${token}`
    : "http://localhost:3000/api/me/export";
  return new NextRequest(url, { method: "GET" });
}

const VALID_TOKEN = "bk_abcdef1234567890abcdef";

function mockTokenLookup(customerId: string | null) {
  return {
    select: () => ({
      eq: () => ({
        returns: () => ({
          single: vi.fn().mockResolvedValue(
            customerId ? { data: { customer_id: customerId } } : { data: null }
          ),
        }),
      }),
    }),
  };
}

function mockCustomerLookup(customer: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        returns: () => ({
          single: vi.fn().mockResolvedValue({ data: customer }),
        }),
      }),
    }),
  };
}

function listMock(rows: Record<string, unknown>[]) {
  return {
    select: () => ({
      eq: () => ({
        returns: () => Promise.resolve({ data: rows }),
      }),
    }),
  };
}

function singleMaybeMock(row: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        returns: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: row }),
        }),
      }),
    }),
  };
}

describe("GET /api/me/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when token is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed token", async () => {
    const res = await GET(makeRequest("not-a-token"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when token is not recognised", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") return mockTokenLookup(null);
      return {};
    });
    const res = await GET(makeRequest(VALID_TOKEN));
    expect(res.status).toBe(404);
  });

  it("returns 404 when customer is soft-deleted", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") return mockTokenLookup("cust-1");
      if (table === "customers") return mockCustomerLookup({
        id: "cust-1",
        email: "deleted+cust-1@deleted.local",
        deleted_at: "2026-05-17T00:00:00Z",
      });
      return {};
    });
    const res = await GET(makeRequest(VALID_TOKEN));
    expect(res.status).toBe(404);
  });

  it("returns 200 with full payload for valid token", async () => {
    let customerCall = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        // Two calls: token lookup, then list-all-bookings
        return customerCall === 0
          ? (customerCall++, mockTokenLookup("cust-1"))
          : listMock([{ id: "book-1", slot_start: "2026-06-01", customer_id: "cust-1" }]);
      }
      if (table === "customers") return mockCustomerLookup({
        id: "cust-1",
        name: "Alex Test",
        email: "alex@test.com",
        phone: "+971501234567",
        consent_given_at: "2026-05-17T00:00:00Z",
        consent_version: "2026-05-17",
        deleted_at: null,
      });
      if (table === "feedback") return listMock([{ id: "fb-1", rating: 5 }]);
      if (table === "contact_submissions") return listMock([{ id: "c-1", message: "hi" }]);
      if (table === "newsletter_subscribers") return singleMaybeMock({ id: "ns-1", active: true });
      if (table === "invoices") {
        return {
          select: () => ({
            in: () => ({
              returns: () => Promise.resolve({ data: [{ id: "inv-1", invoice_number: "INV-000001" }] }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await GET(makeRequest(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");

    const body = JSON.parse(await res.text());
    expect(body.customer.email).toBe("alex@test.com");
    expect(body.bookings).toHaveLength(1);
    expect(body.invoices).toHaveLength(1);
    expect(body.feedback).toHaveLength(1);
    expect(body.contact_submissions).toHaveLength(1);
    expect(body.newsletter_subscription).toEqual({ id: "ns-1", active: true });
    expect(body.notice).toMatch(/PDPL/i);
    expect(body.exported_at).toBeDefined();
  });
});
