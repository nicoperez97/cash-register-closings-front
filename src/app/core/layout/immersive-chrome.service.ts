import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

type ImmersiveKey = 'comanda' | 'customer-orders';

const ROUTES: Array<{ key: ImmersiveKey; test: (path: string) => boolean }> = [
  { key: 'comanda', test: (p) => p === '/comanda' || p.startsWith('/comanda/') },
  {
    key: 'customer-orders',
    test: (p) => p === '/customer-orders' || p.startsWith('/customer-orders/'),
  },
];

function normalizePath(url: string): string {
  return (url.split('?')[0] || '').split('#')[0] || '';
}

function routeKeyFor(path: string): ImmersiveKey | null {
  return ROUTES.find((r) => r.test(path))?.key ?? null;
}

/**
 * Comanda y Pedidos clientes: al entrar se ocultan toolbar y sidenav.
 * El usuario puede volver a mostrarlas en esa visita; al reingresar se ocultan de nuevo.
 */
@Injectable({ providedIn: 'root' })
export class ImmersiveChromeService {
  private readonly router = inject(Router);
  private readonly path = signal(normalizePath(this.router.url));
  /** Pantallas donde el usuario pidió ver la chrome en esta visita. */
  private readonly revealed = signal<Partial<Record<ImmersiveKey, true>>>({});

  constructor() {
    // Preferencia vieja (localStorage) podía dejar la chrome siempre visible.
    try {
      localStorage.removeItem('app_immersive_chrome_v1');
    } catch {
      // ignore
    }

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const nextPath = normalizePath(e.urlAfterRedirects);
        const prevKey = routeKeyFor(this.path());
        const nextKey = routeKeyFor(nextPath);
        this.path.set(nextPath);
        // Al entrar a Comanda / Pedidos (o cambiar entre ellas): ocultar de nuevo.
        if (nextKey && nextKey !== prevKey) {
          this.revealed.update((r) => {
            const copy = { ...r };
            delete copy[nextKey];
            return copy;
          });
        }
      });
  }

  readonly routeKey = computed((): ImmersiveKey | null => routeKeyFor(this.path()));

  /** Esta ruta usa modo inmersivo (chrome oculta por defecto). */
  readonly canToggle = computed(() => this.routeKey() != null);

  /**
   * Chrome oculta en Comanda / Pedidos, salvo que el usuario la haya mostrado en esta visita.
   */
  readonly toolbarHidden = computed(() => {
    const key = this.routeKey();
    if (!key) return false;
    return this.revealed()[key] !== true;
  });

  setToolbarHidden(hidden: boolean): void {
    const key = this.routeKey();
    if (!key) return;
    this.revealed.update((r) => {
      const copy = { ...r };
      if (hidden) delete copy[key];
      else copy[key] = true;
      return copy;
    });
  }

  toggleToolbarHidden(): void {
    this.setToolbarHidden(!this.toolbarHidden());
  }
}
