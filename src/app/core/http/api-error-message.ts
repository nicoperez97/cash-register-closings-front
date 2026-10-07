/**
 * Mensaje seguro para UI. Nunca muestra URLs, status codes ni el
 * "Http failure response…" de Angular HttpClient.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const safeFallback = (fallback || 'Algo salió mal. Probá de nuevo.').trim();

  for (const candidate of bodyMessages(err)) {
    if (!isTechnicalMessage(candidate)) return candidate;
  }

  // Error de app (no HTTP): solo si el texto es humano.
  if (err instanceof Error && !isHttpLike(err)) {
    const plain = err.message?.trim() ?? '';
    if (plain === 'GSI' || plain === 'timeout' || /GSI/i.test(plain)) {
      return 'No se pudo cargar Google. Probá de nuevo.';
    }
    if (plain && !isTechnicalMessage(plain)) return plain;
  }

  return friendlyByStatus(httpStatus(err), safeFallback);
}

/** `status` requerido en el type guard: si fuera opcional, todo `Error` cae en `never`. */
function isHttpLike(err: unknown): err is { status: unknown; error?: unknown } {
  return !!err && typeof err === 'object' && 'status' in err;
}

function httpStatus(err: unknown): number {
  if (!isHttpLike(err)) return 0;
  const n = Number(err.status);
  return Number.isFinite(n) ? n : 0;
}

function bodyMessages(err: unknown): string[] {
  const body = isHttpLike(err)
    ? err.error
    : err && typeof err === 'object' && 'error' in err
      ? (err as { error: unknown }).error
      : null;

  if (body == null) return [];
  if (typeof body === 'string') {
    const t = body.trim();
    return t ? [t] : [];
  }
  if (typeof body !== 'object') return [];

  const msg = (body as { message?: unknown }).message;
  const out: string[] = [];
  if (Array.isArray(msg)) {
    for (const item of msg) {
      const t = String(item ?? '').trim();
      if (t) out.push(t);
    }
  } else if (typeof msg === 'string' && msg.trim()) {
    out.push(msg.trim());
  }
  return out;
}

function isTechnicalMessage(msg: string): boolean {
  const t = msg.trim();
  if (!t) return true;
  if (/^Http failure response/i.test(t)) return true;
  if (/https?:\/\//i.test(t)) return true;
  if (/localhost:\d+/i.test(t)) return true;
  if (/\/api\/v\d+/i.test(t)) return true;
  if (/Internal Server Error/i.test(t)) return true;
  if (/Unknown Error/i.test(t)) return true;
  if (/Network Error/i.test(t)) return true;
  if (/status code \d+/i.test(t)) return true;
  if (/\b(500|502|503|504)\b/i.test(t) && /\b(Error|Gateway|Unavailable|Timeout)\b/i.test(t)) {
    return true;
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|ERR_NETWORK/i.test(t)) return true;
  if (/Cannot (GET|POST|PUT|PATCH|DELETE)\b/i.test(t)) return true;
  if (/NestJS|TypeORM|QueryFailedError|Prisma|MongoError/i.test(t)) return true;
  if (/at\s+\S+\s+\(/i.test(t)) return true;
  if (/^\s*Error:\s*Http/i.test(t)) return true;
  if (/^\[object \w+\]$/i.test(t)) return true;
  if (/\b(must be|must not|should not|should be an|is required|must match)\b/i.test(t)) {
    return true;
  }
  if (/^(Bad Request|Unauthorized|Forbidden|Not Found|Conflict)$/i.test(t)) return true;
  return false;
}

function friendlyByStatus(status: number, fallback: string): string {
  if (status === 0) return 'Sin conexión. Revisá la red e intentá de nuevo.';
  if (status === 401) return 'Tenés que iniciar sesión de nuevo.';
  if (status === 403) return 'No tenés permiso para hacer eso.';
  if (status === 404) return fallback;
  if (status === 408 || status === 504) return 'Tardó demasiado. Probá de nuevo.';
  if (status === 429) return 'Demasiados intentos. Esperá un momento.';
  if (status >= 500) return 'Algo salió mal. Probá de nuevo en un rato.';
  return fallback;
}
