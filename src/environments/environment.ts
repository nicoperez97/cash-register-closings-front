export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  /**
   * Opcional. Si está vacío, el login pide clientId a GET /auth/google.
   * Debe ser el mismo Client ID web configurado en la API (GOOGLE_CLIENT_ID).
   */
  googleClientId: '',
};
