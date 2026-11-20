import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/studio-auth";
import { isCmsSection } from "@/lib/studio-model";
import { ProjectView, ProjectsView } from "../project-views";
import { ContentView, InquiriesView, MediaView, Overview, ProfileView } from "../studio-views";
import { queryValue, type Query } from "../types";

export default async function StudioPage({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Query>;
}) {
  const { supabase, user } = await requireAdmin();
  const [{ section = [] }, query] = await Promise.all([params, searchParams]);
  const [screen, detail, extra] = section;
  if (extra) notFound();
  const notice = queryValue(query, "notice");
  switch (screen) {
    case undefined: return <Overview db={supabase} />;
    case "projects": return detail
      ? <ProjectView db={supabase} id={detail} notice={notice} /> : <ProjectsView db={supabase} notice={notice} />;
    case "content": if (detail && isCmsSection(detail)) return <ContentView db={supabase} section={detail} notice={notice} />; break;
    case "media": if (!detail) return <MediaView db={supabase} notice={notice} />; break;
    case "inquiries": if (!detail) return <InquiriesView db={supabase} query={query} notice={notice} />; break;
    case "profile": if (!detail) return <ProfileView email={user.email} notice={notice} />; break;
  }
  notFound();
}
