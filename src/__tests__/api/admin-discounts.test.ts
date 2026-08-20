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

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn().mockReturnValue(null),
  requireSameOrigin: vi.fn().mockReturnValue(null),
}));

import { GET, PATCH, POST } from "@/app/api/admin/discounts/route";
import {
  PATCH as patchCode,
  POST as postCode,
  DELETE as deleteCode,
} from "@/app/api/admin/discounts/[code]/route";

function makeRequest(path: string, init: { method?: string; body?: string } = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method,
    body: init.body,
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin discounts routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const rule = { id: 1, discount_percent: 50, active: true, expires_at: null, max_uses: null, used_count: 0, updated_at: null };
    const codeRow = {
      code: "DUCTLY-GEN1", discount_percent: 50, active: true, expires_at: null,
      max_uses: null, used_count: 0, issued_to_email: null, issued_to_phone: null, created_at: null,
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "discount_rules") {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: rule, error: null }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                returns: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { ...rule, ...patch, updated_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "discount_codes") {
        const insert = vi.fn().mockResolvedValue({ error: null });
        return {
          select: () => ({
            order: () => ({
              returns: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            eq: () => ({
              returns: () => ({
                single: vi.fn().mockResolvedValue({ data: codeRow, error: null }),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert,
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                returns: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { ...codeRow, ...patch },
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
  });

  it("GET returns the rule and codes list", async () => {
    const res = await GET(makeRequest("/api/admin/discounts"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rule.discount_percent).toBe(50);
    expect(Array.isArray(data.codes)).toBe(true);
  });

  it("PATCH updates the rule", async () => {
    const res = await PATCH(makeRequest("/api/admin/discounts", {
      method: "PATCH",
      body: JSON.stringify({ discount_percent: 25, active: false }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rule.discount_percent).toBe(25);
    expect(data.rule.active).toBe(false);
  });

  it("POST /generate mints a code at the rule's percent", async () => {
    const res = await POST(makeRequest("/api/admin/discounts/generate", { method: "POST" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toBeTruthy();
    expect(data.code.discount_percent).toBe(50);
    const insert = mockSupabase.from.mock.results.find((r) => r.value && r.value.insert)?.value.insert;
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ discount_percent: 50 }));
  });

  it("PATCH /:code toggles a code", async () => {
    const res = await patchCode(makeRequest("/api/admin/discounts/DUCTLY-TEST1", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    }), { params: { code: "DUCTLY-TEST1" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code.active).toBe(false);
  });

  it("POST /:code/reset zeroes usage", async () => {
    const res = await postCode(makeRequest("/api/admin/discounts/DUCTLY-TEST1", {
      method: "POST",
      body: JSON.stringify({ action: "reset" }),
    }), { params: { code: "DUCTLY-TEST1" } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("DELETE /:code deactivates", async () => {
    const res = await deleteCode(makeRequest("/api/admin/discounts/DUCTLY-TEST1", {
      method: "DELETE",
    }), { params: { code: "DUCTLY-TEST1" } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
