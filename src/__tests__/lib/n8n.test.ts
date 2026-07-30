import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireN8nWebhook } from "@/lib/n8n";

const mockFetch = vi.fn();
const mockSupabase = { from: vi.fn() };
const mockConsoleError = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  supabaseAdmin: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === "from") return mockSupabase.from;
      return undefined;
    },
  }),
}));

describe("fireN8nWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    vi.spyOn(console, "error").mockImplementation(mockConsoleError);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function flushPromises() {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }

  it("calls fetch with correct method, headers, and payload", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    fireN8nWebhook("booking_confirmed", "https://n8n.example.com/webhook", {
      booking_id: "book-1",
    });

    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://n8n.example.com/webhook");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ body: { booking_id: "book-1" } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not log error when n8n responds with ok", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    fireN8nWebhook("test_flow", "https://n8n.example.com/webhook", {});

    await flushPromises();

    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it("logs error to console and error_log on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });

    fireN8nWebhook("failed_flow", "https://n8n.example.com/webhook", {
      id: "error-test",
    });

    await flushPromises();

    expect(mockConsoleError).toHaveBeenCalledWith(
      "n8n failed_flow webhook failed:",
      expect.stringContaining("500")
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("error_log");
  });

  it("logs error to console and error_log on fetch rejection", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });

    fireN8nWebhook("network_flow", "https://n8n.example.com/webhook", {});

    await flushPromises();

    expect(mockConsoleError).toHaveBeenCalledWith(
      "n8n network_flow webhook failed:",
      "Connection refused"
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("error_log");
  });

  it("does not throw when error_log insert also fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockRejectedValue(new Error("DB down")),
    });

    // Should not throw
    fireN8nWebhook("double_fail", "https://n8n.example.com/webhook", {});

    await flushPromises();

    // console.error should have been called twice: once for the fetch failure,
    // once for the error_log insert failure
    expect(mockConsoleError).toHaveBeenCalledTimes(2);
    expect(mockConsoleError).toHaveBeenCalledWith(
      "n8n double_fail webhook failed:",
      "Network error"
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      "error_log insert also failed:",
      expect.any(Error)
    );
  });

  it("returns immediately (fire-and-forget) without waiting", () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = fireN8nWebhook("quick", "https://n8n.example.com/webhook", {});
    expect(result).toBeUndefined();
  });
});

// ── Redaction + transport safety ────────────────────────────────────────────

import { redactPayload, isAllowedWebhookUrl } from "@/lib/n8n";

describe("redactPayload", () => {
  it("strips OTP codes — error_log must never become a plaintext code store", () => {
    const out = redactPayload({ event: "verify_email", email: "a@b.com", code: "123456" }) as Record<string, unknown>;
    expect(out.code).toBe("[redacted]");
    expect(out.email).toBe("[redacted]");
    // Non-sensitive keys survive so a failure is still debuggable.
    expect(out.event).toBe("verify_email");
  });

  it("strips customer PII from a dispatch payload but keeps the shape", () => {
    const out = redactPayload({
      booking_id: "book-1",
      team_id: "team-1",
      customer_name: "Alex",
      customer_phone: "+971501234567",
      address: "Marina Tower 1",
      maps_link: "https://maps.google.com/?q=25,55",
      slot_start: "2026-08-01T10:00:00+04:00",
    }) as Record<string, unknown>;

    expect(out.booking_id).toBe("book-1");
    expect(out.team_id).toBe("team-1");
    expect(out.slot_start).toBe("2026-08-01T10:00:00+04:00");
    expect(out.customer_name).toBe("[redacted]");
    expect(out.customer_phone).toBe("[redacted]");
    expect(out.address).toBe("[redacted]");
    expect(out.maps_link).toBe("[redacted]");
  });

  it("redacts a sensitively-named container wholesale, children included", () => {
    const out = redactPayload({
      address_details: { building_name: "Tower", floor: "12", lat: 25.1 },
    }) as Record<string, unknown>;
    // `address_details` matches on its own name, so nothing under it can
    // leak — including the lat/lng that pinpoint the customer's home.
    expect(out.address_details).toBe("[redacted]");
  });

  it("recurses into neutrally-named objects and arrays", () => {
    const out = redactPayload({
      meta: { building_name: "Tower", floor: "12", unit_count: 3 },
      buyers: [{ email: "a@b.com", id: "x" }],
    }) as Record<string, Record<string, unknown>>;
    expect(out.meta.building_name).toBe("[redacted]");
    expect(out.meta.floor).toBe("[redacted]");
    expect(out.meta.unit_count).toBe(3);
    expect((out.buyers as unknown as Record<string, unknown>[])[0].email).toBe("[redacted]");
    expect((out.buyers as unknown as Record<string, unknown>[])[0].id).toBe("x");
  });

  it("truncates pathologically deep structures instead of recursing forever", () => {
    let deep: Record<string, unknown> = { id: "leaf" };
    for (let i = 0; i < 12; i++) deep = { nested: deep };
    expect(JSON.stringify(redactPayload(deep))).toContain("[truncated]");
  });
});

describe("isAllowedWebhookUrl", () => {
  it("accepts https", () => {
    expect(isAllowedWebhookUrl("https://n8n.ductly.ae/webhook/x")).toBe(true);
  });

  it("rejects plain http to a remote host (PII would go over the wire in clear text)", () => {
    expect(isAllowedWebhookUrl("http://n8n.ductly.ae/webhook/x")).toBe(false);
  });

  it("allows http on loopback for local development", () => {
    expect(isAllowedWebhookUrl("http://localhost:5678/webhook/x")).toBe(true);
    expect(isAllowedWebhookUrl("http://127.0.0.1:5678/webhook/x")).toBe(true);
  });

  it("rejects non-http schemes and malformed URLs", () => {
    expect(isAllowedWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedWebhookUrl("not a url")).toBe(false);
    expect(isAllowedWebhookUrl("")).toBe(false);
  });
});
