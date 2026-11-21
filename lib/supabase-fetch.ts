export const supabaseFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(6000);
  const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
};
