import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { extname, resolve } from "node:path";
import { load, type CheerioAPI } from "cheerio";
import { after } from "next/server";
import { getBlogPosts, getCategoryNames, renderBlog, renderManagedContent, renderTestimonials } from "@/lib/public-cms";
import { getPublishedProject, getPublishedProjects, getWebsiteContent, publicDatabase, serviceDatabase } from "@/lib/public-db";
import { inquiryMailConfig } from "@/lib/inquiry-mail";
import { renderFeaturedProjects, renderProjectDetail, renderProjectList } from "@/lib/public-projects";
import { readRateLimitSecret } from "@/lib/studio-auth-config";
import { isWebsitePage, readWebsitePage } from "@/lib/website-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assetTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function plain(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function asset(file: string) {
  const type = assetTypes[extname(file).toLowerCase()];
  if (!type || !/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(file)) return plain("Not found", 404);
  try {
    const body = await readFile(resolve(process.cwd(), "assets", file));
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(body.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return plain("Not found", 404);
  }
}

function html(body: string, scriptHashes: string[]) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": [
        "default-src 'self'",
        ["script-src 'self'", ...scriptHashes].join(" "),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}

function makeRelativeLinksRooted($: CheerioAPI) {
  for (const attribute of ["href", "src"] as const) {
    $(`[${attribute}]`).each((_, element) => {
      const target = $(element);
      const value = target.attr(attribute) || "";
      if (value.startsWith("assets/") || isWebsitePage(value.split(/[?#]/)[0])) target.attr(attribute, "/" + value);
    });
  }
}

function prepareInquiryForm($: CheerioAPI, request: Request, available: boolean) {
  const params = new URL(request.url).searchParams;
  const form = $("#enquiry").attr("action", "/api/inquiries");
  const contact = $('.c-block a[href^="mailto:"]').first();
  const email = contact.text().trim();
  if (email) form.attr("data-contact-email", email);
  form.prepend($('<input type="hidden" name="submission_id">').val(randomUUID()));
  $("#phone").removeAttr("required").attr("maxlength", "32");
  $('label[for="phone"]').text("Phone / WhatsApp");
  $("#name").attr("maxlength", "120");
  $("#email").attr("maxlength", "240");
  $("#city").attr("maxlength", "160");
  $("#message").attr("maxlength", "6000");
  $(".form-card .fc-sub").text("Fields marked * are required. Provide an email address or phone number.");
  const kind = params.get("kind");
  const project = (params.get("project") ?? "").trim().slice(0, 140);
  const select = $('<select id="inquiry-kind" name="kind"></select>');
  for (const [value, label] of [["inquiry", "General inquiry"], ["project", "Project inquiry"], ["quote", "Quote request"]]) {
    const option = $("<option></option>").attr("value", value).text(label);
    if (kind === value || (!kind && value === "project")) option.attr("selected", "");
    select.append(option);
  }
  form.find(".f-grid").prepend($('<div class="f-field full"><label for="inquiry-kind">Inquiry type</label></div>').append(select));
  if (project && kind === "project") {
    form.prepend($('<input type="hidden" name="project">').attr("value", project));
    $(".form-card h3").text(`Inquiry about ${project}`);
  }
  const status = $("#formStatus");
  const result = params.get("result");
  if (!available) form.find('button[type="submit"]').attr("disabled", "");
  if (!available || result === "unavailable") {
    status.addClass("err").text("The online form is temporarily unavailable.");
    if (email) status.append(" Email us directly at ", contact.clone(), ".");
  } else if (result === "sent") {
    status.addClass("ok").text("Thank you. Your inquiry has been received.");
  } else if (result === "busy") {
    status.addClass("err").text("The inquiry inbox is busy. Try again in a few minutes.");
  } else if (result === "error") {
    status.addClass("err").text("Check the required fields and provide a valid email address or phone number.");
  }
}

function updatePrivacyPolicy($: CheerioAPI, notifications: boolean) {
  const delivery = notifications ? " We may also send an email notification to the studio." : "";
  $("#p4").next("p").text(`We store website inquiries in the studio's private inbox so we can respond to your message.${delivery} Please send sensitive ownership documents only after making contact with us.`);
  $("#p6").next("p").text("We use aggregate page counts to understand how the site is used. The counts do not include browsing identifiers or use advertising cookies. They respect the browser’s Do Not Track and Global Privacy Control settings.");
}

function trackPageView(request: Request, database: NonNullable<ReturnType<typeof serviceDatabase>>, path: string) {
  if (
    request.method !== "GET" ||
    request.headers.get("dnt") === "1" ||
    request.headers.get("sec-gpc") === "1" ||
    request.headers.get("sec-purpose")?.includes("prefetch") ||
    request.headers.get("purpose") === "prefetch"
  ) return;
  after(async () => {
    try {
      const { error } = await database.rpc("record_studio_page_view", { p_path: path });
      if (error) console.warn("Could not increment website page count");
    } catch {
      console.warn("Could not increment website page count");
    }
  });
}

const temporarilyUnavailable = () => plain("This page is temporarily unavailable. Please try again shortly.", 503);

export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const parts = (await params).path ?? [];
  if (parts.length === 2 && parts[0] === "assets") return asset(parts[1]);

  const page = parts.length === 0 ? "index.html" : parts.length === 1 && isWebsitePage(parts[0]) ? parts[0] : "";
  const projectSlug = parts.length === 2 && parts[0] === "projects" && slugPattern.test(parts[1]) ? parts[1] : "";
  const blog = parts[0] === "blog" && (parts.length === 1 || (parts.length === 2 && slugPattern.test(parts[1])));
  const testimonials = parts.length === 1 && parts[0] === "testimonials";
  if (!page && !projectSlug && !blog && !testimonials) return plain("Not found", 404);

  try {
    const source = await readWebsitePage(page || "projects.html");
    const database = publicDatabase();
    const admin = serviceDatabase();
    if (!database && !page) return plain("Not found", 404);
    const $ = load(source);
    const scriptHashes = $("script:not([src])").toArray().map(element =>
      `'sha256-${createHash("sha256").update($(element).html() ?? "").digest("base64")}'`,
    );

    if (database) {
      const [site, projects, project] = await Promise.all([
        getWebsiteContent(database).catch(() => {
          console.warn("Could not load managed website content");
          return null;
        }),
        page === "projects.html" || page === "index.html"
          ? getPublishedProjects(database, page === "index.html").catch(() => {
            console.warn("Could not load published projects");
            return null;
          })
          : null,
        projectSlug ? getPublishedProject(database, projectSlug) : null,
      ]);

      if (projectSlug) {
        if (!project) return plain("Not found", 404);
        renderProjectDetail($, project);
      } else if (blog) {
        if (!site) return temporarilyUnavailable();
        const posts = getBlogPosts(site);
        const post = posts.find(({ slug }) => slug === parts[1]);
        if (!posts.length || (parts.length === 2 && !post)) return plain("Not found", 404);
        renderBlog($, posts, post);
      } else if (testimonials) {
        if (!site) return temporarilyUnavailable();
        if (!renderTestimonials($, site)) return plain("Not found", 404);
      } else if (page === "projects.html") {
        renderProjectList($, projects ?? [], getCategoryNames(site ?? {}));
        if (!projects) $("#pjGrid").before('<p class="pj-status" role="status">Some projects are temporarily unavailable. Please try again shortly.</p>');
      } else if (page === "index.html") {
        renderFeaturedProjects($, projects ?? []);
      }

      const path = parts.length === 0 || page === "index.html" ? "/" : `/${parts.join("/")}`;
      if (site) renderManagedContent($, site, page, path);
      if (admin) {
        if (page === "privacy.html") updatePrivacyPolicy($, Boolean(inquiryMailConfig()));
        trackPageView(request, admin, path);
      }
    }
    if (page === "contact.html") prepareInquiryForm($, request, Boolean(admin && readRateLimitSecret()));
    if (projectSlug || blog) makeRelativeLinksRooted($);
    return html($.html(), scriptHashes);
  } catch {
    console.warn("Could not render a public website route");
    return temporarilyUnavailable();
  }
}
