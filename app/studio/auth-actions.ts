"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStudioClient, getStudioMember, requireAdmin, studioConfigured } from "../../lib/studio-auth";
import { isStudioSessionCookie, studioCookieOptions, studioOrigin } from "../../lib/studio-auth-config";
import { consumeAuthAttempt } from "../../lib/studio-auth-limits";

type Feedback = { error?: string; message?: string };
type Enrollment = Feedback & { id?: string; qr?: string; secret?: string };

const emailSchema = z.string().trim().max(254).email();
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });
const codeSchema = z.object({
  factor: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});

async function clearStudioCookies() {
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (isStudioSessionCookie(name)) {
      store.set(name, "", { ...studioCookieOptions, maxAge: 0 });
    }
  }
}

export async function signIn(_: Feedback, form: FormData): Promise<Feedback> {
  const fields = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!fields.success) return { error: "Enter your studio email address and password." };
  if (!studioConfigured()) return { error: "Studio access is currently unavailable." };
  const attempt = await consumeAuthAttempt("login", fields.data.email.toLowerCase());
  if (attempt === "limited") return { error: "Too many sign-in attempts. Try again shortly." };
  if (attempt !== "allowed") return { error: "Studio access is currently unavailable." };

  const supabase = await getStudioClient();
  const { error } = await supabase.auth.signInWithPassword(fields.data);
  if (!error) {
    const member = await getStudioMember(supabase);
    if (member) redirect(member.verified ? "/studio" : "/studio/verify");
    await supabase.auth.signOut({ scope: "local" });
    await clearStudioCookies();
  }
  return { error: "The email address or password could not be verified." };
}

export async function logout() {
  if (studioConfigured()) {
    const supabase = await getStudioClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  await clearStudioCookies();
  redirect("/studio/login");
}

export async function sendPasswordReset(_: Feedback, form: FormData): Promise<Feedback> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const origin = studioOrigin();
  if (!studioConfigured() || !origin) return { error: "Password recovery is currently unavailable." };
  const attempt = await consumeAuthAttempt("recovery", email.data.toLowerCase());
  if (attempt === "limited") return { error: "Too many recovery requests. Try again later." };
  if (attempt !== "allowed") return { error: "Password recovery is currently unavailable." };

  const supabase = await getStudioClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: origin + "/studio/auth/callback" });
  return { message: "If this email has an account, you’ll receive a reset link. Open it in the same browser." };
}

function validatePassword(form: FormData): { password: string } | { error: string } {
  const password = form.get("password");
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    return { error: "Use at least 12 characters and no more than 72 bytes." };
  }
  if (password !== form.get("confirmation")) return { error: "The two passwords do not match." };
  return { password };
}

export async function changePassword(form: FormData) {
  const { supabase } = await requireAdmin();
  const fields = validatePassword(form);
  if ("error" in fields) redirect("/studio/profile?notice=password-invalid");
  const { error } = await supabase.auth.updateUser(fields);
  redirect(error ? "/studio/profile?notice=password-invalid" : "/studio/profile?notice=password-updated");
}

export async function updatePassword(_: Feedback, form: FormData): Promise<Feedback> {
  const { supabase } = await requireAdmin("reset");
  const fields = validatePassword(form);
  if ("error" in fields) return fields;

  const { error } = await supabase.auth.updateUser(fields);
  if (error) return { error: "The password could not be changed. Try a different password or request a new reset link." };

  await supabase.auth.signOut({ scope: "global" });
  await clearStudioCookies();
  redirect("/studio/login?reset=complete");
}

export async function beginEnrollment(_: Enrollment): Promise<Enrollment> {
  const member = await getStudioMember();
  if (!member) redirect("/studio/login");
  if (member.verified) redirect("/studio");
  const attempt = await consumeAuthAttempt("enrollment", member.user.id);
  if (attempt !== "allowed") return { error: "Authenticator setup is temporarily unavailable. Try again shortly." };

  const { supabase } = member;
  const existing = await supabase.auth.mfa.listFactors();
  if (existing.error) return { error: "Authenticator settings could not be loaded. Try again." };
  if (existing.data.totp.length > 0) {
    return { error: "An authenticator is already registered. Reload this page to enter its code." };
  }
  for (const factor of existing.data.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      const result = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (result.error) return { error: "Could not clear the previous setup. Try again." };
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "ARCH ACRE Studio" });
  if (error) return { error: "Could not start authenticator setup. Try again." };

  const qrCode = data.totp.qr_code;
  const source = qrCode.replace(/^data:image\/svg\+xml;utf-8,/, "");
  return {
    id: data.id,
    qr: "data:image/svg+xml;base64," + Buffer.from(source).toString("base64"),
    secret: data.totp.secret,
  };
}

export async function confirmFactor(_: Feedback, form: FormData): Promise<Feedback> {
  const member = await getStudioMember();
  if (!member) redirect("/studio/login");
  const next = form.get("next") === "reset" ? "/studio/reset" : "/studio";
  if (member.verified) redirect(next);

  const fields = codeSchema.safeParse({ factor: form.get("factor"), code: form.get("code") });
  if (!fields.success) return { error: "Enter a six-digit code from your authenticator app." };
  const attempt = await consumeAuthAttempt("verification", member.user.id);
  if (attempt !== "allowed") return { error: "Verification is temporarily unavailable. Try again shortly." };

  const { error } = await member.supabase.auth.mfa.challengeAndVerify({
    factorId: fields.data.factor,
    code: fields.data.code,
  });
  if (error) return { error: "The code could not be verified. Try the current code in your authenticator app." };
  redirect(next);
}
