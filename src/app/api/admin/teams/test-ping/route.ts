import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";

/**
 * POST /api/admin/teams/test-ping
 * Body: { team_id: string }
 *
 * Sends a Twilio SMS to the team's WhatsApp number so admin can
 * verify the number is reachable before a real dispatch goes out.
 * SMS not WhatsApp on purpose — SMS doesn't need template approval
 * and works the moment Twilio creds are configured, regardless of
 * the WhatsApp Business sender state.
 */
export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = requireAdmin(request);
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

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !fromNumber) {
    return NextResponse.json(
      {
        error:
          "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.",
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

  // Twilio expects E.164 (+9715...) — strip everything except digits and +
  const to = team.whatsapp_number.replace(/[^0-9+]/g, "");

  const params = new URLSearchParams();
  params.set("From", fromNumber);
  params.set("To", to);
  params.set(
    "Body",
    `Ductly dispatch test ping for ${team.name}. If you received this, your number is reachable.`
  );

  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  const twilioJson = await twilioRes.json().catch(() => ({}));

  if (!twilioRes.ok) {
    return NextResponse.json(
      {
        error: "Twilio rejected the send.",
        twilio_status: twilioRes.status,
        twilio_message: twilioJson.message ?? null,
        twilio_code: twilioJson.code ?? null,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    to,
    sid: twilioJson.sid,
    status: twilioJson.status,
  });
}
