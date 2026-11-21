import Link from "next/link";
import { checked, readRows } from "@/lib/studio-data";
import { defaultContent } from "@/lib/studio-defaults";
import { cmsSections, inquiryKinds, inquiryStatuses, type CmsSection, type CmsValue, type Inquiry, type Media } from "@/lib/studio-model";
import { changePassword } from "../auth-actions";
import { changeInquiryStatus, deleteMedia, processInquiryEmail } from "./actions";
import { inquiryMailConfig } from "@/lib/inquiry-mail";
import { ContentEditor } from "./content-editor";
import { MediaUpload } from "./media-upload";
import { queryValue, type Query, type StudioClient } from "./types";
import { Heading, Notice, Status, dateLabel } from "./ui";

export async function Overview({ db }: { db: StudioClient }) {
  const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const result = await Promise.all([
    db.from("projects").select("id", { count: "exact", head: true }),
    db.from("projects").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("projects").select("id", { count: "exact", head: true }).eq("status", "draft"),
    db.from("inquiries").select("id", { count: "exact", head: true }),
    db.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("projects").select("id,title,status,updated_at").order("updated_at", { ascending: false }).limit(5),
    db.from("audit_events").select("id,table_name,operation,created_at").order("created_at", { ascending: false }).limit(8),
    readRows<{ path: string; views: number }>((start, end) => db.from("analytics_daily").select("path,views")
      .gte("day", since).order("day").order("path").range(start, end)),
  ]);
  const counts = result.slice(0, 5) as typeof result[0][];
  counts.forEach(checked);
  const projects = checked(result[5]) ?? [];
  const activity = checked(result[6]) ?? [];
  const traffic = new Map<string, number>();
  for (const event of result[7]) traffic.set(event.path, (traffic.get(event.path) ?? 0) + Number(event.views));
  const pageViews = [...traffic.values()].reduce((total, count) => total + count, 0);
  const topPages = [...traffic].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const labels = ["Total projects", "Published", "Drafts", "Total inquiries", "New inquiries"];
  return <>
    <Heading title="Dashboard" description="Projects, inquiries and recent studio activity.">
      <Link className="primary" href="/studio/projects/new">Add project</Link>
      <Link className="button" href="/studio/inquiries">View inquiries</Link>
    </Heading>
    <section className="studio-grid" aria-label="Overview">
      {counts.map((count, index) => <div className="studio-metric" key={labels[index]}>
        <strong>{count.count ?? 0}</strong><span>{labels[index]}</span>
      </div>)}
    </section>
    <div className="studio-split">
      <section className="studio-panel">
        <h2>Recent projects</h2>
        {projects.length ? <ul className="studio-list">
          {projects.map(project => <li key={project.id} className="studio-inline">
            <Link className="studio-link" href={"/studio/projects/" + project.id}>{project.title}</Link>
            <Status value={project.status} /><time className="studio-muted" dateTime={project.updated_at}>{dateLabel(project.updated_at)}</time>
          </li>)}
        </ul> : <p>No projects yet.</p>}
      </section>
      <section className="studio-panel">
        <h2>Recent activity</h2>
        {activity.length ? <ul className="studio-list">
          {activity.map(event => <li key={event.id}>
            {event.operation === "INSERT" ? "Added" : event.operation === "DELETE" ? "Deleted" : "Updated"}{" "}
            {event.table_name.replaceAll("_", " ")}
            <time className="studio-muted" dateTime={event.created_at}> · {dateLabel(event.created_at)}</time>
          </li>)}
        </ul> : <p>No activity yet.</p>}
      </section>
    </div>
    <section className="studio-panel">
      <h2>Website analytics</h2>
      <p className="studio-muted">{pageViews.toLocaleString()} page views over the last 30 days</p>
      {topPages.length > 0 && <ul className="studio-list">{topPages.map(([path, views]) =>
        <li key={path} className="studio-inline"><span>{path}</span><meter value={views} max={topPages[0][1]} aria-label={path + " page views"} /> {views}</li>
      )}</ul>}
    </section>
  </>;
}

export async function ContentView({ db, section, notice }: { db: StudioClient; section: CmsSection; notice?: string }) {
  const result = checked(await db.from("site_content").select("value").eq("key", section).maybeSingle());
  const defaults = await defaultContent(section);
  const initial = { ...defaults, ...(result?.value as CmsValue | undefined) };
  return <>
    <Heading title={cmsSections[section].title} description={section === "categories" ? "Manage the categories available in the project editor." : "Changes appear on the public website when saved."} />
    <nav className="studio-content-links" aria-label="Website content">
      {Object.entries(cmsSections).map(([key, definition]) => <Link key={key} href={"/studio/content/" + key}
        aria-current={key === section ? "page" : undefined}>{definition.title}</Link>)}
    </nav>
    <Notice code={notice} />
    <section className="studio-panel"><ContentEditor key={section} section={section} defaultValue={initial} /></section>
  </>;
}

