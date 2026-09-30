import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { driver, type DriveStep, type Driver } from 'driver.js';
import { AuthService } from '../auth/auth.service';

const TOUR_FLAG = 'crc_demo_tour';

type DemoTourDef = {
  route: string;
  element: string;
  expandGroup?: 'nav-local' | 'nav-admin';
  title: string;
  description: string;
};

/**
 * Tour de la demo: destruye el overlay antes de navegar y lo recrea en el
 * destino. Así driver.js no queda apuntando a un nodo desmontado (síntoma:
 * «Siguiente» no avanza y el popover se congela).
 */
@Injectable({ providedIn: 'root' })
export class DemoTourService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private running = false;
  private drv: Driver | null = null;
  private locked = false;

  maybeStart(): void {
    if (!this.auth.isDemoMode() || this.running) return;
    let pending = false;
    try {
      pending = sessionStorage.getItem(TOUR_FLAG) === '1';
    } catch {
      pending = false;
    }
    if (!pending) return;
    try {
      sessionStorage.removeItem(TOUR_FLAG);
    } catch {
      // ignore
    }
    void this.start();
  }

  async start(): Promise<void> {
    if (this.running || !this.auth.isDemoMode()) return;
    this.running = true;

    const defs: DemoTourDef[] = [
      {
        route: '/admin/shop',
        element: '[data-demo="banner"]',
        title: 'Modo demo',
        description:
          'Estás viendo el panel de administración con datos de ejemplo. Los cambios no se guardan: al recargar vuelve todo como estaba.',
      },
      {
        route: '/admin/shop',
        element: '[data-demo="page-shop-hub"]',
        expandGroup: 'nav-local',
        title: 'Configuración del local',
        description:
          'Desde acá configurás identidad, horarios, pedidos, comandas y el resto del local.',
      },
      {
        route: '/admin/menu',
        element: 'app-admin-menu',
        expandGroup: 'nav-local',
        title: 'Carta',
        description: 'Armá y publicá la carta del local. En la demo ya hay ítems de ejemplo.',
      },
      {
        route: '/admin/promos',
        element: 'app-admin-promos',
        expandGroup: 'nav-local',
        title: 'Promos',
        description: 'Combos y packs con precio fijo, aparte de la carta.',
      },
      {
        route: '/admin/users',
        element: 'app-admin-users',
        expandGroup: 'nav-admin',
        title: 'Usuarios',
        description: 'Altas, roles y permisos del equipo del local.',
      },
      {
        route: '/admin/accounts',
        element: 'app-admin-accounts',
        expandGroup: 'nav-admin',
        title: 'Cuentas',
        description: 'Plan de cuentas del local: socios, canales y sistema.',
      },
      {
        route: '/admin/concepts',
        element: 'app-admin-concepts',
        expandGroup: 'nav-admin',
        title: 'Conceptos',
        description: 'Catálogo de ingresos y egresos para movimientos y reportes.',
      },
      {
        route: '/admin/messages',
        element: 'app-admin-messages',
        expandGroup: 'nav-admin',
        title: 'Mensajes y más',
        description:
          'También podés explorar mensajes, QR y enlaces públicos. Cuando termines, usá «Salir de la demo».',
      },
    ];

    const teardown = (): void => {
      const d = this.drv;
      this.drv = null;
      this.running = false;
      this.locked = false;
      try {
        d?.destroy();
      } catch {
        // ignore
      }
    };

    const show = async (index: number): Promise<void> => {
      if (this.locked) return;
      if (index < 0) return;
      if (index >= defs.length) {
        teardown();
        return;
      }

      this.locked = true;
      // Quitar overlay viejo ANTES de cambiar de ruta (evita nodo huérfano).
      const prev = this.drv;
      this.drv = null;
      try {
        prev?.destroy();
      } catch {
        // ignore
      }

      try {
        const def = defs[index];
        await this.router.navigateByUrl(def.route);
        await this.delay(160);
        this.expandNavGroup(def.expandGroup);
        await this.waitForVisible(def.element, 8000);
        await this.delay(40);

        const steps: DriveStep[] = defs.map((d) => ({
          element: () => this.queryVisible(d.element) ?? document.body,
          popover: {
            title: d.title,
            description: d.description,
            side: 'bottom',
            align: 'start',
            // Handlers por paso con el índice cerrado: no dependemos del estado interno.
            onNextClick: () => {
              void show(index + 1);
            },
            onPrevClick: () => {
              void show(index - 1);
            },
            onCloseClick: () => {
              teardown();
            },
          },
        }));

        // Solo el popover del paso activo usa los handlers de arriba; al hacer
        // drive(index) driver.js toma los on*Click de ese step.
        this.drv = driver({
          showProgress: true,
          animate: true,
          allowClose: true,
          smoothScroll: true,
          overlayOpacity: 0.5,
          stagePadding: 10,
          stageRadius: 10,
          nextBtnText: 'Siguiente',
          prevBtnText: 'Anterior',
          doneBtnText: 'Listo',
          progressText: '{{current}} / {{total}}',
          steps,
          onDestroyed: () => {
            // Solo limpiar si no estamos a punto de recrear el siguiente paso.
            if (!this.locked) {
              this.drv = null;
              this.running = false;
            }
          },
        });
        this.drv.drive(index);
      } catch {
        teardown();
      } finally {
        this.locked = false;
      }
    };

    await show(0);
  }

  private expandNavGroup(group?: 'nav-local' | 'nav-admin'): void {
    if (!group) return;
    const title = document.querySelector(`[data-demo="${group}"]`);
    const navGroup = title?.closest('.nav-group');
    if (!navGroup) return;
    if (navGroup.classList.contains('nav-group--collapsed')) {
      const chevron = navGroup.querySelector<HTMLButtonElement>('.nav-group__chevron-btn');
      chevron?.click();
    }
  }

  private queryVisible(selector: string): Element | null {
    const nodes = document.querySelectorAll(selector);
    for (const el of Array.from(nodes)) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return el;
    }
    return null;
  }

  private waitForVisible(selector: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (this.queryVisible(selector) || Date.now() - start > timeoutMs) {
          resolve();
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
