"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/studio-auth";
import { inquiryStatuses, isCmsSection, parseContent, projectInput, slugFor, studioId } from "@/lib/studio-model";

const value = (form: FormData, name: string) => String(form.get(name) ?? "");
const bucket = "studio-media";
const formats = new Set(["jpeg", "png", "webp", "avif"]);
const cropSizes: Record<string, [number, number]> = { square: [1400, 1400], landscape: [1760, 1100], portrait: [1200, 1600] };
function go(path: string, notice: string): never {
  if (notice === "saved" || notice === "deleted" || notice === "uploaded" || notice === "retry-delete") {
    revalidatePath("/studio", "layout");
  }
  redirect(path + "?notice=" + notice);
}

export async function saveProject(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = value(form, "id");
  if (id && !studioId.safeParse(id).success) return go("/studio/projects", "invalid");
  const destination = "/studio/projects/" + (id || "new");
  const project = projectInput.safeParse({
    title: value(form, "title"),
    slug: value(form, "slug") || slugFor(value(form, "title")),
    description: value(form, "description"),
    category: value(form, "category"), location: value(form, "location"),
    completion_date: value(form, "completion_date"), area: value(form, "area"),
    cover_image: value(form, "cover_image"), gallery: form.getAll("gallery"),
    featured: form.get("featured") === "on", sort_order: Number(value(form, "sort_order")),
    seo_title: value(form, "seo_title"), seo_description: value(form, "seo_description"),
    status: value(form, "status"),
  });
  if (!project.success) return go(destination, "invalid");
  const result = id
    ? await supabase.from("projects").update(project.data).eq("id", id).select("id").maybeSingle()
    : await supabase.from("projects").insert(project.data).select("id").single();
  if (result.error || !result.data) {
    return go(destination, result.error?.code === "23505" ? "duplicate-slug" : "failed");
  }
  go("/studio/projects/" + result.data.id, "saved");
}

export async function changeProjectStatus(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = studioId.safeParse(form.get("id"));
  const status = value(form, "status");
  if (!id.success || (status !== "draft" && status !== "published")) return go("/studio/projects", "invalid");
  const { data, error } = await supabase.from("projects").update({ status }).eq("id", id.data).select("id").maybeSingle();
  go("/studio/projects", error || !data ? "failed" : "saved");
}

export async function deleteProject(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = studioId.safeParse(form.get("id"));
  if (!id.success || form.get("confirm") !== "on") return go("/studio/projects", "invalid");
  const { data, error } = await supabase.from("projects").delete().eq("id", id.data).select("id").maybeSingle();
  go("/studio/projects", error || !data ? "failed" : "deleted");
}

export async function saveContent(form: FormData) {
  const { supabase } = await requireAdmin();
  const key = value(form, "key");
  if (!isCmsSection(key)) return go("/studio/content/homepage", "invalid");
  const destination = "/studio/content/" + key;
  let input: unknown;
  try { input = JSON.parse(value(form, "document")); }
  catch { return go(destination, "invalid"); }
  const parsed = parseContent(key, input);
  if (!parsed) return go(destination, "invalid");
  const { error } = await supabase.from("site_content").upsert({ key, value: parsed });
  go(destination, error ? "failed" : "saved");
}

export async function changeInquiryStatus(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = studioId.safeParse(form.get("id"));
  const status = inquiryStatuses.find(option => option === form.get("status"));
  if (!id.success || !status) return go("/studio/inquiries", "invalid");
  const { data, error } = await supabase.from("inquiries").update({ status }).eq("id", id.data).select("id").maybeSingle();
  go("/studio/inquiries", error || !data ? "failed" : "saved");
}

export async function uploadMedia(form: FormData) {
  const { supabase } = await requireAdmin();
  const files = form.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!files.length || files.length > 8 || files.reduce((sum, file) => sum + file.size, 0) > 3_900_000) {
    return go("/studio/media", "image-size");
  }
  const aspect = value(form, "aspect");
  if (aspect !== "original" && !Object.hasOwn(cropSizes, aspect)) return go("/studio/media", "invalid");
  const crop = cropSizes[aspect];
  const images = [];
  try {
    for (const file of files) {
      const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 32_000_000, failOn: "error" });
      const metadata = await image.metadata();
      const format = metadata.format === "heif" && metadata.compression === "av1" ? "avif" : metadata.format;
      if (!format || !formats.has(format) || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
      image.rotate();
      if (crop) {
        const { width, height } = metadata.autoOrient;
        const scale = Math.min(1, width / crop[0], height / crop[1]);
        image.resize({
          width: Math.max(1, Math.round(crop[0] * scale)),
          height: Math.max(1, Math.round(crop[1] * scale)),
          fit: "cover", position: "centre",
        });
      } else image.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true });
      const { data, info } = await image.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const id = randomUUID();
      images.push({
        data,
        record: {
          id, path: "images/" + id + ".webp",
          filename: file.name.split(/[/\\]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) || "Image",
          mime_type: "image/webp", size_bytes: info.size, width: info.width, height: info.height,
        },
      });
    }
  } catch { return go("/studio/media", "image-format"); }
  const uploaded: string[] = [];
  for (const { data, record } of images) {
    const { error } = await supabase.storage.from(bucket).upload(record.path, data, { contentType: record.mime_type });
    if (error) {
      if (uploaded.length) await supabase.storage.from(bucket).remove(uploaded);
      return go("/studio/media", "failed");
    }
    uploaded.push(record.path);
  }
  const { error } = await supabase.from("media_assets").insert(images.map(image => image.record));
  if (error) {
    await supabase.storage.from(bucket).remove(uploaded);
    return go("/studio/media", "failed");
  }
  go("/studio/media", "uploaded");
}

export async function deleteMedia(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = studioId.safeParse(form.get("id"));
  if (!id.success || form.get("confirm") !== "on") return go("/studio/media", "invalid");
  const { data, error } = await supabase.from("media_assets").update({ active: false }).eq("id", id.data)
    .select("path").maybeSingle();
  if (error || !data) return go("/studio/media", error?.code === "23503" ? "media-in-use" : "failed");
  const removed = await supabase.storage.from(bucket).remove([data.path]);
  if (removed.error) return go("/studio/media", "retry-delete");
  const metadata = await supabase.from("media_assets").delete().eq("id", id.data).eq("active", false);
  go("/studio/media", metadata.error ? "retry-delete" : "deleted");
}
