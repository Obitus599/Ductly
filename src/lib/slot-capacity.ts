import { supabaseAdmin } from "@/utils/supabase/admin";
import { UAE_TZ_SUFFIX } from "@/lib/slot-helpers";

/**
 * Can a booking for [slotStart, slotEnd) still be served right now?
 *
 * Two independent conditions, both required:
 *   1. The slot is still in the future.
 *   2. There is at least one active team free for the whole window.
 *
 * Used to guard the late Tabby settlement paths (redirect, webhook, and
 * the 72-hour reconciler). Those paths can revive a booking the stale
 * sweep already flipped to `expired`, whose slot may since have passed or
 * been resold to another customer. Confirming it would charge someone for
 * a job no crew can do, so the caller refunds instead when this returns
 * false.
 *
 * excludeBookingId drops the booking being evaluated from the occupancy
 * count so it is not treated as competing with itself.
 */
export interface FulfillabilityResult {
  ok: boolean;
  reason?: "slot_in_past" | "no_capacity" | "no_teams";
}

export async function isSlotFulfillable(
  slotStart: string,
  slotEnd: string,
  excludeBookingId: string
): Promise<FulfillabilityResult> {
  const startMs = new Date(slotStart).getTime();
  const endMs = new Date(slotEnd).getTime();

  if (!Number.isFinite(startMs) || startMs <= Date.now()) {
    return { ok: false, reason: "slot_in_past" };
  }

  const { data: activeTeams } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("active", true)
    .returns<{ id: string }[]>();
  const totalTeams = activeTeams?.length ?? 0;
  if (totalTeams === 0) return { ok: false, reason: "no_teams" };

  const dateStr = slotStart.split("T")[0];
  const { data: sameDay } = await supabaseAdmin
    .from("bookings")
    .select("id, slot_start, slot_end, team_id")
    .gte("slot_start", `${dateStr}T00:00:00${UAE_TZ_SUFFIX}`)
    .lte("slot_start", `${dateStr}T23:59:59${UAE_TZ_SUFFIX}`)
    .in("status", ["pending", "confirmed"])
    .returns<{ id: string; slot_start: string; slot_end: string; team_id: string | null }[]>();

  const occupiedTeams = new Set<string>();
  let unassignedHolds = 0;
  for (const b of sameDay ?? []) {
    if (b.id === excludeBookingId) continue;
    const bStart = new Date(b.slot_start).getTime();
    const bEnd = new Date(b.slot_end).getTime();
    if (startMs < bEnd && bStart < endMs) {
      if (b.team_id) occupiedTeams.add(b.team_id);
      else unassignedHolds += 1;
    }
  }

  if (occupiedTeams.size + unassignedHolds >= totalTeams) {
    return { ok: false, reason: "no_capacity" };
  }
  return { ok: true };
}
