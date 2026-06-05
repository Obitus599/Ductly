import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail, emailConfigured } from "@/lib/email";

describe("email (Resend)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("emailConfigured reflects the API key", () => {
    expect(emailConfigured()).toBe(true);
    delete process.env.RESEND_API_KEY;
    expect(emailConfigured()).toBe(false);
  });

  it("POSTs to the Resend API with auth + the rendered payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "abc" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendEmail({ to: "a@b.com", subject: "S", html: "<p>H</p>", text: "H" });
    expect(res.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: "Ductly <noreply@ductly.ae>",
      to: "a@b.com",
      subject: "S",
      html: "<p>H</p>",
      text: "H",
    });
  });

  it("returns ok:false with the Resend message on a non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })
      )
    );
    const res = await sendEmail({ to: "a@b.com", subject: "S", html: "h", text: "h" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("domain not verified");
  });

  it("returns ok:false when the API key is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await sendEmail({ to: "a@b.com", subject: "S", html: "h", text: "h" });
    expect(res.ok).toBe(false);
  });

  it("honors EMAIL_FROM override", async () => {
    process.env.EMAIL_FROM = "Support <support@ductly.ae>";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail({ to: "a@b.com", subject: "S", html: "h", text: "h" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.from).toBe("Support <support@ductly.ae>");
  });
});
