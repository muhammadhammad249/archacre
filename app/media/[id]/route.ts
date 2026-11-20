import { serviceDatabase } from "@/lib/public-db";
import { getStudioMember } from "@/lib/studio-auth";
import { studioId } from "@/lib/studio-model";

export const dynamic = "force-dynamic";

const types = new Set(["image/webp", "image/jpeg", "image/png", "image/avif"]);
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

function unavailable() {
  return new Response("Image unavailable", { status: 404, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = studioId.safeParse((await params).id);
  if (!id.success) return unavailable();

  try {
    const service = serviceDatabase();
    const visibility = await service?.rpc("studio_media_is_public", { p_id: id.data });
    const published = !visibility?.error && visibility?.data === true;
    const member = published ? null : await getStudioMember();
    const database = published ? service : member?.verified ? member.supabase : null;
    if (!database) return unavailable();

    const { data: asset, error } = await database.from("media_assets").select("path,mime_type")
      .eq("id", id.data).eq("active", true).maybeSingle();
    if (error || !asset || !types.has(asset.mime_type)) return unavailable();

    const file = await database.storage.from("studio-media").download(asset.path, {}, {
      cache: "no-store",
      signal: request.signal,
    });
    if (file.error || !file.data || file.data.size === 0 || file.data.size > 10_485_760) return unavailable();

    return new Response(file.data, {
      headers: {
        ...headers,
        "Content-Type": asset.mime_type,
        "Content-Disposition": "inline",
        ...(published ? {} : {
          "Cross-Origin-Resource-Policy": "same-origin",
          "X-Robots-Tag": "noindex, noarchive",
        }),
      },
    });
  } catch {
    return unavailable();
  }
}
