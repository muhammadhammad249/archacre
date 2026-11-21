import type { ReactNode } from "react";

const messages: Record<string, string> = {
  saved: "Changes saved.", deleted: "Item deleted.", uploaded: "Images added to the library.",
  invalid: "Check the fields and try again.", failed: "The request could not be completed. Try again.",
  "duplicate-slug": "Another project is already using this URL slug.",
  "image-size": "Select up to eight images totalling 3.9 MB or less.",
  "image-format": "Use still JPG, PNG, WebP or AVIF images under 32 megapixels.",
  "media-in-use": "Remove this image from the projects or pages that use it before deleting.",
  "mail-processed": "Checked the email queue. Each inquiry shows its notification status.",
  "mail-unavailable": "Email notifications are temporarily unavailable. Inquiries remain in the inbox.",
  "retry-delete": "This image is hidden. Retry deletion to finish removing the file.",
  "password-updated": "Password updated.",
  "password-invalid": "Enter matching passwords with at least 12 characters and try again.",
};

export function Notice({ code }: { code?: string }) {
  if (!code || !Object.hasOwn(messages, code)) return null;
  const ok = ["saved", "deleted", "uploaded", "password-updated", "mail-processed"].includes(code);
  return <p role={ok ? "status" : "alert"} className={"notice" + (ok ? "" : " error")}>{messages[code]}</p>;
}

export function Heading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="studio-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {children && <div className="studio-actions">{children}</div>}
  </header>;
}

export function Status({ value }: { value: string }) {
  return <span className={"studio-badge " + (value === "published" || value === "new" ? "studio-badge-active" : "")}>
    {value.replaceAll("_", " ")}
  </span>;
}

export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(date));
}
