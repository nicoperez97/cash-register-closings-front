import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_TITLE_BRAND = 'Cierres de caja';
export const APP_TITLE_FALLBACK = APP_TITLE_BRAND;

/** Formatea el título de pestaña: `{page} | Cierres de caja`. */
export function formatAppTitle(page: string): string {
  const trimmed = page.trim();
  return trimmed ? `${trimmed} | ${APP_TITLE_BRAND}` : APP_TITLE_FALLBACK;
}

@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? formatAppTitle(page) : APP_TITLE_FALLBACK);
  }
}
