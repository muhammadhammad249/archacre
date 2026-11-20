import "server-only";
import { load } from "cheerio";
import type { CmsSection, CmsValue } from "./studio-model";
import { readWebsitePage, type WebsitePage } from "./website-files";

const sourcePages: Partial<Record<CmsSection, WebsitePage>> = {
  homepage: "index.html", about: "about.html", services: "services.html", portfolio: "projects.html",
  team: "team.html", contact: "contact.html", socials: "index.html", footer: "index.html",
  navigation: "index.html", seo: "index.html",
};

export async function defaultContent(key: CmsSection): Promise<CmsValue> {
  const page = sourcePages[key];
  if (!page) return { items: [] };
  const $ = load(await readWebsitePage(page));
  const text = (selector: string) => $(selector).first().text().trim();
  const heading = { headline: text(".page-title"), intro: text(".page-lede") };
  const socialLink = (host: string) => $(".site-head a").filter((_, node) => ($(node).attr("href") ?? "").includes(host)).first().attr("href") ?? "";
  switch (key) {
    case "homepage":
      return {
        headline: $(".hero h1 .l").map((_, node) => $(node).text().trim()).get().join("\n"),
        eyebrow: text(".hero .kicker"), intro: text(".hero .lede"),
      };
    case "about":
      return { ...heading, body: text(".statement-grid .big") };
    case "services":
      return { ...heading, items: $(".svc-detail").map((_, node) => ({
        title: $(node).find("h3").text().trim(),
        description: $(node).find("p").text().trim(),
        details: $(node).find("li").map((_, item) => $(item).text().trim()).get().join(", "),
      })).get() };
    case "portfolio":
      return heading;
    case "team":
      return { ...heading, items: $(".t-card").map((_, node) => ({
        name: $(node).find("h3").text().trim(), role: $(node).find(".role").text().trim(),
        bio: $(node).find(".bio").text().trim(), details: $(node).find(".t-cred").text().trim(),
      })).get() };
    case "contact": {
      const address = $(".c-block address").first();
      address.find("br").replaceWith("\n");
      return { email: $("a[href^='mailto:']").first().attr("href")?.slice(7) ?? "",
        phone: $("a[href^='tel:']").first().text().trim(), address: address.text().trim(),
        hours: text(".map-note") };
    }
    case "socials":
      return { instagram: socialLink("instagram.com"), whatsapp: socialLink("wa.me"), linkedin: socialLink("linkedin.com") };
    case "footer":
      return { description: text(".foot-brand p") };
    case "navigation":
      return { items: $(".site-head .navlink").map((_, node) => ({
        label: $(node).text().trim(),
        href: "/" + ($(node).attr("href") ?? "").replace(/^\.?\//, ""),
      })).get() };
    case "seo":
      return { title: text("title"), description: $("meta[name=description]").attr("content") ?? "" };
    default:
      return { items: [] };
  }
}
