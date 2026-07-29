import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockRunMaintenance = vi.fn();
vi.mock("@/lib/maintenance", () => ({
  runMaintenance: (...a: unknown[]) => mockRunMaintenance(...a),
}));

import { GET, POST } from "@/app/api/cron/cleanup/route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/cleanup", {
    method: "POST",
    headers,
  });
}

describe("/api/cron/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "s3cr3t";
    mockRunMaintenance.mockResolvedValue({
      expiredBookings: 2,
      deletedLocks: 5,
      deletedVerificationCodes: 9,
      deletedErrorLogs: 1,
      tabby: null,
      errors: [],
    });
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails CLOSED when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ authorization: "Bearer anything" }));
    expect(res.status).toBe(503);
    expect(mockRunMaintenance).not.toHaveBeenCalled();
  });

  it("401s without a secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mockRunMaintenance).not.toHaveBeenCalled();
  });

  it("401s on a wrong secret", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(mockRunMaintenance).not.toHaveBeenCalled();
  });

  it("runs maintenance with a valid Bearer secret", async () => {
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.expiredBookings).toBe(2);
    expect(mockRunMaintenance).toHaveBeenCalledTimes(1);
  });

  it("accepts the x-cron-secret header", async () => {
    const res = await POST(req({ "x-cron-secret": "s3cr3t" }));
    expect(res.status).toBe(200);
  });

  it("accepts GET (managed schedulers often only issue GETs)", async () => {
    const res = await GET(
      new NextRequest("http://localhost:3000/api/cron/cleanup", {
        headers: { authorization: "Bearer s3cr3t" },
      })
    );
    expect(res.status).toBe(200);
    expect(mockRunMaintenance).toHaveBeenCalledTimes(1);
  });

  it("reports ok:false when a sweep failed, without failing the request", async () => {
    mockRunMaintenance.mockResolvedValue({
      expiredBookings: 0,
      deletedLocks: 0,
      deletedVerificationCodes: 0,
      deletedErrorLogs: 0,
      tabby: null,
      errors: ["cleanup_error_log: permission denied"],
    });
    const res = await POST(req({ authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toHaveLength(1);
  });
});