export async function MediaView({ db, notice }: { db: StudioClient; notice?: string }) {
  const assets = await readRows<Media>((start, end) => db.from("media_assets").select("*")
    .order("created_at", { ascending: false }).order("id").range(start, end));
  return <>
    <Heading title="Media library" description="Upload and manage project images." />
    <Notice code={notice} />
    <section className="studio-panel"><h2>Upload images</h2><MediaUpload /></section>
    <section className="studio-panel">
      <h2>Library</h2>
      {assets.length ? <div className="studio-preview">
        {assets.map(asset => <article className="studio-imagecard" key={asset.id}>
          {asset.active && <img src={"/media/" + asset.id} alt={asset.filename} loading="lazy" />}
          <strong>{asset.filename}</strong>
          <p className="studio-muted">{asset.width} × {asset.height} · {Math.ceil(asset.size_bytes / 1024)} KB</p>
          {!asset.active && <p className="studio-muted">Pending deletion</p>}
          <details>
            <summary>{asset.active ? "Delete image" : "Retry deletion"}</summary>
            <form action={deleteMedia} className="studio-form">
              <input name="id" type="hidden" value={asset.id} />
              <label className="studio-check"><input name="confirm" type="checkbox" required /> Remove this file.</label>
              <button type="submit" className="button danger">Delete image</button>
            </form>
          </details>
        </article>)}
      </div> : <p>No images uploaded yet.</p>}
    </section>
  </>;
}

export async function InquiriesView({ db, query, notice }: { db: StudioClient; query: Query; notice?: string }) {
  const notificationLabels = { pending: "Queued", sent: "Accepted by email provider", failed: "Email failed" };
  type InboxItem = Inquiry & { inquiry_notifications: { state: keyof typeof notificationLabels } | null };
  const term = (queryValue(query, "q") ?? "").trim().slice(0, 120);
  const status = inquiryStatuses.find(option => option === queryValue(query, "status"));
  const kind = inquiryKinds.find(option => option === queryValue(query, "kind"));
  const all = await readRows<InboxItem>((start, end) => {
    let results = db.from("inquiries").select("*,inquiry_notifications(state)").order("created_at", { ascending: false }).order("id");
    if (status) results = results.eq("status", status);
    if (kind) results = results.eq("kind", kind);
    return results.range(start, end);
  });
  const visible = term ? all.filter(item => [item.name, item.email, item.phone, item.message, item.city, item.service]
    .some(value => value?.toLowerCase().includes(term.toLowerCase()))) : all;
  return <>
    <Heading title="Inquiries" description="Review requests and track follow-up.">
      {inquiryMailConfig() && <form action={processInquiryEmail}>
        <button className="button" type="submit">Process email queue</button>
      </form>}
      <a className="button" href="/studio/inquiries/export">Export CSV</a>
    </Heading>
    <Notice code={notice} />
    <section className="studio-panel">
      <form action="/studio/inquiries" className="studio-filters">
        <label className="studio-label">Search<input name="q" maxLength={120} defaultValue={term} placeholder="Name, email, phone or message" /></label>
        <label className="studio-label">Status<select name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>{inquiryStatuses.map(entry => <option key={entry} value={entry}>{entry.replaceAll("_", " ")}</option>)}
        </select></label>
        <label className="studio-label">Type<select name="kind" defaultValue={kind ?? ""}>
          <option value="">All types</option>{inquiryKinds.map(entry => <option key={entry}>{entry}</option>)}
        </select></label>
        <button className="button" type="submit">Apply filters</button>
      </form>
      {visible.length > 0 ? visible.map(item => <details className="studio-inquiry" key={item.id}>
        <summary>{item.name} · {item.kind} · {dateLabel(item.created_at)} <Status value={item.status} /></summary>
        <p><strong>Phone</strong> {item.phone}</p>
        {item.email && <p><strong>Email</strong> <a className="studio-link" href={`mailto:${encodeURIComponent(item.email).replace(/%40/g, "@")}`}>{item.email}</a></p>}
        {item.inquiry_notifications && <p><strong>Notification</strong> {notificationLabels[item.inquiry_notifications.state]}</p>}
        {item.service && <p><strong>Service</strong> {item.service}</p>}
        {item.city && <p><strong>Location</strong> {item.city}</p>}
        <p>{item.message}</p>
        <form action={changeInquiryStatus} className="studio-inline">
          <input type="hidden" name="id" value={item.id} />
          <label className="studio-label">Status<select name="status" defaultValue={item.status}>
            {inquiryStatuses.map(entry => <option key={entry} value={entry}>{entry.replaceAll("_", " ")}</option>)}
          </select></label>
          <button type="submit" className="button">Update status</button>
        </form>
      </details>) : <p>No inquiries match these filters.</p>}
    </section>
  </>;
}

export function ProfileView({ email, notice }: { email?: string; notice?: string }) {
  return <>
    <Heading title="Admin profile" description="Manage the password and download a copy of the studio data." />
    <Notice code={notice} />
    <section className="studio-panel">
      <h2>Account</h2>
      <p>{email}</p><p className="studio-muted">Administrator · Two-factor authentication enabled</p>
    </section>
    <section className="studio-panel">
      <h2>Change password</h2>
      <form action={changePassword} className="studio-form">
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
        <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
        <div><button type="submit" className="primary">Update password</button></div>
      </form>
    </section>
    <section className="studio-panel">
      <h2>Data export</h2>
      <p className="studio-muted">Includes projects, website content, inquiry records, media metadata, analytics and audit events.</p>
      <a className="button" href="/studio/backup">Download JSON backup</a>
    </section>
  </>;
}
