import { Injectable, signal } from '@angular/core';
import type { NavItem } from './sidebar/sidebar';

/** Menú lateral actual (permisos + config del local). */
@Injectable({ providedIn: 'root' })
export class NavMenuService {
  readonly items = signal<NavItem[]>([]);
  /** Pedido de abrir/cerrar sidenav desde pantallas sin toolbar (p. ej. visor público). */
  readonly sidenavToggleRequest = signal(0);

  requestSidenavToggle(): void {
    this.sidenavToggleRequest.update((n) => n + 1);
  }
}
