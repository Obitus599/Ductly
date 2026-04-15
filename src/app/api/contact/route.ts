import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/contact
 * Stores a contact form submission.
 * Body: { name: string, email: string, topic?: string, message?: string }
 */
export async function POST(request: NextRequest) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`contact:${clientIp}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { name, email, topic, message } = body;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }

    // Enforce length limits
    const safeName = String(name).slice(0, 200);
    const safeEmail = String(email).slice(0, 320);
    const safeTopic = topic ? String(topic).slice(0, 100) : null;
    const safeMessage = message ? String(message).slice(0, 5000) : null;

    const { error } = await supabaseAdmin
      .from("contact_submissions")
      .insert({
        name: safeName,
        email: safeEmail,
        topic: safeTopic,
        message: safeMessage,
      } as never);

    if (error) {
      console.error("Contact submission error:", error);
      return NextResponse.json(
        { error: "Failed to submit. Please try again." },
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
