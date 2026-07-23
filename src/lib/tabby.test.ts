import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatTabbyAmount,
  tabbyConfigured,
  createCheckoutSession,
  retrievePayment,
  capturePayment,
} from "./tabby";

const SESSION_INPUT = {
  bookingId: "book-1",
  amountFils: 36645,
  description: "Ductly duct cleaning",
  buyer: { name: "Ahmed", email: "a@test.com", phone: "+971501234567" },
  items: [{ title: "Duct Cleaning", quantity: 1, unit_price: "366.45", category: "Home Services" }],
  merchantUrls: { success: "s", cancel: "c", failure: "f" },
};

describe("formatTabbyAmount", () => {
  it("converts fils to a 2dp major-unit string", () => {
    expect(formatTabbyAmount(36645)).toBe("366.45");
    expect(formatTabbyAmount(34900)).toBe("349.00");
    expect(formatTabbyAmount(0)).toBe("0.00");
    expect(formatTabbyAmount(5)).toBe("0.05");
  });
});

describe("tabby client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TABBY_SECRET_KEY = "sk_test_x";
    process.env.TABBY_MERCHANT_CODE = "MERCH1";
  });
  afterEach(() => {
    delete process.env.TABBY_SECRET_KEY;
    delete process.env.TABBY_MERCHANT_CODE;
    vi.unstubAllGlobals();
  });

  it("tabbyConfigured reflects env", () => {
    expect(tabbyConfigured()).toBe(true);
    delete process.env.TABBY_SECRET_KEY;
    expect(tabbyConfigured()).toBe(false);
  });

  it("createCheckoutSession returns not-configured without keys", async () => {
    delete process.env.TABBY_SECRET_KEY;
    const r = await createCheckoutSession(SESSION_INPUT);
    expect(r.ok).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("createCheckoutSession returns web_url when eligible + sends a correct payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        payment: { id: "pay_123", status: "created" },
        configuration: {
          available_products: { installments: [{ web_url: "https://checkout.tabby.ai/x" }] },
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const r = await createCheckoutSession(SESSION_INPUT);
    expect(r).toMatchObject({ ok: true, eligible: true, webUrl: "https://checkout.tabby.ai/x", paymentId: "pay_123" });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/checkout");
    expect(opts.headers.Authorization).toBe("Bearer sk_test_x");
    const body = JSON.parse(opts.body as string);
    expect(body.payment.amount).toBe("366.45"); // VAT-inclusive total, major units
    expect(body.payment.currency).toBe("AED");
    expect(body.payment.order.reference_id).toBe("book-1");
    expect(body.merchant_code).toBe("MERCH1");
    expect(body.merchant_urls.success).toBe("s");
  });

  it("createCheckoutSession reports ineligibility with a reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          payment: { id: "pay_9", status: "created" },
          configuration: {
            available_products: { installments: [] },
            products: { installments: { rejection_reason: "order_amount_too_high" } },
          },
        }),
      })
    );
    const r = await createCheckoutSession(SESSION_INPUT);
    expect(r.ok).toBe(true);
    expect(r.eligible).toBe(false);
    expect(r.rejectionReason).toBe("order_amount_too_high");
    expect(r.webUrl).toBeUndefined();
  });

  it("createCheckoutSession surfaces a non-2xx error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "bad" }) })
    );
    const r = await createCheckoutSession(SESSION_INPUT);
    expect(r.ok).toBe(false);
    expect(r.eligible).toBe(false);
    expect(r.status).toBe(400);
  });

  it("retrievePayment returns the uppercase status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "AUTHORIZED", amount: "366.45" }) })
    );
    const r = await retrievePayment("pay_123");
    expect(r).toMatchObject({ ok: true, paymentStatus: "AUTHORIZED", amount: "366.45" });
  });

  it("capturePayment posts the full amount and returns CLOSED", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "CLOSED" }) });
    vi.stubGlobal("fetch", mockFetch);
    const r = await capturePayment("pay_123", 36645);
    expect(r).toMatchObject({ ok: true, paymentStatus: "CLOSED" });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/payments/pay_123/captures");
    expect(JSON.parse(opts.body as string).amount).toBe("366.45");
  });
});
