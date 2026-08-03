import { Component, inject, input } from '@angular/core';
import { BoardPwaKind, BoardPwaService } from './board-pwa.service';

@Component({
  selector: 'app-board-install-banner',
  template: `
    @if (pwa.showBanner()) {
      <aside class="install" role="region" aria-label="Instalar acceso directo">
        <div class="install__text">
          <strong>{{ title() }}</strong>
          @if (pwa.canNativeInstall()) {
            <span>Instalá este tablero como app en el dispositivo.</span>
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
          <button type="button" class="install__dismiss" (click)="pwa.dismissBanner()" aria-label="Cerrar">
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
        z-index: 30;
        left: 0.75rem;
        right: 0.75rem;
        bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: 14px;
        background: rgba(18, 16, 14, 0.94);
        border: 1px solid color-mix(in srgb, var(--install-accent, #c45c26) 45%, transparent);
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
        color: #f4efe6;
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
        opacity: 0.85;
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
        background: var(--install-accent, #c45c26);
        color: #fff;
      }

      .install__dismiss {
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: transparent;
        color: #f4efe6;
      }
    `,
  ],
  host: {
    '[style.--install-accent]': 'accent()',
  },
})
export class BoardInstallBannerComponent {
  readonly pwa = inject(BoardPwaService);

  readonly kind = input.required<BoardPwaKind>();
  readonly shopName = input.required<string>();
  readonly accent = input<string>('#c45c26');

  title(): string {
    return this.kind() === 'waiting' ? 'App Lista de espera' : 'App Reservas';
  }

  async onInstall(): Promise<void> {
    await this.pwa.install();
  }
}
