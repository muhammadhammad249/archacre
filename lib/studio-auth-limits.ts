import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { serviceDatabase } from "./public-db";
import { readRateLimitSecret } from "./studio-auth-config";

const attempts = {
  login: { limit: 8, seconds: 600 },
  recovery: { limit: 4, seconds: 1800 },
  enrollment: { limit: 5, seconds: 600 },
  verification: { limit: 8, seconds: 300 },
} as const;

export async function consumeAuthAttempt(action: keyof typeof attempts, identity: string) {
  const database = serviceDatabase();
  const rateSecret = readRateLimitSecret();
  if (!database || !rateSecret) return "unavailable";

  // Only Vercel's own forwarding header is trusted as an anonymous client hint.
  const anonymous = action === "login" || action === "recovery";
  const client = anonymous && process.env.VERCEL === "1"
    ? (await headers()).get("x-vercel-forwarded-for")?.split(",")[0]?.trim().slice(0, 64)
    : undefined;
  const key = createHmac("sha256", rateSecret)
    .update(JSON.stringify(["studio-auth", action, identity, client ?? "default"]))
    .digest("hex");
  const { limit, seconds } = attempts[action];
  const { data, error } = await database.rpc("consume_studio_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: seconds,
  });
  if (error) return "unavailable";
  return data === true ? "allowed" : "limited";
}
