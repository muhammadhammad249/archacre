import { requireAdmin } from "@/lib/studio-auth";
import { readRows } from "@/lib/studio-data";

export const dynamic = "force-dynamic";

const columns = ["id", "kind", "status", "name", "phone", "email", "service", "city", "message", "created_at", "updated_at"] as const;

function csvCell(value: string | null) {
  const text = value ?? "";
  // Keep formula-like text and phone numbers literal in spreadsheet imports.
  const formulaLike = /^[\s\p{Cf}]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(text);
  return '"' + ((formulaLike ? "\t" : "") + text).replaceAll('"', '""') + '"';
}

export async function GET() {
  const { supabase } = await requireAdmin();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, noarchive",
  };

  try {
    type InquiryRow = Record<(typeof columns)[number], string | null>;
    const inquiries = await readRows<InquiryRow>((start, end) =>
      supabase.from("inquiries").select(columns.join(",")).order("created_at").order("id")
        .range(start, end).returns<InquiryRow[]>(),
    );
    const lines = [
      columns.join(","),
      ...inquiries.map(inquiry => columns.map(column => csvCell(inquiry[column])).join(",")),
    ];
    return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="arch-acre-inquiries-' + new Date().toISOString().slice(0, 10) + '.csv"',
      },
    });
  } catch {
    return Response.json({ error: "The inquiry export could not be generated." }, { status: 503, headers });
  }
}
