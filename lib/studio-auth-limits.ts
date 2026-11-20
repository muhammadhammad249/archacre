import "server-only";

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { readStudioConfig } from "./studio-auth-config";

const attempts = {
  login: { limit: 8, seconds: 600 },
  recovery: { limit: 4, seconds: 1800 },
  enrollment: { limit: 5, seconds: 600 },
  verification: { limit: 8, seconds: 300 },
} as const;

export async function consumeAuthAttempt(action: keyof typeof attempts, identity: string) {
  const config = readStudioConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const rateSecret = process.env.STUDIO_RATE_LIMIT_SECRET;
  if (!config || !secretKey || !rateSecret || rateSecret.length < 32) return "unavailable";

  // Only Vercel's own forwarding header is trusted as an anonymous client hint.
  const anonymous = action === "login" || action === "recovery";
  const client = anonymous && process.env.VERCEL === "1"
    ? (await headers()).get("x-vercel-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
    : undefined;
  const key = createHmac("sha256", rateSecret)
    .update(JSON.stringify(["studio-auth", action, identity, client ?? "default"]))
    .digest("hex");
  const { limit, seconds } = attempts[action];
  const database = createClient(config.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await database.rpc("consume_studio_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: seconds,
  });
  if (error) return "unavailable";
  return data === true ? "allowed" : "limited";
}
