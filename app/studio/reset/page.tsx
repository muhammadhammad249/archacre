import { requireAdmin } from "../../../lib/studio-auth";
import { AuthCard } from "../auth-card";
import { ResetForm } from "../auth-forms";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  await requireAdmin("reset");
  return (
    <AuthCard title="Set a new password" description="Choose a password of at least 12 characters. You’ll sign in again after saving.">
      <ResetForm />
    </AuthCard>
  );
}
