import { ErrorHandler, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

type SentryModule = typeof import('@sentry/angular');

/**
 * Sentry opcional y diferido: solo con `environment.sentryDsn` y cargado con
 * import() después del arranque, para no sumar el SDK al bundle inicial.
 */
let sentry: Promise<SentryModule | null> | null = null;

export function initSentry(): Promise<SentryModule | null> {
  const dsn = (environment.sentryDsn ?? '').trim();
  if (!dsn) return Promise.resolve(null);
  sentry ??= import('@sentry/angular')
    .then((S) => {
      S.init({
        dsn,
        environment: environment.production ? 'production' : 'development',
        tracesSampleRate: 0,
        // Datos de clientes, empleados y plata: solo error, stack y ruta.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
      });
      return S;
    })
    .catch(() => null);
  return sentry;
}

/** Reemplaza el ErrorHandler de Angular: consola como siempre + Sentry si está activo. */
@Injectable()
export class LazySentryErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error(error);
    void initSentry().then((S) => S?.captureException(unwrap(error)));
  }
}

/** Angular envuelve algunos errores (p. ej. de zone/promise) en `rejection` u `originalError`. */
function unwrap(error: unknown): unknown {
  const e = error as { rejection?: unknown; originalError?: unknown } | null;
  return e?.rejection ?? e?.originalError ?? error;
}
