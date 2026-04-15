import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/newsletter
 * Subscribes an email to the newsletter.
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`newsletter:${clientIp}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email } = body;

    if (!email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email is required." },
        { status: 400 }
      );
    }

    const safeEmail = String(email).slice(0, 320).toLowerCase().trim();

    const { error } = await supabaseAdmin
      .from("newsletter_subscribers")
      .upsert(
        { email: safeEmail } as never,
        { onConflict: "email" }
      );

    if (error) {
      console.error("Newsletter subscribe error:", error);
      return NextResponse.json(
        { error: "Failed to subscribe." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }
}
