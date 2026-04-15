import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDelete = vi.fn().mockReturnValue({
  lt: vi.fn().mockResolvedValue({}),
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({}),
  }),
});
const mockInsertSelect = vi.fn().mockReturnValue({
  select: () => ({
    returns: () => ({
      single: vi.fn().mockResolvedValue({
        data: { id: "lock-1", slot_start: "2025-04-15T10:00:00+04:00", session_id: "sess-1", expires_at: "2025-04-15T10:10:00+04:00" },
        error: null,
      }),
    }),
  }),
});
const mockSelectExisting = vi.fn().mockReturnValue({
  returns: () => ({
    limit: () => ({
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  }),
});

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "booking_locks") {
        return {
          delete: () => mockDelete(),
          insert: (data: unknown) => mockInsertSelect(data),
          select: () => ({
            eq: () => ({
              eq: () => ({
                gt: () => mockSelectExisting(),
              }),
            }),
          }),
        };
      }
      return {};
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { POST, DELETE } from "@/app/api/booking-locks/route";

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/booking-locks", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/booking-locks", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/booking-locks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when slot_start is missing", async () => {
    const res = await POST(makePostRequest({ session_id: "sess-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when session_id is missing", async () => {
    const res = await POST(makePostRequest({ slot_start: "2025-04-15T10:00:00+04:00" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid slot_start timestamp", async () => {
    const res = await POST(makePostRequest({
      slot_start: "not-a-date",
      session_id: "sess-1",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for overly long session_id", async () => {
    const res = await POST(makePostRequest({
      slot_start: "2025-04-15T10:00:00+04:00",
      session_id: "a".repeat(200),
    }));
    expect(res.status).toBe(400);
  });

  it("returns existing lock when duplicate detected", async () => {
    // Override the existing lock check to return a found lock
    mockSelectExisting.mockReturnValueOnce({
      returns: () => ({
        limit: () => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "existing-lock",
              slot_start: "2025-04-15T10:00:00+04:00",
              session_id: "sess-1",
              expires_at: "2025-04-15T10:10:00+04:00",
            },
          }),
        }),
      }),
    });

    const res = await POST(makePostRequest({
      slot_start: "2025-04-15T10:00:00+04:00",
      session_id: "sess-1",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("existing-lock");
  });
});

describe("DELETE /api/booking-locks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when session_id is missing", async () => {
    const res = await DELETE(makeDeleteRequest({ slot_start: "2025-04-15T10:00:00+04:00" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when slot_start is missing", async () => {
    const res = await DELETE(makeDeleteRequest({ session_id: "sess-1" }));
    expect(res.status).toBe(400);
  });

  it("returns success when both fields are provided", async () => {
    const res = await DELETE(makeDeleteRequest({
      session_id: "sess-1",
      slot_start: "2025-04-15T10:00:00+04:00",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
