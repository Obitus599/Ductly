import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = { from: vi.fn() };
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

const mockSendEmail = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  emailConfigured: () => false,
}));

vi.mock("@/lib/email-templates", () => ({
  renderDiscountEmail: (code: string, percent: number) => ({
    subject: `Your ${percent}% Ductly discount code`,
    html: `<div>${code}</div>`,
    text: code,
  }),
}));

import { POST } from "@/app/api/discount/claim/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/discount/claim", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockRule() {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "discount_rules") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 1, discount_percent: 50, active: true, expires_at: null, max_uses: null, used_count: 0 },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "discount_codes") {
      return {
        select: () => ({
          eq: () => ({
            returns: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === "error_log") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }
    return {};
  });
}

describe("POST /api/discount/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRule();
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({ email: "bad", phone: "+971501234567" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid UAE phone", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", phone: "123" }));
    expect(res.status).toBe(400);
  });

  it("mints a code and emails it when Resend is unconfigured (returns code)", async () => {
    let insertFn: ReturnType<typeof vi.fn> | null = null;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_rules") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 1, discount_percent: 50, active: true, expires_at: null, max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "discount_codes") {
        const insert = vi.fn().mockResolvedValue({ error: null });
        insertFn = insert;
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert,
        };
      }
      if (table === "error_log") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });

    const res = await POST(makeRequest({ email: "customer@test.com", phone: "+971501234567" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.code).toMatch(/^DUCTLY-[A-HJ-NP-Z2-9]{5}$/);

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ discount_percent: 50, issued_to_email: "customer@test.com" })
    );

    // email sent with the code
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [mailArgs] = mockSendEmail.mock.calls[0];
    expect(mailArgs.to).toBe("customer@test.com");
    expect(mailArgs.html).toContain(data.code);
    expect(mailArgs.subject).toContain("50%");
  });

  it("re-sends the same code on a duplicate email (no new mint)", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_rules") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 1, discount_percent: 50, active: true, expires_at: null, max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "discount_codes") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    code: "DUCTLY-EXIST1",
                    discount_percent: 50,
                    active: true,
                    expires_at: null,
                    max_uses: null,
                    used_count: 0,
                    issued_to_email: "customer@test.com",
                    issued_to_phone: "+971501234567",
                    created_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "error_log") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });

    const res = await POST(makeRequest({ email: "customer@test.com", phone: "+971501234567" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toBe("DUCTLY-EXIST1");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].html).toContain("DUCTLY-EXIST1");
  });

  it("returns 410 when the campaign rule is inactive", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_rules") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 1, discount_percent: 50, active: false, expires_at: null, max_uses: null, used_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const res = await POST(makeRequest({ email: "customer@test.com", phone: "+971501234567" }));
    expect(res.status).toBe(410);
  });
});
