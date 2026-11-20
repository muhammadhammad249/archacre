import { requireAdmin } from "@/lib/studio-auth";
import { readRows } from "@/lib/studio-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase } = await requireAdmin();
  const exportedAt = new Date().toISOString();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, noarchive",
  };

  try {
    const [projects, site_content, inquiries, media_assets, audit_events, analytics_daily] = await Promise.all([
      readRows((start, end) => supabase.from("projects").select("*").order("id").range(start, end)),
      readRows((start, end) => supabase.from("site_content").select("*").order("key").range(start, end)),
      readRows((start, end) => supabase.from("inquiries").select("*").order("id").range(start, end)),
      readRows((start, end) => supabase.from("media_assets").select("*").order("id").range(start, end)),
      readRows((start, end) => supabase.from("audit_events").select("*").order("id").range(start, end)),
      readRows((start, end) => supabase.from("analytics_daily").select("*").order("day").order("path").range(start, end)),
    ]);

    return Response.json(
      { version: 1, exportedAt, projects, site_content, inquiries, media_assets, audit_events, analytics_daily },
      {
        headers: {
          ...headers,
          "Content-Disposition": 'attachment; filename="arch-acre-backup-' + exportedAt.slice(0, 10) + '.json"',
        },
      },
    );
  } catch {
    return Response.json({ error: "The studio backup could not be generated." }, { status: 503, headers });
  }
}
