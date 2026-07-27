/**
 * Tabby (BNPL) client — hosted-checkout redirect flow.
 *
 * Tabby is not a Stripe payment method; it has its own hosted checkout.
 * We create a session (server-to-server, Bearer secret key), redirect the
 * customer to the returned web_url, then verify + capture server-side on
 * return/webhook. Auth-then-capture: only captured payments settle.
 *
 * Amounts are decimal strings in MAJOR units ("366.45"), unlike Stripe's
 * integer fils — we convert at the boundary. The amount sent is the
 * VAT-inclusive total (the customer pays net + 5% VAT, same as Stripe).
 *
 * Docs: https://docs.tabby.ai/api-reference
 */

const BASE_URL = process.env.TABBY_BASE_URL || "https://api.tabby.ai";

export function tabbyConfigured(): boolean {
  return Boolean(process.env.TABBY_SECRET_KEY && process.env.TABBY_MERCHANT_CODE);
}

/** Integer fils → Tabby's decimal-string major units: 36645 → "366.45". */
export function formatTabbyAmount(fils: number): string {
  return (Math.round(fils) / 100).toFixed(2);
}

export interface TabbyBuyer {
  name: string;
  email: string;
  phone: string;
}

export interface TabbyOrderItem {
  title: string;
  quantity: number;
  unit_price: string; // major units
  category: string;
}

export interface CreateSessionInput {
  bookingId: string;
  amountFils: number; // VAT-inclusive total
  currency?: string; // default AED
  description: string;
  buyer: TabbyBuyer;
  items: TabbyOrderItem[];
  merchantUrls: { success: string; cancel: string; failure: string };
  lang?: string; // default "en"
}

export interface CreateSessionResult {
  ok: boolean;
  /** true when Tabby approved and returned a hosted-checkout web_url. */
  eligible: boolean;
  webUrl?: string;
  paymentId?: string;
  /** e.g. "order_amount_too_high" / "not_available" when not eligible. */
  rejectionReason?: string;
  status?: number;
  errorMessage?: string;
}

export interface PaymentResult {
  ok: boolean;
  /** Uppercase per API: CREATED | AUTHORIZED | CLOSED | REJECTED | EXPIRED. */
  paymentStatus?: string;
  amount?: string;
  currency?: string;
  status?: number;
  errorMessage?: string;
}

function authHeader(): string {
  return `Bearer ${process.env.TABBY_SECRET_KEY}`;
}

/**
 * Create a Tabby checkout session for a booking. Returns the hosted
 * checkout web_url when the customer is eligible; otherwise `eligible:
 * false` with a rejection reason so the caller can fall back to card.
 */
export async function createCheckoutSession(
  input: CreateSessionInput
): Promise<CreateSessionResult> {
  if (!tabbyConfigured()) {
    return { ok: false, eligible: false, errorMessage: "Tabby not configured." };
  }

  const amount = formatTabbyAmount(input.amountFils);
  const payload = {
    payment: {
      amount,
      currency: input.currency || "AED",
      description: input.description,
      buyer: {
        name: input.buyer.name,
        email: input.buyer.email,
        phone: input.buyer.phone,
      },
      order: {
        reference_id: input.bookingId,
        items: input.items,
      },
    },
    lang: input.lang || "en",
    merchant_code: process.env.TABBY_MERCHANT_CODE,
    merchant_urls: input.merchantUrls,
  };

  try {
    const res = await fetch(`${BASE_URL}/api/v2/checkout`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      return {
        ok: false,
        eligible: false,
        status: res.status,
        errorMessage:
          (json as { error?: string }).error ?? "Tabby rejected the session request.",
      };
    }

    const paymentId = (json.payment as { id?: string } | undefined)?.id;
    const config = json.configuration as
      | {
          available_products?: { installments?: Array<{ web_url?: string }> };
          products?: { installments?: { rejection_reason?: string } };
        }
      | undefined;
    const webUrl = config?.available_products?.installments?.[0]?.web_url;
    const rejectionReason = config?.products?.installments?.rejection_reason;

    if (!webUrl) {
      // Tabby responded but the customer isn't eligible for installments.
      return {
        ok: true,
        eligible: false,
        paymentId,
        rejectionReason: rejectionReason || "not_available",
      };
    }

    return { ok: true, eligible: true, webUrl, paymentId };
  } catch (err) {
    return {
      ok: false,
      eligible: false,
      errorMessage: err instanceof Error ? err.message : "Tabby session failed.",
    };
  }
}

/** Retrieve a payment to verify its status server-side (never trust the redirect). */
export async function retrievePayment(paymentId: string): Promise<PaymentResult> {
  if (!tabbyConfigured()) {
    return { ok: false, errorMessage: "Tabby not configured." };
  }
  try {
    const res = await fetch(`${BASE_URL}/api/v2/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorMessage: (json as { error?: string }).error ?? "Tabby retrieve failed.",
      };
    }
    return {
      ok: true,
      paymentStatus: json.status as string | undefined,
      amount: json.amount as string | undefined,
      currency: json.currency as string | undefined,
    };
  } catch (err) {
    return { ok: false, errorMessage: err instanceof Error ? err.message : "Tabby retrieve failed." };
  }
}

/**
 * Capture an AUTHORIZED payment (full amount) to settle it. A successful
 * capture moves the payment to CLOSED. Capturing a non-AUTHORIZED payment
 * returns a 400 from Tabby — callers should retrieve first.
 */
export async function capturePayment(
  paymentId: string,
  amountFils: number
): Promise<PaymentResult> {
  if (!tabbyConfigured()) {
    return { ok: false, errorMessage: "Tabby not configured." };
  }
  try {
    const res = await fetch(
      `${BASE_URL}/api/v2/payments/${encodeURIComponent(paymentId)}/captures`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: formatTabbyAmount(amountFils) }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorMessage: (json as { error?: string }).error ?? "Tabby capture failed.",
      };
    }
    return { ok: true, paymentStatus: json.status as string | undefined };
  } catch (err) {
    return { ok: false, errorMessage: err instanceof Error ? err.message : "Tabby capture failed." };
  }
}
