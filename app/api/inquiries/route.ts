import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { after } from "next/server";
import { z } from "zod";
import { deliverInquiryNotifications } from "@/lib/inquiry-mail";
import { serviceDatabase } from "@/lib/public-db";
import { readRateLimitSecret, studioOrigin } from "@/lib/studio-auth-config";

export const runtime = "nodejs";

const maxBodyBytes = 72 * 1024;
const optionalText = (limit: number) => z.string().trim().max(limit).optional().default("");
const inquiryFields = z.object({
  name: z.string().trim().min(2).max(120),
  phone: optionalText(32).refine(value => !value || (/^[\d+() .-]+$/.test(value) && value.replace(/\D/g, "").length >= 5)),
  email: z.union([z.literal(""), z.string().trim().max(240).email()]).optional().default(""),
  service: optionalText(160),
  city: optionalText(160),
  message: z.string().trim().min(2).max(6000),
  project: optionalText(140),
  kind: z.enum(["inquiry", "project", "quote"]).optional().default("inquiry"),
  submission_id: z.union([z.uuid(), z.literal("")]).optional(),
  consent: z.literal("yes"),
}).refine(({ phone, email }) => Boolean(phone || email));

function response(request: Request, status: number, message: string) {
  const ok = status >= 200 && status < 300;
  const wantsHtml = request.headers.get("accept")?.includes("text/html");
  if (wantsHtml && status !== 403) {
    const result = ok ? "sent" : status === 503 ? "unavailable" : status === 429 ? "busy" : "error";
    return new Response(null, {
      status: 303,
      headers: { Location: `/contact.html?result=${result}#enquiry`, "Cache-Control": "no-store" },
    });
  }
  return Response.json({ ok, message }, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  const forwardedProtocol = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-proto") : null;
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http" ? `${forwardedProtocol}:` : url.protocol;
  return origin === studioOrigin() || origin === url.origin || Boolean(host && origin === `${protocol}//${host}`);
}

async function boundedForm(request: Request, contentType: string) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const body = new Uint8Array(maxBodyBytes);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > body.length) {
        void reader.cancel().catch(() => {});
        return null;
      }
      body.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(body.subarray(0, offset), { headers: { "Content-Type": contentType } }).formData();
}

function rateLimitKey(request: Request, inquiry: z.infer<typeof inquiryFields>, secret: string) {
  const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") : null;
  const ip = forwarded?.split(",")[0]?.trim();
  const phone = inquiry.phone.replace(/\D/g, "");
  const identity = ip && isIP(ip) ? ["ip", ip] : [phone ? "phone" : "email", phone || inquiry.email.toLowerCase()];
  return `inquiry:${createHmac("sha256", secret).update(JSON.stringify(identity)).digest("hex")}`;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return response(request, 403, "This form accepts inquiries sent from this website.");
  const contentType = request.headers.get("content-type") || "";
  if (!/^(?:multipart\/form-data|application\/x-www-form-urlencoded)(?:;|$)/i.test(contentType)) {
    return response(request, 415, "Send this inquiry using the website form.");
  }
  if (Number(request.headers.get("content-length")) > maxBodyBytes) {
    return response(request, 413, "Your inquiry is too large.");
  }

  let form: FormData | null;
  try {
    form = await boundedForm(request, contentType);
  } catch {
    return response(request, 400, "We could not read this form. Please try again.");
  }
  if (!form) return response(request, 413, "Your inquiry is too large.");
  if (form.get("_gotcha")) return response(request, 202, "Your inquiry has been received.");

  const input = inquiryFields.safeParse(Object.fromEntries(form));
  if (!input.success) return response(request, 400, "Check the required fields and provide a valid email address or phone number.");

  try {
    const database = serviceDatabase();
    const rateSecret = readRateLimitSecret();
    if (!database || !rateSecret) return response(request, 503, "The inquiry inbox is temporarily unavailable.");
    const { data: allowed, error: rateError } = await database.rpc("consume_studio_rate_limit", {
      p_key: rateLimitKey(request, input.data, rateSecret), p_limit: 6, p_window_seconds: 600,
    });
    if (rateError) return response(request, 503, "The inquiry inbox is temporarily unavailable.");
    if (allowed !== true) return response(request, 429, "Too many inquiries. Please try again in a few minutes.");
    const { data: overall, error: globalError } = await database.rpc("consume_studio_rate_limit", {
      p_key: "inquiry:all", p_limit: 120, p_window_seconds: 3600,
    });
    if (globalError) return response(request, 503, "The inquiry inbox is temporarily unavailable.");
    if (overall !== true) return response(request, 429, "The inquiry inbox is busy. Please try again in a few minutes.");

    const { consent: _consent, project, submission_id, ...fields } = input.data;
    const message = project ? `Project: ${project}\n\n${fields.message}` : fields.message;
    const { data: row, error } = await database.from("inquiries")
      .insert({ ...fields, message, submission_id: submission_id || null }).select("id").single();
    if (submission_id && error?.code === "23505") return response(request, 201, "Your inquiry has been received.");
    if (error || !row) {
      console.warn("Could not store a studio inquiry");
      return response(request, 503, "We could not store your inquiry. Please try again shortly.");
    }
    after(async () => {
      try {
        await deliverInquiryNotifications(database, row.id);
      } catch {
        console.warn("Could not process a queued studio email notification");
      }
    });
    return response(request, 201, "Your inquiry has been received.");
  } catch {
    console.warn("Could not process a studio inquiry");
    return response(request, 503, "The inquiry inbox is temporarily unavailable.");
  }
}
