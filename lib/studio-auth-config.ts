export const studioSessionCookie = "archacre-studio-auth";

export const studioCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export function readStudioConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function studioOrigin() {
  const value = process.env.SITE_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && process.env.NODE_ENV !== "production")) {
      return url.origin;
    }
  } catch {
    // A reset request cannot use an unconfigured or invalid public origin.
  }
  return null;
}

export function isStudioSessionCookie(name: string) {
  return name === studioSessionCookie
    || name.startsWith(studioSessionCookie + ".")
    || name.startsWith(studioSessionCookie + "-");
}
