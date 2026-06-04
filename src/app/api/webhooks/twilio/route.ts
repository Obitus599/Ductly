import { NextRequest, NextResponse } from "next/server";
import { validateTwilioSignature } from "@/lib/twilio-verify";
import { processJobStatusReply } from "@/lib/job-completion";

/**
 * POST /api/webhooks/twilio
 *
 * Inbound Twilio webhook for WhatsApp replies. Currently handles the
 * #9 job-status quick-reply (Completed / Not completed); other inbound
 * messages are acknowledged and ignored.
 *
 * Every request is verified against X-Twilio-Signature. Configure the
 * Twilio number's inbound webhook to exactly TWILIO_WEBHOOK_URL (or
 * NEXT_PUBLIC_APP_URL + /api/webhooks/twilio) so the signed URL matches.
 */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): NextResponse {
  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature");

  const params: Record<string, string> = {};
  try {
    const form = await request.formData();
    form.forEach((v, k) => {
      params[k] = typeof v === "string" ? v : "";
    });
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const url =
    process.env.TWILIO_WEBHOOK_URL ||
    `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/twilio`;

  if (!authToken || !validateTwilioSignature(authToken, url, params, signature)) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  try {
    const result = await processJobStatusReply({
      from: params.From || "",
      buttonPayload: params.ButtonPayload,
      buttonText: params.ButtonText,
    });
    if (result.matched) {
      console.log(
        `[twilio inbound] ${result.outcome} for booking ${result.bookingId}` +
          (result.invoiceNumber ? ` (invoice ${result.invoiceNumber})` : "")
      );
    }
  } catch (err) {
    // Never make Twilio retry on our internal error — log and ack.
    console.error("[twilio inbound] processing failed:", err);
  }

  return twiml();
}
