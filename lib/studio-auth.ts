import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readStudioConfig, studioCookieOptions, studioSessionCookie } from "./studio-auth-config";
import { supabaseFetch } from "./supabase-fetch";

export function studioConfigured() {
  return readStudioConfig() !== null;
}

export async function getStudioClient() {
  const config = readStudioConfig();
  if (!config) throw new Error("Supabase Auth is not configured.");

  const store = await cookies();
  return createServerClient(config.url, config.key, {
    db: { retry: false },
    global: { fetch: supabaseFetch },
    cookieOptions: { ...studioCookieOptions, name: studioSessionCookie },
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // The request proxy refreshes cookies for read-only Server Components.
        }
      },
    },
  });
}

export async function getStudioMember(supabase?: Awaited<ReturnType<typeof getStudioClient>>) {
  if (!studioConfigured()) return null;
  try {
    supabase ??= await getStudioClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims.sub) return null;

    const membership = await supabase.rpc("is_studio_member");
    if (membership.error || membership.data !== true) return null;

    return {
      supabase,
      user: {
        id: data.claims.sub,
        email: typeof data.claims.email === "string" ? data.claims.email : undefined,
      },
      verified: data.claims.aal === "aal2",
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(afterVerification?: "reset") {
  const member = await getStudioMember();
  if (!member) redirect("/studio/login");
  if (!member.verified) {
    redirect(afterVerification === "reset" ? "/studio/verify?next=reset" : "/studio/verify");
  }
  return member;
}
