export const environment = {
  production: false,
  /** Relativo + proxy: funciona en PC y en WebView del teléfono (misma origin que el front). */
  apiUrl: '/api/v1',
  /**
   * Opcional. Si está vacío, el login pide clientId a GET /auth/google.
   * Debe ser el mismo Client ID web configurado en la API (GOOGLE_CLIENT_ID).
   */
  googleClientId: '',
  /**
   * Google Analytics 4 Measurement ID (G-…). Vacío = analytics apagado.
   * En GA4 registrá dimensiones: shop_id, shop_name, shop_slug, user_name, user_email,
   * guest_name, guest_email, party_size, area, reservation_date, form_name, form_result.
   */
  gaMeasurementId: 'G-RY63B7T345',
  /**
   * Mostrar «Ver demo» en login. La demo es 100% front (sin API).
   * true = siempre visible; false = oculto.
   */
  demoLoginEnabled: true as boolean | null,
};
