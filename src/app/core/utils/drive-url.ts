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

/** Path relativo de avatar subido (`users/{id}/avatar.jpg`). */
export function isUploadedUserAvatarPath(raw?: string | null): boolean {
  const v = (raw ?? '').trim().replace(/\\/g, '/');
  return !!v && !/^https?:\/\//i.test(v) && v.startsWith('users/');
}

/** URL lista para <img> del avatar de usuario (endpoint público). */
export function resolveUserAvatarSrc(
  avatarUrl?: string | null,
  userId?: string | null,
  cacheKey?: string | number | null,
): string | null {
  if (!userId) return null;
  const raw = (avatarUrl ?? '').trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  if (!raw && !avatarUrl) return null;
  const bust =
    cacheKey != null && String(cacheKey) ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
  return `${environment.apiUrl}/public/users/${userId}/avatar${bust}`;
}

export function userAvatarSrc(
  user: { id?: string | null; avatarUrl?: string | null; hasAvatar?: boolean } | null | undefined,
  cacheKey?: string | number | null,
): string | null {
  if (!user?.id) return null;
  if (!user.avatarUrl && !user.hasAvatar) return null;
  const bust =
    cacheKey != null && String(cacheKey) ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
  if (user.avatarUrl && /^https?:\/\//i.test(user.avatarUrl.trim())) {
    return user.avatarUrl.trim();
  }
  return `${environment.apiUrl}/public/users/${user.id}/avatar${bust}`;
}
