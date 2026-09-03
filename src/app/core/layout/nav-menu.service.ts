import { Injectable, signal } from '@angular/core';
import type { NavItem } from './sidebar/sidebar';

/** Menú lateral actual (permisos + config del local). */
@Injectable({ providedIn: 'root' })
export class NavMenuService {
  readonly items = signal<NavItem[]>([]);
}
