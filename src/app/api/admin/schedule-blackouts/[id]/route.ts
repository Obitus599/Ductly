import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { fireOpsAlert } from "@/lib/ops-alert";
import { formatSlotForDispatch } from "@/lib/dispatch-format";

/**
 * DELETE /api/admin/schedule-blackouts/[id]
 *
 * Removes a blackout. Idempotent — returns 200 even if the id is gone.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  const authError = await requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid blackout id." }, { status: 400 });
  }

  // .select() returns the removed row(s) so we can describe what was
  // unblocked in the ops alert. Empty array = nothing matched (already
  // gone) — still a 200, just no alert.
  const { data: removed, error } = await supabaseAdmin
    .from("schedule_blackouts")
    .delete()
    .eq("id", id)
    .select("id, team_id, starts_at, ends_at, reason")
    .returns<{ id: string; team_id: string | null; starts_at: string; ends_at: string; reason: string }[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the owners that a block was removed. Dormant until
  // N8N_WEBHOOK_OPS_ALERT is configured.
  if (removed && removed.length > 0) {
    const b = removed[0];
    fireOpsAlert("blackout_removed", {
      slotStart: b.starts_at,
      extra: `${b.team_id ? "Team-specific" : "All teams"} · ${formatSlotForDispatch(b.starts_at)} → ${formatSlotForDispatch(b.ends_at)} · ${b.reason}`,
      source: request.headers.get("x-admin-email") || "admin",
    });
  }

  return NextResponse.json({ ok: true });
}
