import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, asyncScheduler, scheduled } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { DemoOverlayStore } from './demo-overlay.store';
import { assertDemoNeverHitsNetwork, mustHandleDemoLocally } from './demo-offline';
import { resolveDemoGet, resolveDemoMutationFallback } from './demo-mock.resolver';
import { DEMO_TOKEN } from './demo-fixtures';

let warnedOnce = false;

function apiPath(url: string): string {
  try {
    if (url.startsWith('http')) {
      const u = new URL(url);
      return u.pathname.replace(/\/+$/, '') || '/';
    }
  } catch {
    // fall through
  }
  const bare = url.split('?')[0] ?? url;
  return bare.replace(/\/+$/, '') || '/';
}

function stripApiPrefix(path: string): string {
  const m = path.match(/\/api\/v\d+(.*)$/i);
  if (m) return m[1] || '/';
  if (path.startsWith('/api/')) {
    const rest = path.replace(/^\/api\/v?\d*/i, '') || '/';
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return path;
}

function isMutation(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

function listKeyFromItemPath(rel: string): string | null {
  const m = rel.match(
    /^(\/shops\/[^/]+\/(?:accounts|concepts|shortages|suppliers|services|payments|movements|closings))\/[^/]+/,
  );
  if (m) return m[1];
  const u = rel.match(/^(\/users)\/[^/]+/);
  if (u) return u[1];
  const ss = rel.match(/^(\/sales-systems)\/[^/]+/);
  if (ss) return ss[1];
  return null;
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function snackOnce(snack: MatSnackBar): void {
  if (warnedOnce) return;
  warnedOnce = true;
  snack.open('Modo demo: datos de ejemplo. Los cambios se pierden al recargar', 'OK', {
    duration: 4500,
  });
}

function ok(url: string, body: unknown): HttpResponse<unknown> {
  return new HttpResponse({ status: 200, body, url });
}

/**
 * Emite en macrotask (como HTTP real). `of()` síncrono dentro de un `effect`
 * que escribe signals rastreados provoca bucles infinitos (p.ej. Cuentas).
 */
function demoOk(url: string, body: unknown): Observable<HttpResponse<unknown>> {
  return scheduled([ok(url, body)], asyncScheduler);
}

/**
 * Demo 100% offline: si hay sesión demo, ninguna request al backend sale a la red.
 * No llama a `next()` para URLs de API.
 */
export const demoOverlayInterceptor: HttpInterceptorFn = (req, next) => {
  if (!mustHandleDemoLocally(req.url)) {
    return next(req);
  }

  // Contrato: demo + API ⇒ respuesta local. Nunca `next` (red).
  assertDemoNeverHitsNetwork(req.url, false);

  const auth = inject(AuthService);
  const store = inject(DemoOverlayStore);
  const snack = inject(MatSnackBar);
  const path = apiPath(req.url);
  const rel = stripApiPrefix(path);
  const method = req.method.toUpperCase();

  if (!isMutation(method)) {
    const body = resolveDemoGet(rel, req.url, store);
    return demoOk(req.url, body);
  }

  snackOnce(snack);

  if (/import-excel|unify|backup|\/logo|\/avatar|print-agent|\/live|\/push\//.test(rel)) {
    snack.open('Esa acción no está disponible en la demo', 'OK', { duration: 3500 });
    return demoOk(req.url, resolveDemoMutationFallback());
  }

  if (method === 'POST' && (rel === '/auth/demo' || rel === '/auth/login')) {
    return demoOk(req.url, { accessToken: DEMO_TOKEN, demo: true });
  }

  const bodyIn =
    req.body && typeof req.body === 'object' && !(req.body instanceof FormData)
      ? { ...(req.body as Record<string, unknown>) }
      : {};

  if (
    (method === 'PUT' || method === 'PATCH') &&
    (/\/menu$/.test(rel) || /\/promos$/.test(rel) || /^\/shops\/[^/]+$/.test(rel))
  ) {
    if (Array.isArray(req.body)) {
      store.setDoc(rel, req.body, false);
      return demoOk(req.url, req.body);
    }
    store.setDoc(rel, bodyIn, true);
    return demoOk(req.url, store.getDoc(rel) ?? bodyIn);
  }

  const listKey =
    listKeyFromItemPath(rel) ??
    (/^\/(users|sales-systems)$/.test(rel) ? rel : null) ??
    (rel.match(
      /^\/shops\/[^/]+\/(?:accounts|concepts|shortages|suppliers|services|payments|movements|closings)$/,
    )
      ? rel
      : null);

  if (method === 'DELETE' && listKey) {
    store.markDeleted(listKey, rel.split('/').pop()!);
    return demoOk(req.url, { ok: true });
  }

  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && listKey) {
    const idFromPath = listKeyFromItemPath(rel) ? rel.split('/').pop()! : null;
    const row: Record<string, unknown> = {
      ...bodyIn,
      id: idFromPath || bodyIn['id'] || newId(),
      active: bodyIn['active'] !== undefined ? bodyIn['active'] : true,
    };
    if (method === 'POST' && !idFromPath) {
      if (!row['fullName'] && row['email']) row['fullName'] = String(row['email']);
      if (!row['name'] && row['code']) row['name'] = String(row['code']);
    }
    store.upsertInList(listKey, row);
    return demoOk(req.url, row);
  }

  if (rel.includes('/attendance')) {
    return demoOk(req.url, { ok: true });
  }
  if (rel.includes('/favorite-shop')) {
    const user = auth.currentUser();
    const shopId = (bodyIn['shopId'] as string | null) ?? null;
    if (user) {
      auth.patchCurrentUser({ favoriteShopId: shopId });
    }
    return demoOk(req.url, auth.currentUser());
  }

  // Cualquier otra mutación: OK local, sin red.
  store.setDoc(rel, bodyIn, true);
  return demoOk(req.url, bodyIn);
};
