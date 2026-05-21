import { supabaseAdmin } from "@/utils/supabase/admin";

const AGENT_TIMEOUT_MS = 30_000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4

/** Get day-of-week in UAE local time (UTC+4), regardless of server timezone */
export function uaeDayOfWeek(isoTimestamp: string): number {
  const utcMs = new Date(isoTimestamp).getTime();
  return new Date(utcMs + UAE_OFFSET_MS).getUTCDay();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamSchedule {
  team_id: string;
  team_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface TeamWorkload {
  team_id: string;
  team_name: string;
  booking_count: number;
}

interface SlotLockInfo {
  team_id: string;
  slot_start: string;
}

interface BookingInfo {
  team_id: string;
  slot_start: string;
  slot_end: string;
  address: string;
  address_details: Record<string, unknown> | null;
}

/**
 * Haversine straight-line distance between two coordinates in km.
 * Used as a cheap travel-cost proxy in the deterministic fallback
 * tiebreak — we don't hit Google Distance Matrix here because the
 * fallback is meant to be fast and offline-safe.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─── Tool Implementations ────────────────────────────────────────────────────

async function getTeamSchedules(dayOfWeek: number): Promise<TeamSchedule[]> {
  const supabase = supabaseAdmin;
  const { data } = await supabase
    .from("team_schedules")
    .select("team_id, day_of_week, start_time, end_time")
    .eq("day_of_week", dayOfWeek)
    .eq("active", true)
    .returns<{ team_id: string; day_of_week: number; start_time: string; end_time: string }[]>();

  if (!data) return [];

  // Get team names
  const teamIds = Array.from(new Set(data.map((d) => d.team_id)));
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", teamIds)
    .returns<{ id: string; name: string }[]>();

  const teamMap = new Map((teams || []).map((t) => [t.id, t.name]));

  return data.map((d) => ({
    ...d,
    team_name: teamMap.get(d.team_id) || "Unknown",
  }));
}

async function getTeamWorkloads(weekStart: string): Promise<TeamWorkload[]> {
  const supabase = supabaseAdmin;
  const weekEndDate = new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekEnd = weekEndDate.toISOString();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("active", true)
    .returns<{ id: string; name: string }[]>();

  if (!teams) return [];

  const { data: bookings } = await supabase
    .from("bookings")
    .select("team_id")
    .gte("slot_start", weekStart)
    .lte("slot_start", weekEnd)
    .not("status", "in", '("cancelled")')
    .returns<{ team_id: string | null }[]>();

  const counts = new Map<string, number>();
  for (const b of bookings || []) {
    if (b.team_id) counts.set(b.team_id, (counts.get(b.team_id) || 0) + 1);
  }

  return teams.map((t) => ({
    team_id: t.id,
    team_name: t.name,
    booking_count: counts.get(t.id) || 0,
  }));
}

async function getExistingBookingsForDate(date: string): Promise<BookingInfo[]> {
  const supabase = supabaseAdmin;
  const { data } = await supabase
    .from("bookings")
    .select("team_id, slot_start, slot_end, address, address_details")
    .gte("slot_start", `${date}T00:00:00+04:00`)
    .lte("slot_start", `${date}T23:59:59+04:00`)
    .not("status", "in", '("cancelled")')
    .not("team_id", "is", null)
    .returns<BookingInfo[]>();

  return data || [];
}

async function getSlotLocksForDate(date: string): Promise<SlotLockInfo[]> {
  const supabase = supabaseAdmin;
  const { data } = await supabase
    .from("slot_locks")
    .select("team_id, slot_start")
    .gte("slot_start", `${date}T00:00:00+04:00`)
    .lte("slot_start", `${date}T23:59:59+04:00`)
    .returns<SlotLockInfo[]>();

  return data || [];
}

async function assignBookingToTeam(
  bookingId: string,
  teamId: string,
  slotStart: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = supabaseAdmin;

  // Conditional update: only assign team_id if it's still unassigned.
  // If an admin manually set it between checkout and now, we yield —
  // don't override their decision. Combined with the slot_locks
  // unique-on-booking_id constraint, this closes the race between
  // the webhook agent and admin team-reassignment writes.
  const { data: claimed, error: bookingError } = await supabase
    .from("bookings")
    .update({ team_id: teamId } as never)
    .eq("id", bookingId)
    .is("team_id", null)
    .select("id")
    .returns<{ id: string }[]>();

  if (bookingError) {
    return { success: false, error: bookingError.message };
  }

  if (!claimed || claimed.length === 0) {
    // Admin already assigned a team — leave their slot_lock in place.
    console.log(
      `Scheduling agent yielded for booking ${bookingId} — team already assigned by admin`
    );
    return { success: true };
  }

  // Upsert slot lock (unique on booking_id — replaces any orphan).
  const { error: lockError } = await supabase
    .from("slot_locks")
    .upsert(
      {
        team_id: teamId,
        slot_start: slotStart,
        booking_id: bookingId,
      } as never,
      { onConflict: "booking_id" }
    );

  if (lockError) {
    return { success: false, error: lockError.message };
  }

  return { success: true };
}

// ─── Tool Definitions for GPT-4o ─────────────────────────────────────────────

const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_team_schedules",
      description:
        "Get all active team schedules for a specific day of the week. Returns team IDs, names, and their working hours.",
      parameters: {
        type: "object",
        properties: {
          day_of_week: {
            type: "number",
            description: "Day of week (0=Sunday, 6=Saturday)",
          },
        },
        required: ["day_of_week"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_workloads",
      description:
        "Get the number of bookings each team has for the current week. Helps balance workload across teams.",
      parameters: {
        type: "object",
        properties: {
          week_start: {
            type: "string",
            description: "ISO date string for the start of the week",
          },
        },
        required: ["week_start"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_existing_bookings",
      description:
        "Get all confirmed bookings for a specific date, including team assignments, times, and addresses. Use this to check which teams are busy and where they will be.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_slot_locks",
      description:
        "Get all permanent slot locks for a date. Shows which teams are already locked into specific time slots.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "assign_booking",
      description:
        "Assign a booking to a specific team. This updates the booking record and creates a permanent slot lock. Call this ONCE when you have decided the best team.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string", description: "The booking UUID" },
          team_id: { type: "string", description: "The chosen team UUID" },
          slot_start: {
            type: "string",
            description: "ISO timestamp of the booking slot start",
          },
        },
        required: ["booking_id", "team_id", "slot_start"],
      },
    },
  },
];

// ─── Tool Call Executor ──────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_team_schedules":
      return getTeamSchedules(args.day_of_week as number);
    case "get_team_workloads":
      return getTeamWorkloads(args.week_start as string);
    case "get_existing_bookings":
      return getExistingBookingsForDate(args.date as string);
    case "get_slot_locks":
      return getSlotLocksForDate(args.date as string);
    case "assign_booking":
      return assignBookingToTeam(
        args.booking_id as string,
        args.team_id as string,
        args.slot_start as string
      );
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Deterministic Fallback ──────────────────────────────────────────────────

async function deterministicAssign(
  bookingId: string,
  slotStart: string,
  date: string
): Promise<{ teamId: string; method: "fallback" }> {
  const dayOfWeek = uaeDayOfWeek(slotStart);
  const schedules = await getTeamSchedules(dayOfWeek);
  const existingBookings = await getExistingBookingsForDate(date);
  const slotLocks = await getSlotLocksForDate(date);

  // Get teams that are NOT already locked for this slot
  // Compare by epoch ms to handle different timezone offset formats
  const slotStartMs = new Date(slotStart).getTime();
  const lockedTeamIds = new Set(
    slotLocks
      .filter((l) => new Date(l.slot_start).getTime() === slotStartMs)
      .map((l) => l.team_id)
  );

  const availableTeams = schedules
    .map((s) => s.team_id)
    .filter((id) => !lockedTeamIds.has(id));

  if (availableTeams.length === 0) {
    throw new Error("No teams available for this slot");
  }

  // Look up the new booking's coordinates for travel-distance tiebreak.
  const supabase = supabaseAdmin;
  const { data: newBooking } = await supabase
    .from("bookings")
    .select("address_details")
    .eq("id", bookingId)
    .returns<{ address_details: Record<string, unknown> | null }[]>()
    .single();
  const newLat = (newBooking?.address_details?.lat as number | undefined) ?? null;
  const newLng = (newBooking?.address_details?.lng as number | undefined) ?? null;

  // Per-team booking count + distance from their last job before this slot.
  // Distance = 0 when (a) team has no prior booking today, or (b) we lack
  // coordinates for either end. That keeps the heuristic safe — when in
  // doubt, fall back to pure least-booked.
  const teamScores = new Map<string, { count: number; distanceKm: number }>();
  for (const id of availableTeams) {
    teamScores.set(id, { count: 0, distanceKm: 0 });
  }

  for (const b of existingBookings) {
    if (!b.team_id || !teamScores.has(b.team_id)) continue;
    const score = teamScores.get(b.team_id)!;
    score.count += 1;
  }

  if (newLat !== null && newLng !== null) {
    for (const id of availableTeams) {
      // Most recent booking ending before this slot start
      const priorJobs = existingBookings
        .filter((b) => b.team_id === id)
        .filter((b) => new Date(b.slot_end).getTime() <= slotStartMs)
        .sort(
          (a, b) =>
            new Date(b.slot_end).getTime() - new Date(a.slot_end).getTime()
        );
      const prior = priorJobs[0];
      const priorLat = prior?.address_details?.lat as number | undefined;
      const priorLng = prior?.address_details?.lng as number | undefined;

      if (typeof priorLat === "number" && typeof priorLng === "number") {
        const score = teamScores.get(id)!;
        score.distanceKm = haversineKm(priorLat, priorLng, newLat, newLng);
      }
    }
  }

  // Sort: fewest bookings first; tiebreak on shortest travel distance.
  const sorted = Array.from(teamScores.entries()).sort((a, b) => {
    if (a[1].count !== b[1].count) return a[1].count - b[1].count;
    return a[1].distanceKm - b[1].distanceKm;
  });
  const chosenTeamId = sorted[0][0];

  const result = await assignBookingToTeam(bookingId, chosenTeamId, slotStart);
  if (!result.success) {
    throw new Error(`Fallback assignment failed: ${result.error}`);
  }

  console.log(
    `Deterministic fallback picked ${chosenTeamId} (count=${sorted[0][1].count}, distance=${sorted[0][1].distanceKm.toFixed(
      1
    )}km)`
  );
  return { teamId: chosenTeamId, method: "fallback" };
}

// ─── Main Agent Function ─────────────────────────────────────────────────────

/**
 * Layer 2 Agentic Team Assignment
 *
 * Uses GPT-4o via OpenRouter with tool use to intelligently assign
 * the best team to a booking based on:
 *   - Team schedules and availability
 *   - Current workload balance
 *   - Existing bookings and locations (route density)
 *   - Slot lock conflicts
 *
 * Falls back to deterministic least-booked rule if:
 *   - Agent times out (30s)
 *   - OpenRouter API fails
 *   - Agent produces invalid output
 */
export async function assignTeamToBooking(
  bookingId: string,
  slotStart: string,
  address: string
): Promise<{ teamId: string; method: "agent" | "fallback" }> {
  const date = slotStart.split("T")[0];
  const apiKey = process.env.OPENROUTER_API_KEY;

  // If no OpenRouter key, go straight to fallback
  if (!apiKey || apiKey === "your_openrouter_api_key") {
    console.log("No OpenRouter API key, using deterministic fallback");
    return deterministicAssign(bookingId, slotStart, date);
  }

  const systemPrompt = `You are a field service dispatch optimizer for Ductly, a duct cleaning company in the UAE.

A new booking has been confirmed and you must assign the best team.

BOOKING DETAILS:
- Booking ID: ${bookingId}
- Slot: ${slotStart}
- Address: ${address}

YOUR GOAL: Assign the optimal team considering:
1. Which teams are working today and available at this time slot
2. Which teams already have nearby jobs (route density - minimize travel)
3. Workload balance across the week (spread jobs evenly)
4. Avoid teams already locked into this time slot

PROCESS:
1. First get team schedules for this day
2. Check existing bookings to see who is busy and where
3. Check slot locks to see conflicts
4. Check weekly workloads for balance
5. Choose the best team and call assign_booking EXACTLY ONCE

Be decisive. Pick the best team and assign immediately. Do not deliberate excessively.`;

  const messages: Array<{ role: string; content: string; tool_call_id?: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: "Please assign the optimal team to this booking now." },
  ];

  try {
    // Agent loop with timeout
    const deadline = Date.now() + AGENT_TIMEOUT_MS;
    let assigned = false;
    let assignedTeamId = "";

    for (let turn = 0; turn < 6; turn++) {
      if (Date.now() > deadline) {
        console.warn("Agent timeout, falling back to deterministic");
        break;
      }

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o",
          max_tokens: 2000,
          messages,
          tools,
          tool_choice: "auto",
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        console.error("OpenRouter API error:", response.status);
        break;
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      // If no tool calls, agent is done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        break;
      }

      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolCall.function.name, args);

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });

        // Check if this was the assign call
        if (toolCall.function.name === "assign_booking") {
          const assignResult = result as { success: boolean };
          if (assignResult.success) {
            assigned = true;
            assignedTeamId = args.team_id;
          }
        }
      }

      if (assigned) break;
    }

    if (assigned) {
      console.log(`Agent assigned team ${assignedTeamId} to booking ${bookingId}`);
      return { teamId: assignedTeamId, method: "agent" };
    }

    // Agent didn't assign — fall back
    console.warn("Agent did not assign, using deterministic fallback");
    return deterministicAssign(bookingId, slotStart, date);
  } catch (error) {
    console.error("Agent error:", error);
    return deterministicAssign(bookingId, slotStart, date);
  }
}
