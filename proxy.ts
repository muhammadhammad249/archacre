import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isStudioSessionCookie, readStudioConfig, studioCookieOptions, studioSessionCookie } from "./lib/studio-auth-config";
import { supabaseFetch } from "./lib/supabase-fetch";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = readStudioConfig();

  if (config && request.cookies.getAll().some(({ name }) => isStudioSessionCookie(name))) {
    const supabase = createServerClient(config.url, config.key, {
      global: { fetch: supabaseFetch },
      cookieOptions: { ...studioCookieOptions, name: studioSessionCookie },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          const previous = response.cookies.getAll();
          response = NextResponse.next({ request });
          for (const cookie of previous) response.cookies.set(cookie);
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    try {
      await supabase.auth.getClaims();
    } catch {
      // Protected pages verify the session again before returning data.
    }
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/studio/:path*", "/api/studio/:path*"],
};
