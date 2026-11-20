import Link from "next/link";
import { studioConfigured } from "../../../lib/studio-auth";
import { studioOrigin } from "../../../lib/studio-auth-config";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "../auth-forms";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Recover studio access",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  const ready = studioConfigured() && !!studioOrigin();
  return (
    <AuthCard title="Recover studio access" description="We’ll send a password reset link to the email associated with your administrator account.">
      {expired && <p className="notice error" role="alert">That reset link is invalid or has expired. Request a new one.</p>}
      {!ready && <p className="notice" role="status">Password recovery is currently unavailable.</p>}
      <ForgotForm disabled={!ready} />
      <Link href="/studio/login">Back to sign-in</Link>
    </AuthCard>
  );
}
