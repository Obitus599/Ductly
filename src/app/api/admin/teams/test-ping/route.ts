import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { sendSms, twilioConfigured } from "@/lib/twilio-sms";

/**
 * POST /api/admin/teams/test-ping
 * Body: { team_id: string }
 *
 * Sends a Twilio SMS to the team's number so admin can verify it's
 * reachable before a real dispatch goes out. SMS not WhatsApp on
 * purpose — it needs no template approval and works regardless of the
 * WhatsApp Business sender state.
 *
 * Delivery goes through sendSms(), which strips any "whatsapp:" prefix
 * off the From so From and To are on the SAME (SMS) channel. Sending
 * the WhatsApp-prefixed From with a plain To is what produced Twilio's
 * "Invalid From and To pair. From and To should be of the same channel"
 * rejection.
 */
export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  let body: { team_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.team_id || typeof body.team_id !== "string") {
    return NextResponse.json({ error: "team_id is required." }, { status: 400 });
  }

  if (!twilioConfigured()) {
    return NextResponse.json(
      {
        error:
          "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM (or TWILIO_WHATSAPP_FROM).",
      },
      { status: 503 }
    );
  }

  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .select("id, name, whatsapp_number")
    .eq("id", body.team_id)
    .returns<{ id: string; name: string; whatsapp_number: string }[]>()
    .single();

  if (teamError || !team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (!team.whatsapp_number) {
    return NextResponse.json(
      { error: "Team has no phone number on file." },
      { status: 400 }
    );
  }

  // E.164 for the response; sendSms normalizes the To identically.
  const to = team.whatsapp_number.replace(/[^0-9+]/g, "");
  const result = await sendSms(
    to,
    `Ductly dispatch test ping for ${team.name}. If you received this, your number is reachable.`
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Twilio rejected the send.",
        twilio_status: result.status ?? null,
        twilio_message: result.errorMessage ?? null,
        twilio_code: result.errorCode ?? null,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    to,
    sid: result.sid,
    status: result.status,
  });
}
