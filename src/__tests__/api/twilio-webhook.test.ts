import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockValidate = vi.fn();
vi.mock("@/lib/twilio-verify", () => ({
  validateTwilioSignature: (...a: unknown[]) => mockValidate(...a),
}));

const mockProcess = vi.fn();
vi.mock("@/lib/job-completion", () => ({
  processJobStatusReply: (...a: unknown[]) => mockProcess(...a),
}));

import { POST } from "@/app/api/webhooks/twilio/route";

function formReq(fields: Record<string, string>, signature?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (signature !== undefined) headers["x-twilio-signature"] = signature;
  return new NextRequest("http://localhost:3000/api/webhooks/twilio", {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
    headers,
  });
}

describe("POST /api/webhooks/twilio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.ductly.ae";
    mockProcess.mockResolvedValue({ matched: true, outcome: "completed", bookingId: "b1", invoiceNumber: "INV-000001" });
  });
  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("rejects an invalid signature with 403 and never processes", async () => {
    mockValidate.mockReturnValue(false);
    const res = await POST(formReq({ From: "whatsapp:+971501112222", ButtonPayload: "job_completed" }, "bad"));
    expect(res.status).toBe(403);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("rejects when the auth token is unset", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    mockValidate.mockReturnValue(true);
    const res = await POST(formReq({ From: "whatsapp:+971501112222" }, "sig"));
    expect(res.status).toBe(403);
  });

  it("processes a valid request and returns empty TwiML (200)", async () => {
    mockValidate.mockReturnValue(true);
    const res = await POST(formReq({ From: "whatsapp:+971501112222", ButtonPayload: "job_completed" }, "goodsig"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    expect(mockProcess).toHaveBeenCalledWith({
      from: "whatsapp:+971501112222",
      buttonPayload: "job_completed",
      buttonText: undefined,
    });
    const body = await res.text();
    expect(body).toContain("<Response>");
  });

  it("still acks (200) if processing throws", async () => {
    mockValidate.mockReturnValue(true);
    mockProcess.mockRejectedValue(new Error("boom"));
    const res = await POST(formReq({ From: "whatsapp:+971501112222", ButtonText: "Completed" }, "goodsig"));
    expect(res.status).toBe(200);
  });
});
