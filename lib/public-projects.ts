import "server-only";

import type { CheerioAPI } from "cheerio";
import type { PublicProject } from "./public-db";

const folderImage = /^\/?assets\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp|avif|gif|svg)$/i;
const uploadedImage = /^\/media\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function imagePath(value: string) {
  if (uploadedImage.test(value)) return value;
  if (folderImage.test(value)) return value.startsWith("/") ? value : `/${value}`;
  return "";
}

export function siteOrigin() {
  try {
    const url = new URL(process.env.SITE_URL ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // An unset SITE_URL uses the existing public site's canonical domain.
  }
  return "https://archacre.com";
}

export function setPageMeta($: CheerioAPI, title: string, description: string, path?: string, image?: string) {
  $("title").text(title);
  $('meta[property="og:title"]').attr("content", title);
  $('meta[name="description"],meta[property="og:description"]').attr("content", description);
  if (path) {
    const canonical = new URL(path, siteOrigin()).href;
    $('link[rel="canonical"]').attr("href", canonical);
    $('meta[property="og:url"]').attr("content", canonical);
  }
  if (image) {
    const element = $("<meta>").attr({ property: "og:image", content: new URL(image, siteOrigin()).href });
    $('meta[property="og:image"]').remove();
    $("head").append(element);
  }
}

export function projectPath(project: PublicProject) {
  return `/projects/${encodeURIComponent(project.slug)}`;
}

export function renderProjectList($: CheerioAPI, projects: PublicProject[], categoryNames: string[]) {
  const grid = $("#pjGrid");
  const placeholders = new Map(grid.find(".pj-card").toArray().map((node) => {
    const card = $(node);
    return [card.find("h3").text().trim(), card.find(".pj-media").clone()];
  }));
  const defaultPlaceholder = grid.find(".pj-media").first().clone();
  grid.empty();
  const buttons = $(".pj-filter").empty();
  if (!projects.length) {
    buttons.remove();
    $("#pjEmpty").text("No projects are published yet.").css("display", "block");
    return;
  }

  const categories = new Map<string, { name: string; id: string }>();
  for (const name of [...categoryNames, ...projects.map((project) => project.category)]) {
    const key = name.trim().toLocaleLowerCase("en");
    if (key && !categories.has(key)) categories.set(key, { name, id: `category-${categories.size + 1}` });
  }
  buttons.append($('<button type="button" class="pf-btn active" data-f="all">All</button>'));
  for (const { name, id } of categories.values()) {
    buttons.append($('<button type="button" class="pf-btn"></button>').attr("data-f", id).text(name));
  }

  for (const [index, project] of projects.entries()) {
    const category = categories.get(project.category.trim().toLocaleLowerCase("en"));
    const article = $('<article class="pj-card rv"></article>').attr("data-cat", category?.id || "uncategorized");
    const image = imagePath(project.cover_image || "");
    const media = image
      ? $('<div class="pj-media" aria-hidden="true"></div>')
      : (placeholders.get(project.title) || defaultPlaceholder).clone();
    if (image) {
      media.append($('<img alt="" loading="lazy" decoding="async">').attr("src", image));
    }
    const body = $('<div class="pj-body"></div>');
    body.append($('<span class="idx"></span>').text(`A—${String(index + 1).padStart(2, "0")} · ${project.category}`));
    body.append($("<h3></h3>").text(project.title));
    if (project.location) body.append($('<span class="meta"></span>').text(project.location));
    if (project.description) body.append($("<p></p>").text(project.description));
    body.append($('<a class="link-arrow">View project</a>').attr("href", projectPath(project)));
    grid.append(article.append(media, body));
  }
}

export function renderFeaturedProjects($: CheerioAPI, projects: PublicProject[]) {
  const rows = $("main .rows").empty();
  if (!projects.length) {
    rows.closest("section").remove();
    return;
  }
  for (const [index, project] of projects.entries()) {
    const row = $('<a class="row rv"></a>').attr("href", projectPath(project));
    row.append($('<span class="idx"></span>').text(`A—${String(index + 1).padStart(2, "0")}`));
    row.append($('<span class="name"></span>').text(project.title));
    row.append($('<span class="meta"></span>').text(project.location || project.category));
    row.append($('<span class="tag"></span>').text(project.category));
    rows.append(row);
  }
  rows.siblings(".work-note").children("span").remove();
}

export function renderProjectDetail($: CheerioAPI, project: PublicProject) {
  const cover = imagePath(project.cover_image || "");
  const gallery = Array.from(new Set((project.gallery ?? []).map(imagePath).filter((path) => path && path !== cover)));
  const hero = $("main .page-hero");
  hero.find("h1").text(project.title).css("overflow-wrap", "anywhere");
  hero.find(".crumbs").empty()
    .append($('<a href="/projects.html">Projects</a>'), $('<span class="sep">/</span>'), $("<span></span>").text(project.category));
  hero.find(".dim").remove();
  const facts = [project.location, project.area, project.completion_date].filter(Boolean);
  if (facts.length) hero.find(".page-lede").text(facts.join(" · "));
  else hero.find(".page-lede").remove();
  const section = $('<section class="sec" style="padding-top:0"><div class="wrap"></div></section>');
  const body = section.find(".wrap");
  if (cover) {
    body.append($('<img decoding="async" fetchpriority="high" style="display:block;width:100%;max-height:75vh;object-fit:cover;margin-bottom:2rem">')
      .attr({ src: cover, alt: project.title }));
  }
  for (const paragraph of (project.description || "").split(/\n\s*\n/).filter(Boolean)) {
    body.append($('<p style="max-width:72ch;font-size:clamp(1rem,2vw,1.25rem);line-height:1.65;white-space:pre-line"></p>').text(paragraph));
  }
  if (gallery.length) {
    body.append($('<h2 style="margin-top:3rem">Project gallery</h2>'));
    const images = $('<div class="pj-grid"></div>');
    for (const [index, image] of gallery.entries()) {
      const alt = `${project.title}, image ${index + 1}`;
      images.append($("<a></a>").attr("href", image).append(
        $('<img loading="lazy" decoding="async" style="display:block;width:100%;height:auto">').attr({ src: image, alt }),
      ));
    }
    body.append(images);
  }
  const inquiryLink = `/contact.html?${new URLSearchParams({ kind: "project", project: project.title })}#enquiry`;
  body.append($('<a class="btn" style="margin-top:2rem">Ask about this project</a>').attr("href", inquiryLink));
  $("main").children().not(".page-hero").remove();
  $("main").append(section);
  setPageMeta($, project.seo_title || `${project.title} — ARCH ACRE`, project.seo_description || project.description.slice(0, 155), projectPath(project), cover);
}
