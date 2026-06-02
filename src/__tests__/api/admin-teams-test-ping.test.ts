import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn().mockReturnValue(null),
  requireSameOrigin: vi.fn().mockReturnValue(null),
}));

const mockFrom = vi.fn();
vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/teams/test-ping", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockTeamLookup(team: { id: string; name: string; whatsapp_number: string } | null) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        returns: () => ({
          single: vi.fn().mockResolvedValue({
            data: team,
            error: team ? null : { message: "not found" },
          }),
        }),
      }),
    }),
  });
}

describe("POST /api/admin/teams/test-ping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_WHATSAPP_FROM;
  });

  it("returns 400 when team_id is missing", async () => {
    const { POST } = await import("@/app/api/admin/teams/test-ping/route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    const { POST } = await import("@/app/api/admin/teams/test-ping/route");
    const badReq = new NextRequest("http://localhost:3000/api/admin/teams/test-ping", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 503 when Twilio is not configured", async () => {
    const { POST } = await import("@/app/api/admin/teams/test-ping/route");
    const res = await POST(makeRequest({ team_id: "t1" }));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/Twilio not configured/);
  });

  it("returns 404 when team does not exist", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxx";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_WHATSAPP_FROM = "+15551234567";
    mockTeamLookup(null);

    const { POST } = await import("@/app/api/admin/teams/test-ping/route");
    const res = await POST(makeRequest({ team_id: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when team has no phone number", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxx";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_WHATSAPP_FROM = "+15551234567";
    mockTeamLookup({ id: "t1", name: "Alpha", whatsapp_number: "" });

    const { POST } = await import("@/app/api/admin/teams/test-ping/route");
    const res = await POST(makeRequest({ team_id: "t1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no phone number/i);
  });

  it("forwards Twilio failures with detail", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxx";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_WHATSAPP_FROM = "+15551234567";
    mockTeamLookup({ id: "t1", name: "Alpha", whatsapp_number: "+971501234567" });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "auth failed", code: 20003 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { POST } = await import("@/app/api/admin/teams/test-ping/route");
    const res = await POST(makeRequest({ team_id: "t1" }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.twilio_status).toBe(401);
    expect(data.twilio_message).toBe("auth failed");
  });

  it("returns success when Twilio accepts the send", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxx";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_WHATSAPP_FROM = "+15551234567";
    mockTeamLookup({ id: "t1", name: "Alpha", whatsapp_number: "+971501234567" });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: "SMxxx", status: "queued" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { POST } = await import("@/app/api/admin/teams/test-ping/route");
    const res = await POST(makeRequest({ team_id: "t1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sid).toBe("SMxxx");
    expect(data.to).toBe("+971501234567");
  });
});
