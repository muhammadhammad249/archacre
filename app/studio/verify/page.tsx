import { redirect } from "next/navigation";
import { getStudioMember } from "../../../lib/studio-auth";
import { AuthCard } from "../auth-card";
import { logout } from "../auth-actions";
import { AuthenticatorForm } from "../auth-forms";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Verify studio access",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const member = await getStudioMember();
  if (!member) redirect("/studio/login");
  const next = (await searchParams).next === "reset" ? "reset" : "studio";
  if (member.verified) redirect(next === "reset" ? "/studio/reset" : "/studio");

  const { data, error } = await member.supabase.auth.mfa.listFactors();
  const factors = data?.totp.map(factor => ({ id: factor.id, name: factor.friendly_name ?? "Authenticator" })) ?? [];
  return (
    <AuthCard
      title={factors.length ? "Verify access" : "Two-factor authentication"}
      description={factors.length ? "Enter the current code from your authenticator app." : "Set up an authenticator to secure your administrator account."}
    >
      {error ? <p className="notice error" role="alert">Authenticator settings could not be loaded. Refresh and try again.</p>
        : <AuthenticatorForm factors={factors} next={next} />}
      <form action={logout}><button className="button" type="submit">Sign out</button></form>
    </AuthCard>
  );
}
