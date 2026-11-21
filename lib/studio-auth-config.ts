export const studioSessionCookie = "archacre-studio-auth";

export const studioCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export function readStudioConfig() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) return null;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "");
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol === "https:" || (url.protocol === "http:" && process.env.NODE_ENV !== "production")) {
      return { url: url.href, key };
    }
  } catch {
    // An invalid URL leaves the studio unavailable.
  }
  return null;
}

export function readServiceKey() {
  return process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

export function readRateLimitSecret() {
  const key = process.env.STUDIO_RATE_LIMIT_SECRET?.trim();
  return key && key.length >= 32 ? key : null;
}

export function studioSignInConfigured() {
  return Boolean(readStudioConfig() && readServiceKey() && readRateLimitSecret());
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
