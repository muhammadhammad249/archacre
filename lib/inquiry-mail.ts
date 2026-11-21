import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type Notification = {
  inquiry_id: string;
  claim_token: string;
  attempts: number;
  can_send: boolean;
  name: string;
  phone: string;
  email: string | null;
  service: string;
  city: string;
  message: string;
  kind: "inquiry" | "project" | "quote";
};

export function inquiryMailConfig() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INQUIRY_FROM_EMAIL?.trim();
  const to = process.env.INQUIRY_TO_EMAIL?.trim();
  return key && from && to ? { key, from, to } : null;
}

const kindLabels = { inquiry: "general inquiry", project: "project inquiry", quote: "quote request" };
const retryMinutes = [1, 5, 15, 60];

async function sendNotification(job: Notification, config: NonNullable<ReturnType<typeof inquiryMailConfig>>) {
  if (!job.can_send) return "failed";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `studio-inquiry-${job.inquiry_id}`,
      },
      signal: AbortSignal.timeout(6500),
      body: JSON.stringify({
        from: config.from,
        to: [config.to],
        subject: `ARCH ACRE · New ${kindLabels[job.kind]}`,
        ...(job.email ? { reply_to: job.email } : {}),
        text: [
          `Name: ${job.name}`,
          `Phone: ${job.phone}`,
          job.email && `Email: ${job.email}`,
          job.service && `Service: ${job.service}`,
          job.city && `Location: ${job.city}`,
        ].filter(Boolean).join("\n") + `\n\n${job.message}`,
      }),
    });
    void response.body?.cancel().catch(() => {});
    if (response.ok) return "sent";
    return response.status === 409 || response.status === 429 || response.status >= 500 ? "retry" : "failed";
  } catch {
    return "retry";
  }
}

export async function deliverInquiryNotifications(database: SupabaseClient, inquiryId?: string) {
  const config = inquiryMailConfig();
  if (!config) return null;
  const { data, error } = await database.rpc("claim_studio_inquiry_notifications", {
    p_inquiry_id: inquiryId ?? null,
    p_limit: inquiryId ? 1 : 4,
  });
  if (error || !Array.isArray(data)) throw new Error("Could not claim studio email notifications");

  const totals = { sent: 0, pending: 0, failed: 0 };
  for (const job of data as Notification[]) {
    const result = await sendNotification(job, config);
    const retryIn = result === "retry" ? retryMinutes[job.attempts - 1] : undefined;
    const state = retryIn !== undefined ? "pending" : result === "sent" ? "sent" : "failed";
    const now = Date.now();
    const update = await database.from("inquiry_notifications").update({
      state,
      claim_token: null,
      available_at: new Date(now + (retryIn ?? 0) * 60_000).toISOString(),
      sent_at: state === "sent" ? new Date(now).toISOString() : null,
    }).eq("inquiry_id", job.inquiry_id).eq("claim_token", job.claim_token).select("inquiry_id").maybeSingle();
    if (update.error) throw new Error("Could not record studio email notification status");
    if (update.data) totals[state]++;
  }
  return totals;
}
