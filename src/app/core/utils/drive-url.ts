/**
 * Convierte un vínculo de Google Drive ("copiar vínculo") a una URL usable en <img>.
 */
import { environment } from '../../../environments/environment';

export function normalizeLogoUrl(raw?: string | null): string | null {
  const input = raw?.trim();
  if (!input) return null;

  const id = extractGoogleDriveFileId(input);
  if (id) {
    return `https://lh3.googleusercontent.com/d/${id}`;
  }
  return input;
}

export function extractGoogleDriveFileId(url: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/i,
    /drive\.google\.com\/open\?[^#]*\bid=([^&]+)/i,
    /drive\.google\.com\/uc\?[^#]*\bid=([^&]+)/i,
    /drive\.google\.com\/thumbnail\?[^#]*\bid=([^&]+)/i,
    /docs\.google\.com\/[^/]+\/d\/([^/]+)/i,
    /lh3\.googleusercontent\.com\/d\/([^/?#]+)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Path relativo de logo subido al API (`shops/{id}/logo.png`). */
export function isUploadedShopLogoPath(raw?: string | null): boolean {
  const v = (raw ?? '').trim().replace(/\\/g, '/');
  return !!v && !/^https?:\/\//i.test(v) && v.startsWith('shops/');
}

/**
 * URL lista para <img>: Drive/CDN, o endpoint público del API si es archivo subido.
 */
export function resolveShopLogoSrc(
  logoUrl?: string | null,
  shopId?: string | null,
  cacheKey?: string | number | null,
): string | null {
  const raw = (logoUrl ?? '').trim();
  if (!raw) return null;
  if (isUploadedShopLogoPath(raw)) {
    if (!shopId) return null;
    const bust = cacheKey != null && String(cacheKey) ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
    return `${environment.apiUrl}/public/shops/${shopId}/logo${bust}`;
  }
  return normalizeLogoUrl(raw) || raw;
}
