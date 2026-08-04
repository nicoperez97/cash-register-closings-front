/**
 * Proxy local:
 * - /api → backend
 * - /pwa → manifests PWA de tableros
 * - /ipad → cliente ES5 (API), por si el static de public/ no alcanza
 *
 * Override: CRC_API_PROXY=http://localhost:3000
 */
const target = process.env['CRC_API_PROXY'] || 'http://192.168.0.2:3000';

module.exports = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
    logLevel: 'silent',
  },
  '/ipad': {
    target,
    secure: false,
    changeOrigin: true,
    logLevel: 'silent',
  },
  '/pwa': {
    target,
    secure: false,
    changeOrigin: true,
    logLevel: 'silent',
    pathRewrite: (path) => {
      const qIndex = path.indexOf('?');
      const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
      const search = qIndex >= 0 ? path.slice(qIndex) : '';
      const m = pathname.match(/^\/pwa\/(r|w)\/([^/]+)\.webmanifest$/);
      if (!m) return path;
      const kind = m[1] === 'w' ? 'waiting' : 'reservations';
      const slug = m[2];
      return `/api/v1/public/shops/${slug}/manifests/${kind}${search}`;
    },
  },
};
