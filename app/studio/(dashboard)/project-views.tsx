import Link from "next/link";
import { notFound } from "next/navigation";
import { checked, readRows } from "@/lib/studio-data";
import { studioId, type CmsValue, type Media, type Project } from "@/lib/studio-model";
import { changeProjectStatus, deleteProject, saveProject } from "./actions";
import type { StudioClient } from "./types";
import { Heading, Notice, Status } from "./ui";

export async function ProjectsView({ db, notice }: { db: StudioClient; notice?: string }) {
  const projects = await readRows<Project>((start, end) => db.from("projects").select("*")
    .order("sort_order").order("id").range(start, end));
  return <>
    <Heading title="Projects" description="Manage the portfolio and choose what appears on the website.">
      <Link className="primary" href="/studio/projects/new">Add project</Link>
    </Heading>
    <Notice code={notice} />
    <section className="studio-panel">
      {projects.length ? <div className="studio-table-wrap"><table className="studio-table">
        <thead><tr><th>Project</th><th>Category</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{projects.map(project => <tr key={project.id}>
          <td><Link className="studio-link" href={"/studio/projects/" + project.id}>{project.title}</Link>
            {project.featured && <div className="studio-muted">Featured</div>}</td>
          <td>{project.category}</td><td>{project.sort_order}</td><td><Status value={project.status} /></td>
          <td><form action={changeProjectStatus}>
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="status" value={project.status === "published" ? "draft" : "published"} />
            <button type="submit" className="button">{project.status === "published" ? "Unpublish" : "Publish"}</button>
          </form></td>
        </tr>)}</tbody>
      </table></div> : <p>There are no projects yet.</p>}
    </section>
  </>;
}

async function getProject(db: StudioClient, id: string) {
  if (id === "new") return null;
  if (!studioId.safeParse(id).success) notFound();
  const project = checked(await db.from("projects").select("*").eq("id", id).maybeSingle()) as Project | null;
  if (!project) notFound();
  return project;
}

export async function ProjectView({ db, id, notice }: { db: StudioClient; id: string; notice?: string }) {
  const [project, media, categories, existing] = await Promise.all([
    getProject(db, id),
    readRows<Media>((start, end) => db.from("media_assets").select("*").eq("active", true)
      .order("created_at", { ascending: false }).order("id").range(start, end)),
    db.from("site_content").select("value").eq("key", "categories").maybeSingle(),
    db.from("projects").select("category").limit(500),
  ]);
  const categoryValue = checked(categories)?.value as CmsValue | undefined;
  const configured = Array.isArray(categoryValue?.items) ? categoryValue.items.map(row => row.name) : [];
  const categoryNames = [...new Set([...(checked(existing) ?? []).map(row => row.category as string), ...configured])].filter(Boolean).sort();
  const options = new Map<string, string>((project?.gallery ?? []).map(url => [url, url.split("/").pop() ?? url]));
  if (project?.cover_image) options.set(project.cover_image, project.cover_image.split("/").pop() ?? project.cover_image);
  for (const image of media) options.set("/media/" + image.id, image.filename);
  return <>
    <Heading title={project?.title ?? "New project"} description={project ? "Edit project details and publishing settings." : "Add a project to the portfolio."}>
      <Link className="button" href="/studio/projects">All projects</Link>
      {project?.status === "published" && <Link className="button" href={"/projects/" + project.slug}>View on website</Link>}
    </Heading>
    <Notice code={notice} />
    <form action={saveProject} className="studio-form">
      <input type="hidden" name="id" value={project?.id ?? ""} />
      <section className="studio-panel">
        <h2>Project details</h2>
        <div className="studio-fields">
          <label>Title<input name="title" required maxLength={160} defaultValue={project?.title} /></label>
          <label>URL slug<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} defaultValue={project?.slug}
            placeholder="Generated from title if blank" /></label>
          <label>Category<input name="category" list="project-categories" maxLength={80} required defaultValue={project?.category} />
            <datalist id="project-categories">{categoryNames.map(category => <option key={category} value={category} />)}</datalist>
          </label>
          <label>Location<input name="location" maxLength={180} defaultValue={project?.location} /></label>
          <label>Completion date<input name="completion_date" type="date" defaultValue={project?.completion_date ?? ""} /></label>
          <label>Area or size<input name="area" maxLength={80} defaultValue={project?.area} placeholder="e.g. 2,400 sq ft" /></label>
          <label className="studio-wide">Description<textarea name="description" rows={7} required maxLength={12000} defaultValue={project?.description} /></label>
        </div>
      </section>
      <section className="studio-panel studio-form">
        <h2>Images</h2>
        <label>Cover image<select name="cover_image" defaultValue={project?.cover_image ?? ""}>
          <option value="">Choose a cover image</option>
          {[...options].map(([url, name]) => <option key={url} value={url}>{name}</option>)}
        </select></label>
        {options.size > 0 ? <fieldset className="studio-gallery"><legend>Gallery images</legend>
          {[...options].map(([url, name]) => <label key={url}>
            <img src={url} alt="" loading="lazy" />
            <span><input type="checkbox" name="gallery" value={url} defaultChecked={project?.gallery.includes(url)} /> {name}</span>
          </label>)}
        </fieldset> : <p className="studio-muted">Upload images to the <Link className="studio-link" href="/studio/media">media library</Link> first.</p>}
      </section>
      <section className="studio-panel studio-form">
        <h2>Publishing and SEO</h2>
        <div className="studio-fields">
          <label>Visibility<select name="status" defaultValue={project?.status ?? "draft"}>
            <option value="draft">Draft</option><option value="published">Published</option>
          </select></label>
          <label>Display order<input name="sort_order" type="number" required min={0} max={100000} defaultValue={project?.sort_order ?? 100} /></label>
          <label className="studio-wide studio-check"><input name="featured" type="checkbox" defaultChecked={project?.featured} /> Feature on homepage</label>
          <label>SEO title<input name="seo_title" maxLength={100} defaultValue={project?.seo_title} /></label>
          <label>SEO description<textarea name="seo_description" maxLength={280} defaultValue={project?.seo_description} /></label>
        </div>
        <div><button type="submit" className="primary">Save project</button></div>
      </section>
    </form>
    {project && <details className="studio-panel">
      <summary>Delete project</summary>
      <form action={deleteProject} className="studio-form">
        <input type="hidden" name="id" value={project.id} />
        <label className="studio-check"><input type="checkbox" name="confirm" required /> Permanently delete this project.</label>
        <div><button type="submit" className="button danger">Delete project</button></div>
      </form>
    </details>}
  </>;
}
