import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/studio-auth";
import { logout } from "../auth-actions";
import { StudioNav } from "./studio-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, supabase } = await requireAdmin();
  const { count } = await supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new");
  return (
    <div className="studio-shell">
      <aside className="studio-sidebar" aria-label="Studio menu">
        <Link href="/studio" className="studio-brand">ARCH ACRE<span>Studio administration</span></Link>
        <StudioNav newInquiries={count ?? 0} />
        <div className="studio-account">
          <Link href="/studio/profile">{user.email ?? "Admin profile"}</Link>
          <form action={logout}><button type="submit" className="studio-signout">Sign out</button></form>
        </div>
      </aside>
      <main id="studio-main" className="studio-main">{children}</main>
    </div>
  );
}
