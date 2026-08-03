import { Injectable } from '@angular/core';

export type BodyScrollLockReason = 'sidenav' | 'dialog' | string;

/**
 * Un solo lock de body para sidenav, dialogs, etc.
 * Evita que dos callers pisen `position:fixed` / scrollY entre sí.
 */
@Injectable({ providedIn: 'root' })
export class BodyScrollLockService {
  private readonly reasons = new Set<BodyScrollLockReason>();
  private locked = false;
  private scrollY = 0;

  lock(reason: BodyScrollLockReason): void {
    if (typeof document === 'undefined') return;
    this.reasons.add(reason);
    if (this.locked) return;
    const html = document.documentElement;
    const body = document.body;
    this.scrollY = window.scrollY || html.scrollTop || 0;
    body.dataset['guyScrollY'] = String(this.scrollY);
    html.classList.add('guy-body-scroll-lock');
    body.classList.add('guy-body-scroll-lock');
    body.style.position = 'fixed';
    body.style.inset = '0';
    body.style.width = '100%';
    body.style.top = `-${this.scrollY}px`;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    this.locked = true;
  }

  unlock(reason: BodyScrollLockReason): void {
    if (typeof document === 'undefined') return;
    this.reasons.delete(reason);
    if (this.reasons.size > 0 || !this.locked) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = Number(body.dataset['guyScrollY'] || this.scrollY || 0);
    html.classList.remove('guy-body-scroll-lock');
    body.classList.remove('guy-body-scroll-lock');
    // Compat con clase vieja del dialog lock
    html.classList.remove('guy-dialog-scroll-lock');
    body.classList.remove('guy-dialog-scroll-lock');
    body.style.position = '';
    body.style.inset = '';
    body.style.width = '';
    body.style.top = '';
    body.style.overflow = '';
    html.style.overflow = '';
    delete body.dataset['guyScrollY'];
    delete body.dataset['dialogScrollY'];
    delete body.dataset['sidenavScrollY'];
    this.locked = false;
    window.scrollTo(0, scrollY);
  }

  isLocked(): boolean {
    return this.locked;
  }

  hasReason(reason: BodyScrollLockReason): boolean {
    return this.reasons.has(reason);
  }
}
