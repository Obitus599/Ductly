import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin, requireSameOrigin } from "@/lib/admin-auth";

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
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid blackout id." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("schedule_blackouts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
