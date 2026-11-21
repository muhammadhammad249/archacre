import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioMember } from "../../../lib/studio-auth";
import { studioSignInConfigured } from "../../../lib/studio-auth-config";
import { AuthCard } from "../auth-card";
import { LoginForm } from "../auth-forms";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Studio sign-in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const member = await getStudioMember();
  if (member) redirect(member.verified ? "/studio" : "/studio/verify");
  const { reset } = await searchParams;
  const configured = studioSignInConfigured();

  return (
    <AuthCard title="Studio sign-in" description="Use your administrator account to access the dashboard.">
      {reset === "complete" && <p className="notice" role="status">Password updated. Sign in with your new password.</p>}
      {!configured && <p className="notice" role="status">Studio access is currently unavailable.</p>}
      <LoginForm disabled={!configured} />
      <Link href="/studio/forgot">Forgot password?</Link>
    </AuthCard>
  );
}
