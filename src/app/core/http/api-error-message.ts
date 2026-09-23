/** Extract a readable message from Angular HttpClient / Nest validation errors. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string | string[] }; message?: string };
  const msg = e?.error?.message ?? e?.message;
  if (Array.isArray(msg) && msg.length) return String(msg[0]);
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return fallback;
}
