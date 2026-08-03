import { Injectable } from '@angular/core';

export type BodyScrollLockReason = 'sidenav' | 'dialog' | string;

/**
 * Un solo lock de body para sidenav, dialogs, etc.
 * Solo usa overflow:hidden (sin position:fixed): fixed achica el body y,
 * con top:-scrollY, deja la pantalla de atrás en gris vacío detrás del modal.
 * Soporta el mismo reason anidado (p.ej. varios MatDialog) con refcount.
 */
@Injectable({ providedIn: 'root' })
export class BodyScrollLockService {
  private readonly reasonCounts = new Map<BodyScrollLockReason, number>();
  private locked = false;

  lock(reason: BodyScrollLockReason): void {
    if (typeof document === 'undefined') return;
    const next = (this.reasonCounts.get(reason) ?? 0) + 1;
    this.reasonCounts.set(reason, next);
    if (this.locked) return;

    const html = document.documentElement;
    const body = document.body;
    html.classList.add('guy-body-scroll-lock');
    body.classList.add('guy-body-scroll-lock');
    this.locked = true;
  }

  unlock(reason: BodyScrollLockReason): void {
    if (typeof document === 'undefined') return;
    const current = this.reasonCounts.get(reason) ?? 0;
    if (current <= 1) this.reasonCounts.delete(reason);
    else this.reasonCounts.set(reason, current - 1);

    if (this.reasonCounts.size > 0 || !this.locked) return;

    const html = document.documentElement;
    const body = document.body;
    html.classList.remove('guy-body-scroll-lock');
    body.classList.remove('guy-body-scroll-lock');
    html.classList.remove('guy-dialog-scroll-lock');
    body.classList.remove('guy-dialog-scroll-lock');
    // Limpieza por si quedó estilo inline de locks viejos
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.overflow = '';
    html.style.overflow = '';
    delete body.dataset['guyScrollY'];
    delete body.dataset['dialogScrollY'];
    delete body.dataset['sidenavScrollY'];
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }

  hasReason(reason: BodyScrollLockReason): boolean {
    return (this.reasonCounts.get(reason) ?? 0) > 0;
  }
}
