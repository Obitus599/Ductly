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

import { POST } from "@/app/api/me/delete/route";

function makeRequest(body: unknown, raw = false): NextRequest {
  return new NextRequest("http://localhost:3000/api/me/delete", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_TOKEN = "bk_abcdef1234567890abcdef";

function tokenLookup(customerId: string | null) {
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

function customerLookup(row: Record<string, unknown> | null) {
  return {
    select: () => ({
      eq: () => ({
        returns: () => ({
          single: vi.fn().mockResolvedValue({ data: row }),
        }),
      }),
    }),
  };
}

function futureBookingsLookup(rows: Record<string, unknown>[]) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          gt: () => ({
            returns: () => Promise.resolve({ data: rows }),
          }),
        }),
      }),
    }),
  };
}

describe("POST /api/me/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(makeRequest("not-json", true));
    expect(res.status).toBe(400);
  });

  it("returns 400 when token is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed token", async () => {
    const res = await POST(makeRequest({ token: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when token is not recognised", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") return tokenLookup(null);
      return {};
    });
    const res = await POST(makeRequest({ token: VALID_TOKEN }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when customer not found", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") return tokenLookup("cust-1");
      if (table === "customers") return customerLookup(null);
      return {};
    });
    const res = await POST(makeRequest({ token: VALID_TOKEN }));
    expect(res.status).toBe(404);
  });

  it("returns 200 idempotently when already deleted", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") return tokenLookup("cust-1");
      if (table === "customers") return customerLookup({
        id: "cust-1",
        email: "deleted+cust-1@deleted.local",
        deleted_at: "2026-05-17T00:00:00Z",
      });
      return {};
    });
    const res = await POST(makeRequest({ token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_deleted).toBe(true);
  });

  it("returns 409 when confirmed future bookings remain", async () => {
    let bookingsCall = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        // First call: token lookup; second: future-bookings check
        return bookingsCall++ === 0
          ? tokenLookup("cust-1")
          : futureBookingsLookup([{ id: "b1", manage_token: "tok", slot_start: "2030-01-01" }]);
      }
      if (table === "customers") return customerLookup({
        id: "cust-1",
        email: "alex@test.com",
        deleted_at: null,
      });
      return {};
    });
    const res = await POST(makeRequest({ token: VALID_TOKEN }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.upcoming_count).toBe(1);
  });

  it("anonymises customer + scrubs bookings + deactivates newsletter on success", async () => {
    let bookingsCall = 0;
    const customerUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const bookingsUpdateEq = vi.fn().mockResolvedValue({});
    const newsletterUpdateEq = vi.fn().mockResolvedValue({});

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "bookings") {
        if (bookingsCall === 0) {
          bookingsCall++;
          return tokenLookup("cust-1");
        }
        if (bookingsCall === 1) {
          bookingsCall++;
          return futureBookingsLookup([]);
        }
        // Third call: update bookings address
        return { update: () => ({ eq: bookingsUpdateEq }) };
      }
      if (table === "customers") {
        if (typeof customerUpdateEq.mock === "object" && customerUpdateEq.mock.calls.length === 0
            && !bookingsCall) {
          /* unreachable: customer read happens after first bookings call */
        }
        // First call: SELECT customer; subsequent call: UPDATE customer.
        // We need to differentiate by which function is called on the
        // returned object. Easiest: return an object that supports BOTH.
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: "cust-1", email: "alex@test.com", deleted_at: null },
                }),
              }),
            }),
          }),
          update: () => ({ eq: customerUpdateEq }),
        };
      }
      if (table === "newsletter_subscribers") {
        return { update: () => ({ eq: newsletterUpdateEq }) };
      }
      return {};
    });

    const res = await POST(makeRequest({ token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notice).toMatch(/anonymised|removed/i);
    expect(customerUpdateEq).toHaveBeenCalledWith("id", "cust-1");
    expect(bookingsUpdateEq).toHaveBeenCalledWith("customer_id", "cust-1");
    expect(newsletterUpdateEq).toHaveBeenCalledWith("email", "alex@test.com");
  });
});
