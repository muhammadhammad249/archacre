"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const entries = [
  ["/studio", "Dashboard"], ["/studio/projects", "Projects"], ["/studio/content/services", "Services"],
  ["/studio/content/categories", "Categories"], ["/studio/media", "Media library"], ["/studio/inquiries", "Inquiries"],
  ["/studio/content/testimonials", "Testimonials"], ["/studio/content/blog", "Blog"], ["/studio/content/team", "Team"],
  ["/studio/content/homepage", "Website settings"], ["/studio/content/seo", "SEO settings"], ["/studio/profile", "Admin profile"],
] as const;

const settings = ["/studio/content/about", "/studio/content/portfolio", "/studio/content/contact", "/studio/content/socials", "/studio/content/footer", "/studio/content/navigation"];
export function StudioNav({ newInquiries }: { newInquiries: number }) {
  const pathname = usePathname();
  return <nav className="studio-nav" aria-label="Administration">
    {entries.map(([href, label]) => {
      const active = pathname === href || (href !== "/studio" && pathname.startsWith(href + "/")) ||
        (href === "/studio/content/homepage" && settings.includes(pathname));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined}>
        {label}
        {href === "/studio/inquiries" && newInquiries > 0 &&
          <span className="studio-nav-count" aria-label={newInquiries + " new inquiries"}>{newInquiries}</span>}
      </Link>;
    })}
  </nav>;
}
