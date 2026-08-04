import { Component, inject, input } from '@angular/core';
import { MainPwaInstallService } from '../../core/pwa/main-pwa-install.service';

@Component({
  selector: 'app-main-pwa-install-banner',
  template: `
    @if (pwa.showBanner()) {
      <aside class="install" role="region" aria-label="Instalar aplicación">
        <div class="install__text">
          <strong>Instalar Cierres</strong>
          @if (pwa.canNativeInstall()) {
            <span>Agregá la app a tu dispositivo para acceso rápido.</span>
          } @else if (pwa.isIos()) {
            <span>En Safari: Compartir → <em>Agregar a pantalla de inicio</em>.</span>
          } @else {
            <span>Desde el menú del navegador: Instalar app / Agregar a inicio.</span>
          }
        </div>
        <div class="install__actions">
          @if (pwa.canNativeInstall()) {
            <button type="button" class="install__btn" (click)="onInstall()">Instalar</button>
          }
          <button type="button" class="install__dismiss" (click)="pwa.dismiss()" aria-label="Cerrar">
            Ahora no
          </button>
        </div>
      </aside>
    }
  `,
  styles: [
    `
      .install {
        position: fixed;
        z-index: 1200;
        left: 0.75rem;
        right: 0.75rem;
        bottom: calc(0.75rem + var(--guy-bottom-nav-height, 0px) + env(safe-area-inset-bottom, 0px));
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: 14px;
        background: color-mix(in srgb, var(--guy-navy-deep, #154a75) 94%, #000);
        border: 1px solid color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, transparent);
        box-shadow: 0 14px 36px rgba(0, 30, 60, 0.35);
        color: #f4f8fc;
        backdrop-filter: blur(8px);
      }

      .install__text {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 12rem;
        flex: 1 1 12rem;
        font-size: 0.88rem;
        line-height: 1.35;
      }

      .install__text strong {
        font-size: 0.95rem;
      }

      .install__text span {
        opacity: 0.88;
      }

      .install__text em {
        font-style: normal;
        font-weight: 650;
        color: #fff;
      }

      .install__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        align-items: center;
      }

      .install__btn,
      .install__dismiss {
        min-height: 40px;
        padding: 0.45rem 0.9rem;
        border-radius: 999px;
        font: inherit;
        font-size: 0.88rem;
        font-weight: 650;
        cursor: pointer;
      }

      .install__btn {
        border: 0;
        background: var(--guy-accent, #f27d16);
        color: #fff;
      }

      .install__dismiss {
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: transparent;
        color: #f4f8fc;
      }
    `,
  ],
})
export class MainPwaInstallBannerComponent {
  readonly pwa = inject(MainPwaInstallService);
  /** Espacio extra inferior (p.ej. bottom nav). Se aplica vía CSS var del layout. */
  readonly lift = input(false);

  async onInstall(): Promise<void> {
    await this.pwa.install();
  }
}
