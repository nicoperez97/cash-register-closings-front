/**
 * Compat: tableros /r y /w usan PublicPagePwaService.
 * @deprecated Preferí `PublicPagePwaService` desde `core/pwa`.
 */
export {
  PublicPagePwaService as BoardPwaService,
  type PublicPagePwaKind as BoardPwaKind,
  type PublicPagePwaOptions as BoardPwaOptions,
} from '../../core/pwa/public-page-pwa.service';
