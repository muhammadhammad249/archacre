import { createHash, timingSafeEqual } from "node:crypto";
import { deliverInquiryNotifications } from "@/lib/inquiry-mail";
import { serviceDatabase } from "@/lib/public-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (value: string) => createHash("sha256").update(value).digest();
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !authorization || !timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const database = serviceDatabase();
    const result = database && await deliverInquiryNotifications(database);
    if (result) return Response.json(result, { headers });
  } catch {
    console.warn("Could not process queued studio email notifications");
  }
  return Response.json({ error: "Notifications are temporarily unavailable." }, { status: 503, headers });
}

export const POST = GET;
