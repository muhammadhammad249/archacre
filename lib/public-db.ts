import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SiteContent = Record<string, unknown>;

export type PublicProject = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  location: string;
  completion_date: string | null;
  area: string;
  cover_image: string;
  gallery: string[];
  featured: boolean;
  sort_order: number;
  seo_title: string;
  seo_description: string;
};

const visibleFields = "id,slug,title,description,category,location,completion_date,area,cover_image,gallery,featured,sort_order,seo_title,seo_description";
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function publicDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? createClient(url, key, clientOptions) : null;
}

export function serviceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, clientOptions) : null;
}

export async function getWebsiteContent(database: SupabaseClient): Promise<SiteContent> {
  const { data, error } = await database.from("site_content").select("key,value").eq("is_published", true)
    .in("key", ["homepage", "about", "services", "portfolio", "testimonials", "blog", "team", "contact", "socials", "footer", "navigation", "seo", "categories"]);
  if (error) throw new Error("Website content is unavailable");
  return Object.fromEntries((data ?? []).map(({ key, value }) => [key, value]));
}

export async function getPublishedProjects(database: SupabaseClient, featuredOnly = false): Promise<PublicProject[]> {
  let query = database.from("projects").select(visibleFields).eq("status", "published")
    .order("sort_order").order("title").order("id");
  if (featuredOnly) query = query.eq("featured", true).limit(6);
  const { data, error } = await query;
  if (error) throw new Error("Published projects are unavailable");
  return data ?? [];
}

export async function getPublishedProject(database: SupabaseClient, slug: string): Promise<PublicProject | null> {
  const { data, error } = await database.from("projects").select(visibleFields)
    .eq("status", "published").eq("slug", slug).maybeSingle();
  if (error) throw new Error("Published project is unavailable");
  return data;
}
