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
    expect(JSON.parse(options.body)).toEqual({ booking_id: "book-1" });
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
