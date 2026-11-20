import "server-only";

import type { CheerioAPI } from "cheerio";
import type { SiteContent } from "./public-db";
import { setPageMeta } from "./public-projects";

type Entry = Record<string, unknown>;
type BlogPost = { title: string; slug: string; summary: string; body: string };
const publicPage = /^\/(?:|(?:index|about|services|projects|team|contact|privacy|terms)\.html|blog|testimonials|(?:projects|blog)\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:#[a-z0-9_-]+)?$/i;
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';

function entry(value: unknown): Entry {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Entry : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function entries(section: unknown): Entry[] {
  const items = entry(section).items;
  return Array.isArray(items) ? items.map(entry) : [];
}

function hasManagedItems(section: unknown) {
  return Array.isArray(entry(section).items);
}

function replaceText($: CheerioAPI, selector: string, value: unknown) {
  const update = text(value);
  const target = $(selector);
  if (update && target.text().trim() !== update) target.text(update);
}

export function getCategoryNames(content: SiteContent) {
  return entries(content.categories).map(({ name }) => text(name)).filter(Boolean);
}

export function getBlogPosts(content: SiteContent): BlogPost[] {
  const posts = new Map<string, BlogPost>();
  for (const item of entries(content.blog)) {
    const slug = text(item.slug);
    const title = text(item.title);
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && title && !posts.has(slug)) {
      posts.set(slug, { slug, title, summary: text(item.summary), body: text(item.body) });
    }
  }
  return [...posts.values()];
}

function setStandardHero($: CheerioAPI, model: Entry) {
  replaceText($, ".page-hero h1", model.headline);
  replaceText($, ".page-hero .page-lede", model.intro);
}

function applyHome($: CheerioAPI, content: SiteContent) {
  const model = entry(content.homepage);
  const headline = text(model.headline);
  if (headline) {
    const heading = $(".hero h1").empty().css("overflow-wrap", "anywhere");
    for (const line of headline.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      heading.append($('<span class="l"></span>').append($("<span></span>").text(line)), " ");
    }
  }
  replaceText($, ".hero .kicker", model.eyebrow);
  replaceText($, ".hero .lede", model.intro);

  const section = testimonialSection($, content);
  if (section) $("main .cta").first().before(section);
}

function testimonialSection($: CheerioAPI, content: SiteContent) {
  const section = $('<section class="sec tint" id="testimonials"><div class="wrap"><div class="sec-head"><h2>Testimonials</h2></div><div class="why-grid"></div></div></section>');
  const grid = section.find(".why-grid");
  for (const { name, role, quote } of entries(content.testimonials)) {
    const author = text(name);
    const words = text(quote);
    if (!author || !words) continue;
    const card = $('<figure class="why-item" style="margin:0"></figure>');
    const attribution = [author, text(role)].filter(Boolean).join(" · ");
    card.append($('<blockquote style="margin:0"><p></p></blockquote>').find("p").text(words).end());
    card.append($('<figcaption style="margin-top:1rem;font-weight:600"></figcaption>').text(attribution));
    grid.append(card);
  }
  return grid.children().length ? section : null;
}

function serviceItems(content: SiteContent) {
  return entries(content.services).filter(({ title }) => text(title));
}

function applyServices($: CheerioAPI, content: SiteContent, page: string) {
  const model = entry(content.services);
  const list = serviceItems(content);
  if (page === "index.html") {
    const sub = $(".svc-list").closest("section");
    if (text(model.headline)) sub.find(".sec-head h2").text(text(model.headline));
    if (!hasManagedItems(model)) return;
    if (!list.length) {
      sub.remove();
      return;
    }
    const container = sub.find(".svc-list").empty();
    for (const [index, item] of list.entries()) {
      const row = $('<a class="svc rv"></a>').attr("href", `/services.html#s${index + 1}`);
      row.append($('<span class="svc-n"></span>').text(String(index + 1).padStart(2, "0")));
      row.append($("<h3></h3>").text(text(item.title)));
      row.append($("<p></p>").text(text(item.description)));
      row.append($('<span class="svc-arrow" aria-hidden="true"></span>').append(arrow));
      container.append(row);
    }
    return;
  }

  setStandardHero($, model);
  if (!hasManagedItems(model)) return;
  const oldRows = $(".svc-detail");
  if (!list.length) {
    oldRows.closest("section").remove();
    $(".page-hero .dim").remove();
    return;
  }
  const wrapper = oldRows.first().parent();
  oldRows.remove();
  if (!text(model.intro)) $(".page-hero .page-lede").text("Our services can be commissioned individually or as part of an integrated design and delivery package.");
  $(".page-hero .dim .label b").last().text(String(list.length).padStart(2, "0"));
  for (const [index, item] of list.entries()) {
    const row = $('<div class="svc-detail rv"></div>').attr("id", `s${index + 1}`);
    row.append($('<span class="sd-n"></span>').text(String(index + 1).padStart(2, "0")));
    const description = $("<div></div>").append($("<h3></h3>").text(text(item.title)), $("<p></p>").text(text(item.description)));
    const details = text(item.details).split(",").map((detail) => detail.trim()).filter(Boolean);
    if (details.length) {
      const detailList = $("<ul></ul>");
      for (const detail of details) detailList.append($("<li></li>").text(detail));
      description.append(detailList);
    }
    wrapper.append(row.append(description));
  }
}

function applyTeam($: CheerioAPI, content: SiteContent) {
  const model = entry(content.team);
  setStandardHero($, model);
  const people = entries(model).filter(({ name }) => text(name));
  if (!hasManagedItems(model)) return;
  const grids = $(".team-grid");
  const leadership = grids.first();
  const studio = grids.eq(1);
  const originalCards = new Map(grids.find(".t-card").toArray().map((node) => {
    const card = $(node);
    return [card.find("h3").text().trim(), card.clone()];
  }));
  grids.empty();
  for (const { name, role, bio, details } of people) {
    const card = originalCards.get(text(name)) || $('<div class="t-card rv"></div>');
    card.children("h3,.role,.bio,.t-cred").remove();
    card.append($("<h3></h3>").text(text(name)), $('<span class="role"></span>').text(text(role)));
    if (text(bio)) card.append($('<p class="bio"></p>').text(text(bio)));
    if (text(details)) card.append($('<span class="t-cred"></span>').text(text(details)));
    const isLeader = /^(?:principal|senior) architect$/i.test(text(role));
    (isLeader ? leadership : studio).append(card);
  }
  if (!leadership.children().length) leadership.closest("section").remove();
  if (!studio.children().length) studio.closest("section").remove();
}

function navigationLink(value: unknown) {
  const url = text(value);
  if (!url) return "";
  const path = url.startsWith("/") ? url : `/${url}`;
  return publicPage.test(path) ? path : "";
}

function pageKey(path: string) {
  const route = path.split("#")[0];
  if (route === "/") return "/index.html";
  if (route.startsWith("/projects/")) return "/projects.html";
  if (route.startsWith("/blog/")) return "/blog";
  return route;
}

function applyNavigation($: CheerioAPI, content: SiteContent, path: string) {
  const model = entries(content.navigation);
  const items = model.flatMap(({ href, label }) => {
    const link = navigationLink(href);
    const title = text(label);
    return link && title ? [{ link, title }] : [];
  });
  const customized = hasManagedItems(content.navigation);
  if (!customized && !getBlogPosts(content).length) return;
  const desktop = $(".site-head .nav");
  const mobile = $(".mobile-nav");
  const footer = $(".site-foot .foot-col").first();
  if (customized) {
    desktop.find(".navlink").remove();
    mobile.find(".m-link").remove();
    footer.find("a.fl").remove();
  } else {
    items.push({ link: "/blog", title: "Journal" });
  }

  for (const { link, title } of items) {
    const current = !link.includes("#") && pageKey(link) === pageKey(path);
    const nav = $('<a class="navlink"></a>').attr("href", link).text(title);
    const small = $('<a class="m-link"></a>').attr("href", link).text(title);
    if (current) {
      nav.attr("aria-current", "page");
      small.attr("aria-current", "page");
    }
    desktop.find(".socials").before(nav);
    mobile.find(".m-social").before(small);
    footer.append($('<a class="fl"></a>').attr("href", link).text(title));
  }
}

function socialLink(value: unknown, domains: string[]) {
  const update = text(value);
  if (!update) return "";
  try {
    const url = new URL(update);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port &&
        domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return url.href;
  } catch {
    // Leave the existing social link in place when the value is invalid.
  }
  return "";
}

function applyContactAndFooter($: CheerioAPI, content: SiteContent) {
  const contact = entry(content.contact);
  const socials = entry(content.socials);
  const footer = entry(content.footer);
  const address = text(contact.address);
  const phone = text(contact.phone);
  const dial = phone.replace(/[^\d+]/g, "");
  const email = text(contact.email);
  const validEmail = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
  const validPhone = /^\+?\d{5,18}$/.test(dial);

  if (address) {
    const element = $(".c-block address").empty();
    for (const [index, line] of address.split(/\r?\n/).entries()) {
      if (index) element.append("<br>");
      element.append($("<span></span>").text(line));
    }
    $(".foot-contact li").first().children("span").text(address.replace(/\s*\r?\n\s*/g, ", "));
  }
  if (validPhone) $('a[href^="tel:"]').each((_, link) => {
    const element = $(link);
    if (element.text().trim() !== phone) element.attr("href", `tel:${dial}`).text(phone);
  });
  if (validEmail) {
    $('a[href^="mailto:"]').each((_, link) => {
      const element = $(link).attr("href", `mailto:${email}`);
      if (!element.children().length) element.text(email);
    });
  }
  const schema = $('script[type="application/ld+json"]').first();
  if (schema.length && (validPhone || validEmail)) {
    const data = entry(JSON.parse(schema.text()));
    if (validPhone) data.telephone = dial;
    if (validEmail) data.email = email;
    schema.text(JSON.stringify(data).replaceAll("<", "\\u003c"));
  }
  const hours = text(contact.hours);
  if (hours && $(".c-block .map-note").length) {
    $(".c-block .map-note").text(hours);
    $(".page-hero .dim .label").text(hours);
  }
  const whatsapp = socialLink(socials.whatsapp, ["wa.me", "whatsapp.com"]);
  if (whatsapp) $('a[href^="https://wa.me/"],a[href^="https://api.whatsapp.com/"]').attr("href", whatsapp);
  const instagram = socialLink(socials.instagram, ["instagram.com"]);
  if (instagram) $('a[href^="https://www.instagram.com/"]').attr("href", instagram);
  const linkedin = socialLink(socials.linkedin, ["linkedin.com"]);
  if (linkedin) {
    $(".foot-soc").append($('<a class="icon-btn" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style="font-weight:700">in</a>')
      .attr("href", linkedin));
  }
  replaceText($, ".foot-brand > p", footer.description);
}

export function renderManagedContent($: CheerioAPI, content: SiteContent, page: string, path: string) {
  if (page === "index.html") {
    applyHome($, content);
    applyServices($, content, page);
    const seo = entry(content.seo);
    const title = text(seo.title);
    const description = text(seo.description);
    if (title || description) {
      setPageMeta($, title || $("title").text(), description || $('meta[name="description"]').attr("content") || "", "/");
    }
  }
  if (page === "about.html") {
    const about = entry(content.about);
    setStandardHero($, about);
    replaceText($, ".statement-grid .big", about.body);
    if (text(about.body)) $(".statement-grid .big").css("white-space", "pre-line");
  }
  if (page === "services.html") applyServices($, content, page);
  if (page === "team.html") applyTeam($, content);
  if (page === "projects.html") setStandardHero($, entry(content.portfolio));
  applyNavigation($, content, path);
  applyContactAndFooter($, content);
  if (hasManagedItems(content.services)) {
    const links = $(".foot-main .foot-col").eq(1);
    links.children("a.fl").remove();
    const select = $("#enquiry select[name=service]");
    select.find("option").not(":first-child,:last-child").remove();
    serviceItems(content).forEach(({ title }, index) => {
      const label = text(title);
      links.append($('<a class="fl"></a>').attr("href", `/services.html#s${index + 1}`).text(label));
      select.find("option:last-child").before($("<option></option>").text(label));
    });
  }
}

export function renderTestimonials($: CheerioAPI, content: SiteContent) {
  const section = testimonialSection($, content);
  if (!section) return false;
  const main = $("main");
  const hero = main.find(".page-hero");
  hero.find("h1").text("Testimonials");
  hero.find(".page-lede").text("What clients say about working with ARCH ACRE.");
  hero.find(".crumbs").empty().append($('<a href="/">Home</a>'), $('<span class="sep">/</span>'), $("<span>Testimonials</span>"));
  hero.find(".dim").remove();
  main.children().not(".page-hero").remove();
  main.append(section);
  setPageMeta($, "Testimonials — ARCH ACRE", "Read testimonials from ARCH ACRE clients.", "/testimonials");
  return true;
}

export function renderBlog($: CheerioAPI, posts: BlogPost[], post?: BlogPost) {
  const headline = post?.title || "Journal";
  const intro = post?.summary || "Notes on design, architecture and the work of the studio.";
  const main = $("main");
  const hero = main.find(".page-hero");
  hero.find("h1").text(headline).css("overflow-wrap", "anywhere");
  hero.find(".page-lede").text(intro);
  hero.find(".crumbs").empty().append($('<a href="/">Home</a>'), $('<span class="sep">/</span>'),
    post ? $('<a href="/blog">Journal</a>') : $("<span>Journal</span>"));
  hero.find(".dim").remove();
  main.children().not(".page-hero").remove();
  const section = $('<section class="sec" style="padding-top:0"><div class="wrap"></div></section>');
  const body = section.find(".wrap");
  if (post) {
    for (const paragraph of (post.body || post.summary).split(/\n\s*\n/).filter(Boolean)) {
      body.append($('<p style="max-width:72ch;margin-bottom:1rem;white-space:pre-line"></p>').text(paragraph));
    }
  } else {
    const grid = $('<div class="pj-grid"></div>');
    for (const item of posts) {
      const card = $('<article class="pj-card"><div class="pj-body"></div></article>');
      card.find(".pj-body").append($("<h3></h3>").text(item.title), $("<p></p>").text(item.summary),
        $('<a class="link-arrow">Read article</a>').attr("href", `/blog/${item.slug}`));
      grid.append(card);
    }
    body.append(grid);
  }
  main.append(section);
  setPageMeta($, `${headline} — ARCH ACRE`, intro, post ? `/blog/${post.slug}` : "/blog");
}
