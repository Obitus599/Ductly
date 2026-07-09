import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { sendWhatsAppTemplate, whatsappConfigured } from "@/lib/twilio-whatsapp";

/**
 * POST /api/admin/teams/test-ping
 * Body: { team_id: string }
 *
 * Sends the `ductly_ping` WhatsApp template to the team's number so
 * admin can verify it's reachable on the SAME channel a real dispatch
 * uses. SMS is not an option here: the Twilio sender is a WhatsApp-only
 * number (not SMS-capable), so an SMS From is rejected as "not a Twilio
 * phone number". Business-initiated WhatsApp needs an approved template,
 * hence the dedicated ductly_ping utility template (variable 1 = team
 * name), configured via TWILIO_CONTENT_SID_DUCTLY_PING.
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

  if (!whatsappConfigured()) {
    return NextResponse.json(
      {
        error:
          "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.",
      },
      { status: 503 }
    );
  }

  const contentSid = process.env.TWILIO_CONTENT_SID_DUCTLY_PING;
  if (!contentSid) {
    return NextResponse.json(
      {
        error:
          "Ping template not configured. Create the ductly_ping template (scripts/twilio) and set TWILIO_CONTENT_SID_DUCTLY_PING.",
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

  // E.164 for the response; sendWhatsAppTemplate wraps both From and To
  // as whatsapp:<number> so the channels match.
  const to = team.whatsapp_number.replace(/[^0-9+]/g, "");
  const result = await sendWhatsAppTemplate(to, contentSid, { "1": team.name });

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
