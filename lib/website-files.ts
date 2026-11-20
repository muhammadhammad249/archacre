import "server-only";
import { readFile } from "node:fs/promises";
const pages = {
  "index.html": () => readFile("index.html", "utf8"),
  "about.html": () => readFile("about.html", "utf8"),
  "projects.html": () => readFile("projects.html", "utf8"),
  "services.html": () => readFile("services.html", "utf8"),
  "team.html": () => readFile("team.html", "utf8"),
  "contact.html": () => readFile("contact.html", "utf8"),
  "terms.html": () => readFile("terms.html", "utf8"),
  "privacy.html": () => readFile("privacy.html", "utf8"),
};
export type WebsitePage = keyof typeof pages;

export function isWebsitePage(path: string): path is WebsitePage {
  return Object.hasOwn(pages, path);
}

export function readWebsitePage(page: WebsitePage) {
  return pages[page]();
}
