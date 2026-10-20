export const environment = {
  production: true,
  apiUrl: '/api/v1',
  googleClientId: '',
  /** Google Analytics 4 Measurement ID. */
  gaMeasurementId: 'G-RY63B7T345',
  /**
   * Mostrar «Probar demo» en la landing (`/`). La demo es 100% front (sin API).
   * true = siempre visible; false = oculto; null = mismo que false en prod.
   */
  demoLoginEnabled: true as boolean | null,
  /** Sentry del front (proyecto cierres-front; el DSN es público por diseño). Vacío = apagado. */
  sentryDsn:
    'https://99269a056d2cc01bf9f11c87e93c2f59@o4512284909109248.ingest.us.sentry.io/4512288866828288' as string,
};
