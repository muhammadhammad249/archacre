import { z } from "zod";

export const studioId = z.uuid();
export const projectStatuses = ["draft", "published"] as const;
export const inquiryStatuses = ["new", "in_progress", "replied", "closed"] as const;
export const inquiryKinds = ["inquiry", "project", "quote"] as const;
export const websitePages = ["/", "/index.html", "/about.html", "/projects.html", "/services.html", "/team.html", "/contact.html", "/blog", "/testimonials", "/privacy.html", "/terms.html"];

const text = (limit: number) => z.string().trim().max(limit);
export const projectImage = z.string().regex(/^\/(?:media\/[0-9a-f-]{36}|assets\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp|avif))$/i);
export const projectInput = z.object({
  title: text(160).min(1),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: text(12000).min(1),
  category: text(80).min(1),
  location: text(180),
  completion_date: z.union([z.iso.date(), z.literal("")]).transform(value => value || null),
  area: text(80),
  cover_image: z.union([projectImage, z.literal("")]),
  gallery: z.array(projectImage).max(24).transform(images => [...new Set(images)]),
  featured: z.boolean(),
  sort_order: z.number().int().min(0).max(100000),
  seo_title: text(100),
  seo_description: text(280),
  status: z.enum(projectStatuses),
});

export type Project = z.output<typeof projectInput> & { id: string; created_at: string; updated_at: string };
export type Media = {
  id: string; path: string; filename: string; mime_type: string;
  size_bytes: number; width: number; height: number; active: boolean; created_at: string;
};
export type Inquiry = {
  id: string; name: string; phone: string; email: string | null; service: string | null;
  city: string | null; message: string; kind: typeof inquiryKinds[number];
  status: typeof inquiryStatuses[number]; created_at: string;
};

type Field = {
  key: string;
  label: string;
  limit: number;
  multiline?: boolean;
  required?: boolean;
  format?: "email" | "phone" | "url" | "navigation" | "slug";
};
type Section = { title: string; fields?: Field[]; items?: { label: string; fields: Field[] } };
const field = (key: string, label: string, limit: number, options?: Partial<Field>): Field =>
  ({ key, label, limit, ...options });
const heading = field("headline", "Heading", 180);
const intro = field("intro", "Introduction", 1800, { multiline: true });

export const cmsSections = {
  homepage: { title: "Homepage", fields: [
    field("headline", "Hero headline", 130, { multiline: true }),
    field("eyebrow", "Text above headline", 160),
    intro,
  ] },
  about: { title: "About us", fields: [heading, intro, field("body", "About text", 10000, { multiline: true })] },
  services: { title: "Services", fields: [heading, intro], items: { label: "service", fields: [
    field("title", "Title", 120, { required: true }), field("description", "Description", 1500, { multiline: true }),
    field("details", "Details, separated by commas", 350),
  ] } },
  portfolio: { title: "Portfolio", fields: [heading, intro] },
  testimonials: { title: "Testimonials", items: { label: "testimonial", fields: [
    field("name", "Name", 120, { required: true }), field("role", "Role or company", 120),
    field("quote", "Quote", 1800, { multiline: true, required: true }),
  ] } },
  blog: { title: "Blog", items: { label: "post", fields: [
    field("title", "Title", 160, { required: true }), field("slug", "URL slug", 95, { format: "slug", required: true }),
    field("summary", "Summary", 450, { multiline: true }), field("body", "Post", 18000, { multiline: true, required: true }),
  ] } },
  team: { title: "Team", fields: [heading, intro], items: { label: "team member", fields: [
    field("name", "Name", 120, { required: true }), field("role", "Role", 100, { required: true }),
    field("bio", "Bio", 1800, { multiline: true }), field("details", "Specialties", 240),
  ] } },
  contact: { title: "Contact details", fields: [
    field("email", "Email", 254, { format: "email" }), field("phone", "Phone", 80, { format: "phone" }),
    field("address", "Address", 400, { multiline: true }), field("hours", "Opening hours", 250),
  ] },
  socials: { title: "Social links", fields: [
    field("instagram", "Instagram URL", 600, { format: "url" }), field("whatsapp", "WhatsApp URL", 600, { format: "url" }),
    field("linkedin", "LinkedIn URL", 600, { format: "url" }),
  ] },
  footer: { title: "Footer", fields: [field("description", "Studio description", 750, { multiline: true })] },
  navigation: { title: "Navigation", items: { label: "link", fields: [
    field("label", "Label", 55, { required: true }),
    field("href", "Destination", 100, { format: "navigation", required: true }),
  ] } },
  seo: { title: "Website SEO", fields: [field("title", "Site title", 100), field("description", "Site description", 280, { multiline: true })] },
  categories: { title: "Categories", items: { label: "category", fields: [field("name", "Name", 80, { required: true })] } },
} satisfies Record<string, Section>;

export type CmsSection = keyof typeof cmsSections;
export type ContentItem = Record<string, string>;
export type CmsValue = Record<string, string | ContentItem[]>;

export function isCmsSection(key: string): key is CmsSection {
  return Object.hasOwn(cmsSections, key);
}

export function sectionDefinition(key: CmsSection): Section {
  return cmsSections[key];
}

function fieldSchema(definition: Field) {
  return text(definition.limit).superRefine((value, context) => {
    if (!value && !definition.required) return;
    let valid = Boolean(value);
    if (definition.format === "email") valid = z.email().safeParse(value).success;
    if (definition.format === "phone") valid = /^\+?\d{5,18}$/.test(value.replace(/[\s().-]/g, ""));
    if (definition.format === "slug") valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
    if (definition.format === "navigation") valid = websitePages.includes(value);
    if (definition.format === "url") {
      const url = URL.canParse(value) ? new URL(value) : null;
      const domains: Record<string, string[]> = { instagram: ["instagram.com"], whatsapp: ["wa.me", "whatsapp.com"], linkedin: ["linkedin.com"] };
      valid = Boolean(url && url.protocol === "https:" && !url.username && !url.password && !url.port &&
        domains[definition.key]?.some(domain => url.hostname === domain || url.hostname.endsWith("." + domain)));
    }
    if (!valid) context.addIssue({ code: "custom", message: definition.label + " is invalid." });
  });
}

export function parseContent(key: CmsSection, value: unknown) {
  const { fields, items } = sectionDefinition(key);
  const shape = Object.fromEntries((fields ?? []).map(definition => [definition.key, fieldSchema(definition)]));
  const row = items && z.object(Object.fromEntries(items.fields.map(definition => [definition.key, fieldSchema(definition)])));
  const schema = z.object({ ...shape, ...(row && { items: z.array(row).max(50) }) });
  const result = schema.safeParse(value);
  if (!result.success) return null;
  const parsed = result.data as CmsValue;
  if (Array.isArray(parsed.items)) {
    const unique = key === "blog" ? "slug" : key === "categories" ? "name" : key === "navigation" ? "href" : null;
    if (unique && new Set(parsed.items.map(entry => entry[unique].toLowerCase())).size !== parsed.items.length) return null;
  }
  if (JSON.stringify(parsed).length > 120000) return null;
  return parsed;
}

export function slugFor(title: string) {
  return title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/, "");
}
