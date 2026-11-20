import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

export function checked<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) {
    console.error("Studio database error", result.error.code);
    throw new Error("The studio database could not complete the request.");
  }
  return result.data;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
export async function readRows<T>(next: (start: number, end: number) => PageResult<T>): Promise<T[]> {
  const pageSize = 500;
  const all: T[] = [];
  for (let start = 0; ; start += pageSize) {
    const rows = checked(await next(start, start + pageSize - 1)) ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
