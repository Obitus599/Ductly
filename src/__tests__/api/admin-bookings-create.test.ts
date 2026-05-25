import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAssignTeam = vi.fn().mockResolvedValue({ teamId: "team-1", method: "fallback" });

vi.mock("@/lib/scheduling-agent", () => ({
  assignTeamToBooking: (...args: unknown[]) => mockAssignTeam(...args),
}));

const mockSupabase = { from: vi.fn() };

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === "from") return mockSupabase.from;
      return undefined;
    },
  }),
}));

import { POST } from "@/app/api/admin/bookings/create/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/bookings/create", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BODY = {
  customer_name: "John Doe",
  customer_email: "john@example.com",
  customer_phone: "+971501234567",
  address: "Dubai Marina Tower 1",
  slot_start: "2026-06-01T10:00:00+04:00",
  plan: "signature",
  thermostats: 3,
};

function setupSuccessMocks() {
  mockSupabase.from.mockImplementation((table: string) => {
    // Active teams
    if (table === "teams") {
      return {
        select: () => ({
          eq: () => ({
            returns: vi.fn().mockResolvedValue({
              data: [{ id: "team-1" }, { id: "team-2" }],
              error: null,
            }),
          }),
        }),
      };
    }
    // Existing bookings (collision check)
    if (table === "bookings") {
      // First call: select for collision check, second: insert
      let isSelectCall = true;
      return {
        select: () => {
          if (isSelectCall) {
            isSelectCall = false;
            return {
              gte: () => ({
                lte: () => ({
                  in: () => ({
                    returns: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "book-1" },
                error: null,
              }),
            }),
          };
        },
        insert: () => ({
          select: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "book-1" },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    // Schedule blackouts
    if (table === "schedule_blackouts") {
      return {
        select: () => ({
          lt: () => ({
            gt: () => ({
              returns: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
    }
    // Customers
    if (table === "customers") {
      return {
        upsert: () => ({
          select: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "cust-1" },
                error: null,
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            returns: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: "cust-1" },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    // Error log (team assignment failure fallback)
    if (table === "error_log") {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {};
  });
}

describe("POST /api/admin/bookings/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation", () => {
    it("returns 400 when required fields are missing", async () => {
      const res = await POST(makeRequest({ customer_name: "John" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/missing required fields/i);
    });

    it("returns 400 for invalid plan", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, plan: "platinum" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/invalid plan/i);
    });

    it("returns 400 for invalid slot_start format (no T separator)", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, slot_start: "2026-06-01 10:00" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/expected ISO 8601/i);
    });

    it("returns 400 for unparseable slot_start timestamp", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, slot_start: "2026-13-40T99:99:99+04:00" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/invalid slot_start/i);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/bookings/create", {
        method: "POST",
        body: "not-json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON body.");
    });
  });

  describe("slot checks", () => {
    it("returns 409 when no active teams exist", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "teams") {
          return {
            select: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/no active teams/i);
    });

    it("returns 409 when all teams are occupied at the slot", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "teams") {
          return {
            select: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [{ id: "team-1" }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "bookings") {
          return {
            select: () => ({
              gte: () => ({
                lte: () => ({
                  in: () => ({
                    returns: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "existing-1",
                          slot_start: "2026-06-01T09:30:00+04:00",
                          slot_end: "2026-06-01T11:00:00+04:00",
                          team_id: "team-1",
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
        return {};
      });

      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/all teams are occupied/i);
    });

    it("returns 409 when a global blackout covers the slot", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "teams") {
          return {
            select: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [{ id: "team-1" }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "bookings") {
          return {
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
        if (table === "schedule_blackouts") {
          return {
            select: () => ({
              lt: () => ({
                gt: () => ({
                  returns: vi.fn().mockResolvedValue({
                    data: [{ team_id: null, reason: "Public holiday" }],
                    error: null,
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
      const data = await res.json();
      expect(data.error).toMatch(/public holiday/i);
    });
  });

  describe("success path", () => {
    beforeEach(() => {
      setupSuccessMocks();
    });

    it("creates booking with email (upsert path) and returns full response", async () => {
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.booking_id).toBe("book-1");
      expect(data.customer_id).toBe("cust-1");
      expect(data.plan).toBe("signature");
      expect(data.thermostats).toBe(3);
      expect(data.job_duration_mins).toBeGreaterThan(0);
      expect(data.team_id).toBe("team-1");
    });

    it("creates booking without email (phone-in insert path)", async () => {
      const body = { ...VALID_BODY };
      delete (body as Record<string, unknown>).customer_email;

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.booking_id).toBe("book-1");
      expect(data.customer_id).toBe("cust-1");
    });

    it("includes address_details and notes when provided", async () => {
      setupSuccessMocks();

      const res = await POST(makeRequest({
        ...VALID_BODY,
        address_details: { building_name: "Marina Tower", flat_number: "12A" },
        notes: "Customer prefers morning",
      }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.booking_id).toBe("book-1");
    });

    it("calculates correct job_duration_mins for essential plan", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, plan: "essential", thermostats: 2 }));
      expect(res.status).toBe(200);
      const data = await res.json();
      // essential: 45 setup + 45 × 2 = 135 mins
      expect(data.job_duration_mins).toBe(135);
    });

    it("calculates correct job_duration_mins for elite plan", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, plan: "elite", thermostats: 1 }));
      expect(res.status).toBe(200);
      const data = await res.json();
      // elite: 80 setup + 60 × 1 = 140 mins
      expect(data.job_duration_mins).toBe(140);
    });

    it("calls assignTeamToBooking with correct args", async () => {
      await POST(makeRequest(VALID_BODY));
      expect(mockAssignTeam).toHaveBeenCalledWith(
        "book-1",
        VALID_BODY.slot_start,
        VALID_BODY.address
      );
    });

    it("returns team_id=null when assignment fails but still succeeds", async () => {
      mockAssignTeam.mockRejectedValueOnce(new Error("No teams available"));

      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.team_id).toBeNull();
      expect(data.team_method).toBe("none");
    });
  });

  describe("error handling", () => {
    it("returns 500 when customer upsert fails", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "teams") {
          return {
            select: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [{ id: "team-1" }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "bookings") {
          return {
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
        if (table === "schedule_blackouts") {
          return {
            select: () => ({
              lt: () => ({
                gt: () => ({
                  returns: vi.fn().mockResolvedValue({ data: [], error: null }),
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
                    error: { message: "duplicate key violation" },
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
      const data = await res.json();
      expect(data.error).toMatch(/failed to create customer/i);
    });

    it("returns 500 when booking insert fails", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "teams") {
          return {
            select: () => ({
              eq: () => ({
                returns: vi.fn().mockResolvedValue({
                  data: [{ id: "team-1" }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "bookings") {
          // Select chain for collision check
          let isSelectCall = true;
          return {
            select: () => {
              if (isSelectCall) {
                isSelectCall = false;
                return {
                  gte: () => ({
                    lte: () => ({
                      in: () => ({
                        returns: vi.fn().mockResolvedValue({ data: [], error: null }),
                      }),
                    }),
                  }),
                };
              }
              return {};
            },
            insert: () => ({
              select: () => ({
                returns: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: "slot conflict" },
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "schedule_blackouts") {
          return {
            select: () => ({
              lt: () => ({
                gt: () => ({
                  returns: vi.fn().mockResolvedValue({ data: [], error: null }),
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
                    data: { id: "cust-1" },
                    error: null,
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
      const data = await res.json();
      expect(data.error).toMatch(/failed to create booking/i);
    });
  });
});
