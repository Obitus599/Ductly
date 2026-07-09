import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

const mockSendWhatsAppOtp = vi.fn();
const mockWhatsappConfigured = vi.fn();
vi.mock("@/lib/twilio-whatsapp", () => ({
  sendWhatsAppOtp: (...a: unknown[]) => mockSendWhatsAppOtp(...a),
  whatsappConfigured: () => mockWhatsappConfigured(),
}));

const mockFireN8n = vi.fn();
vi.mock("@/lib/n8n", () => ({
  fireN8nWebhook: (...a: unknown[]) => mockFireN8n(...a),
}));

const mockSendEmail = vi.fn();
const mockEmailConfigured = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
  emailConfigured: () => mockEmailConfigured(),
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
    mockWhatsappConfigured.mockReturnValue(true);
    mockSendWhatsAppOtp.mockResolvedValue({ ok: true, sid: "SM1" });
    // Default email path: SMTP not configured, so the legacy n8n relay is
    // exercised. The SMTP-specific tests flip emailConfigured on.
    mockEmailConfigured.mockReturnValue(false);
    mockSendEmail.mockResolvedValue({ ok: true });
    process.env.VERIFY_CODE_SECRET = "test-pepper";
    process.env.N8N_WEBHOOK_VERIFY_EMAIL = "https://n8n.example.com/webhook/verify-email";
    process.env.TWILIO_CONTENT_SID_DUCTLY_VERIFY = "HXverify";
  });
  afterEach(() => {
    delete process.env.VERIFY_CODE_SECRET;
    delete process.env.N8N_WEBHOOK_VERIFY_EMAIL;
    delete process.env.TWILIO_CONTENT_SID_DUCTLY_VERIFY;
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

  it("sends the phone code via WhatsApp", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+971 50 123 4567" }));
    expect(res.status).toBe(200);
    expect(mockSendWhatsAppOtp).toHaveBeenCalledTimes(1);
    const [to, code] = mockSendWhatsAppOtp.mock.calls[0];
    expect(to).toBe("+971501234567");
    expect(code).toBe("123456");
  });

  it("normalizes a local 05x number to E.164 before sending (bug fix)", async () => {
    // The reported failure: "0503089244" reached Twilio unprefixed and was
    // rejected. It must now be canonicalized to +971503089244.
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "0503089244" }));
    expect(res.status).toBe(200);
    expect(mockSendWhatsAppOtp).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsAppOtp.mock.calls[0][0]).toBe("+971503089244");
  });

  it("400s a non-UAE number with a helpful message", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+14155552671" }));
    expect(res.status).toBe(400);
    expect(mockSendWhatsAppOtp).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toMatch(/UAE mobile/i);
  });

  it("503s when the WhatsApp verify template SID is unset", async () => {
    delete process.env.TWILIO_CONTENT_SID_DUCTLY_VERIFY;
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+971501234567" }));
    expect(res.status).toBe(503);
  });

  it("502s when WhatsApp rejects the send", async () => {
    mockSendWhatsAppOtp.mockResolvedValueOnce({ ok: false, errorMessage: "bad" });
    const res = await sendPOST(req(SEND_URL, { channel: "sms", identifier: "+971501234567" }));
    expect(res.status).toBe(502);
  });

  it("sends the email code via SMTP when configured (no n8n)", async () => {
    mockEmailConfigured.mockReturnValue(true);
    const res = await sendPOST(req(SEND_URL, { channel: "email", identifier: "Alex@Test.com" }));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockFireN8n).not.toHaveBeenCalled();
    const [opts] = mockSendEmail.mock.calls[0];
    expect(opts.to).toBe("alex@test.com");
    expect(opts.subject).toContain("123456");
    expect(opts.html).toContain("123456");
    expect(opts.text).toContain("123456");
  });

  it("502s when the SMTP send fails", async () => {
    mockEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValueOnce({ ok: false, error: "smtp down" });
    const res = await sendPOST(req(SEND_URL, { channel: "email", identifier: "alex@test.com" }));
    expect(res.status).toBe(502);
  });

  it("falls back to the n8n flow for an email code when SMTP is unset", async () => {
    const res = await sendPOST(req(SEND_URL, { channel: "email", identifier: "Alex@Test.com" }));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockFireN8n).toHaveBeenCalledTimes(1);
    const [, url, payload] = mockFireN8n.mock.calls[0];
    expect(url).toContain("verify-email");
    expect(payload).toMatchObject({ email: "alex@test.com", code: "123456" });
  });

  it("503s for email when neither SMTP nor N8N_WEBHOOK_VERIFY_EMAIL is set", async () => {
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
