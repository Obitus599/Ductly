import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

const mockSendSms = vi.fn();
const mockTwilioConfigured = vi.fn();
vi.mock("@/lib/twilio-sms", () => ({
  sendSms: (...a: unknown[]) => mockSendSms(...a),
  twilioConfigured: () => mockTwilioConfigured(),
}));

const mockFireN8n = vi.fn();
vi.mock("@/lib/n8n", () => ({
  fireN8nWebhook: (...a: unknown[]) => mockFireN8n(...a),
}));

const mockCreateAndStoreCode = vi.fn();
const mockVerifyCode = vi.fn();
vi.mock("@/lib/verification", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verification")>();
  return {
    ...actual,
    createAndStoreCode: (...a: unknown[]) => mockCreateAndStoreCode(...a),
    verifyCode: (...a: unknown[]) => mockVerifyCode(...a),
  };
});

import { POST as sendPOST } from "@/app/api/verify/send/route";
import { POST as checkPOST } from "@/app/api/verify/check/route";

function req(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const SEND_URL = "http://localhost:3000/api/verify/send";
const CHECK_URL = "http://localhost:3000/api/verify/check";

describe("POST /api/verify/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockCreateAndStoreCode.mockResolvedValue("123456");
    mockTwilioConfigured.mockReturnValue(true);
    mockSendSms.mockResolvedValue({ ok: true, sid: "SM1" });
    process.env.VERIFY_CODE_SECRET = "test-pepper";
    process.env.N8N_WEBHOOK_VERIFY_EMAIL = "https://n8n.example.com/webhook/verify-email";
  });
  afterEach(() => {
    delete process.env.VERIFY_CODE_SECRET;
    delete process.env.N8N_WEBHOOK_VERIFY_EMAIL;
  });

  it("rejects an invalid channel", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "carrier-pigeon", identifier: "x" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "email", identifier: "nope" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid phone", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "12" }));
    expect(res.status).toBe(400);
  });

  it("429s when the IP rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+971501234567" }));
    expect(res.status).toBe(429);
  });

  it("503s when VERIFY_CODE_SECRET is unset", async () => {
    delete process.env.VERIFY_CODE_SECRET;
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+971501234567" }));
    expect(res.status).toBe(503);
  });

  it("sends an SMS code via Twilio", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+971 50 123 4567" }));
    expect(res.status).toBe(200);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    const [to, smsBody] = mockSendSms.mock.calls[0];
    expect(to).toBe("+971501234567");
    expect(smsBody).toContain("123456");
  });

  it("502s when Twilio rejects the SMS", async () => {
    mockSendSms.mockResolvedValueOnce({ ok: false, errorMessage: "bad" });
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+971501234567" }));
    expect(res.status).toBe(502);
  });

  it("fires the n8n flow for an email code", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "email", identifier: "Alex@Test.com" }));
    expect(res.status).toBe(200);
    expect(mockFireN8n).toHaveBeenCalledTimes(1);
    const [, url, payload] = mockFireN8n.mock.calls[0];
    expect(url).toContain("verify-email");
    expect(payload).toMatchObject({ email: "alex@test.com", code: "123456" });
  });

  it("503s for email when N8N_WEBHOOK_VERIFY_EMAIL is unset", async () => {
    delete process.env.N8N_WEBHOOK_VERIFY_EMAIL;
    const res = await sendPOST(req(SEND_URL, { channel: "email", identifier: "alex@test.com" }));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/verify/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns verified:true on a correct code", async () => {
    mockVerifyCode.mockResolvedValue({ ok: true });
    const res = await checkPOST(req(CHECK_URL, { channel: "sms", identifier: "+971501234567", code: "123456" }));
    expect(res.status).toBe(200);
    expect((await res.json()).verified).toBe(true);
  });

  it("returns verified:false with reason on a wrong code", async () => {
    mockVerifyCode.mockResolvedValue({ ok: false, reason: "mismatch" });
    const res = await checkPOST(req(CHECK_URL, { channel: "sms", identifier: "+971501234567", code: "000000" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verified).toBe(false);
    expect(data.reason).toBe("mismatch");
  });

  it("short-circuits a malformed code without hitting verifyCode", async () => {
    const res = await checkPOST(req(CHECK_URL, { channel: "sms", identifier: "+971501234567", code: "abc" }));
    expect(res.status).toBe(200);
    expect((await res.json()).verified).toBe(false);
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it("429s when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
    const res = await checkPOST(req(CHECK_URL, { channel: "sms", identifier: "+971501234567", code: "123456" }));
    expect(res.status).toBe(429);
  });
});
