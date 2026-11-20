import type { requireAdmin } from "@/lib/studio-auth";

export type StudioClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
export type Query = Record<string, string | string[] | undefined>;
export const queryValue = (query: Query, key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
