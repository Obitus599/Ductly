import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/export?type=bookings|customers|feedback
 *
 * Exports data as CSV for download.
 */
export async function GET(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (!type) {
    return NextResponse.json(
      { error: "Missing required 'type' parameter. Use bookings, customers, or feedback." },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin;

  let csvContent: string;
  let filename: string;

  switch (type) {
    case "bookings": {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, slot_start, slot_end, address, status, payment_intent_id, created_at, customer_id, team_id")
        .order("slot_start", { ascending: false })
        .limit(5000)
        .returns<Record<string, unknown>[]>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      const headers = ["id", "slot_start", "slot_end", "address", "status", "payment_intent_id", "created_at", "customer_id", "team_id"];
      csvContent = toCsv(headers, rows);
      filename = `ductly-bookings-${new Date().toISOString().split("T")[0]}.csv`;
      break;
    }

    case "customers": {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone, whatsapp_opt_in, created_at")
        .order("created_at", { ascending: false })
        .limit(5000)
        .returns<Record<string, unknown>[]>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      const headers = ["id", "name", "email", "phone", "whatsapp_opt_in", "created_at"];
      csvContent = toCsv(headers, rows);
      filename = `ductly-customers-${new Date().toISOString().split("T")[0]}.csv`;
      break;
    }

    case "feedback": {
      const { data, error } = await supabase
        .from("feedback")
        .select("id, booking_id, customer_id, rating, comment, created_at")
        .order("created_at", { ascending: false })
        .limit(5000)
        .returns<Record<string, unknown>[]>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      const headers = ["id", "booking_id", "customer_id", "rating", "comment", "created_at"];
      csvContent = toCsv(headers, rows);
      filename = `ductly-feedback-${new Date().toISOString().split("T")[0]}.csv`;
      break;
    }

    default:
      return NextResponse.json({ error: "Invalid type. Use bookings, customers, or feedback." }, { status: 400 });
  }

  // BOM prefix so Excel on Windows handles UTF-8 correctly (Arabic addresses, etc.)
  const bom = "\uFEFF";

  return new NextResponse(bom + csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsv(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
