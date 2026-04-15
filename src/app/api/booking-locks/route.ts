import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const LOCK_TTL_MINS = 10;

/**
 * POST /api/booking-locks
 * Creates a temporary booking lock (10-min TTL).
 * Body: { slot_start: string (ISO), session_id: string }
 *
 * The DB trigger `check_booking_lock_limit` prevents more concurrent
 * locks per slot than there are active teams.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 20 lock attempts per IP per 5 minutes
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`lock:${clientIp}`, 20, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const { slot_start, session_id } = await request.json();

    if (!slot_start || !session_id) {
      return NextResponse.json(
        { error: "slot_start and session_id are required." },
        { status: 400 }
      );
    }

    // Validate slot_start is a valid ISO timestamp
    if (isNaN(new Date(slot_start).getTime())) {
      return NextResponse.json(
        { error: "Invalid slot_start timestamp." },
        { status: 400 }
      );
    }

    // Validate session_id length
    if (typeof session_id !== "string" || session_id.length > 128) {
      return NextResponse.json(
        { error: "Invalid session_id." },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin;

    // Clean up expired locks first
    await supabase
      .from("booking_locks")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Prevent duplicate lock from same session for same slot
    const { data: existingLock } = await supabase
      .from("booking_locks")
      .select("id, slot_start, session_id, expires_at")
      .eq("session_id", session_id)
      .eq("slot_start", slot_start)
      .gt("expires_at", new Date().toISOString())
      .returns<{ id: string; slot_start: string; session_id: string; expires_at: string }[]>()
      .limit(1)
      .maybeSingle();

    if (existingLock) {
      return NextResponse.json(existingLock);
    }

    const expiresAt = new Date(
      Date.now() + LOCK_TTL_MINS * 60 * 1000
    ).toISOString();

    const { data: lock, error } = await supabase
      .from("booking_locks")
      .insert({
        slot_start,
        session_id,
        locked_at: new Date().toISOString(),
        expires_at: expiresAt,
      } as never)
      .select("id, slot_start, session_id, expires_at")
      .returns<{ id: string; slot_start: string; session_id: string; expires_at: string }[]>()
      .single();

    if (error) {
      // DB trigger raises P0001 (raise_exception) when lock limit is reached
      if (error.code === "P0001") {
        return NextResponse.json(
          { error: "All teams are booked for this slot. Please choose another time." },
          { status: 409 }
        );
      }
      console.error("Booking lock error:", error);
      return NextResponse.json(
        { error: "Failed to create booking lock." },
        { status: 500 }
      );
    }

    return NextResponse.json(lock);
  } catch (error) {
    console.error("Booking lock error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/booking-locks
 * Releases a booking lock.
 * Body: { session_id: string, slot_start: string }
 */
export async function DELETE(request: NextRequest) {
  // Rate limit: 30 delete attempts per IP per 5 minutes
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`lock-del:${clientIp}`, 30, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const { session_id, slot_start } = await request.json();

    if (!session_id || !slot_start) {
      return NextResponse.json(
        { error: "session_id and slot_start are required." },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin;

    await supabase
      .from("booking_locks")
      .delete()
      .eq("session_id", session_id)
      .eq("slot_start", slot_start);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Booking lock delete error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
