import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { after } from "next/server";
import { z } from "zod";
import { serviceDatabase } from "@/lib/public-db";

export const runtime = "nodejs";

const maxBodyBytes = 32 * 1024;
const optionalText = (limit: number) => z.string().trim().max(limit).optional().default("");
const inquiryFields = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(32).regex(/^[\d+() .-]+$/).refine((value) => value.replace(/\D/g, "").length >= 5),
  email: z.union([z.literal(""), z.string().trim().max(240).email()]).optional().default(""),
  service: optionalText(160),
  city: optionalText(160),
  message: z.string().trim().min(2).max(6000),
  project: optionalText(140),
  kind: z.enum(["inquiry", "project", "quote"]).optional().default("inquiry"),
  consent: z.literal("yes"),
});

type Inquiry = z.infer<typeof inquiryFields>;

function response(request: Request, status: number, message: string) {
  const ok = status >= 200 && status < 300;
  const wantsHtml = request.headers.get("accept")?.includes("text/html");
  if (wantsHtml && status !== 403 && status !== 429) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/contact.html?result=${ok ? "sent" : "error"}#enquiry`, "Cache-Control": "no-store" },
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
  return origin === url.origin || Boolean(host && origin === `${protocol}//${host}`);
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
        await reader.cancel();
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

function rateLimitKey(request: Request) {
  const privateKey = process.env.STUDIO_RATE_LIMIT_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") : null;
  const ip = forwarded?.split(",")[0]?.trim();
  const identity = ip && isIP(ip) ? ip : "unattributed";
  return `inquiry:${createHmac("sha256", privateKey).update(identity).digest("hex")}`;
}

async function notifyStudio(inquiry: Inquiry, id: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INQUIRY_FROM_EMAIL;
  const to = process.env.INQUIRY_TO_EMAIL;
  if (!key || !from || !to) return;
  const kind = { inquiry: "General inquiry", project: "Project inquiry", quote: "Quote request" }[inquiry.kind];
  try {
    const email = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `studio-inquiry-${id}` },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from,
        to: [to],
        subject: `ARCH ACRE · New ${kind.toLowerCase()}`,
        ...(inquiry.email ? { reply_to: inquiry.email } : {}),
        text: [
          `Name: ${inquiry.name}`,
          `Phone: ${inquiry.phone}`,
          inquiry.email && `Email: ${inquiry.email}`,
          inquiry.service && `Service: ${inquiry.service}`,
          inquiry.city && `Location: ${inquiry.city}`,
          inquiry.project && `Project: ${inquiry.project}`,
        ].filter(Boolean).join("\n") + `\n\n${inquiry.message}`,
      }),
    });
    if (!email.ok) console.warn("Resend did not accept a studio inquiry notification");
  } catch {
    console.warn("Studio inquiry notification could not be sent");
  }
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
  if (!input.success) return response(request, 400, "Review the required fields and try again.");

  try {
    const database = serviceDatabase();
    if (!database) return response(request, 503, "The inquiry inbox is temporarily unavailable.");
    const { data: allowed, error: rateError } = await database.rpc("consume_studio_rate_limit", {
      p_key: rateLimitKey(request), p_limit: 6, p_window_seconds: 600,
    });
    if (rateError) return response(request, 503, "The inquiry inbox is temporarily unavailable.");
    if (allowed !== true) return response(request, 429, "Too many inquiries. Please try again in a few minutes.");
    const { data: overall, error: globalError } = await database.rpc("consume_studio_rate_limit", {
      p_key: "inquiry:all", p_limit: 120, p_window_seconds: 3600,
    });
    if (globalError) return response(request, 503, "The inquiry inbox is temporarily unavailable.");
    if (overall !== true) return response(request, 429, "The inquiry inbox is busy. Please try again in a few minutes.");

    const { consent: _consent, project, ...fields } = input.data;
    const message = project ? `Project: ${project}\n\n${fields.message}` : fields.message;
    const { data: row, error } = await database.from("inquiries").insert({ ...fields, message }).select("id").single();
    if (error || !row) {
      console.warn("Could not store a studio inquiry");
      return response(request, 503, "We could not store your inquiry. Please try again shortly.");
    }
    after(() => notifyStudio(input.data, row.id));
    return response(request, 201, "Your inquiry has been received.");
  } catch {
    console.warn("Could not process a studio inquiry");
    return response(request, 503, "The inquiry inbox is temporarily unavailable.");
  }
}
