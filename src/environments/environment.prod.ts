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
};
