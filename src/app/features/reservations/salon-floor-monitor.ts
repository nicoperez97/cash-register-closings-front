import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canAccessPublicPage } from '../../core/shop/public-page-access';
import { SalonFloorMonitorService } from './salon-floor-monitor.service';

@Component({
  selector: 'app-salon-floor-monitor',
  imports: [RouterLink, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    @if (monitor.visible()) {
      <div
        class="sfm"
        [class.sfm--alert]="monitor.totalAttention() > 0"
        [class.sfm--new]="highlightNew()"
        [class.sfm--new-res]="highlightNew() && monitor.lastBumpKind() === 'reservation'"
        [class.sfm--new-wait]="highlightNew() && monitor.lastBumpKind() === 'waiting'"
        [class.sfm--pulse]="flashing()"
        [class.sfm--open]="open()"
      >
        <button
          type="button"
          class="sfm__chip"
          [attr.aria-expanded]="open()"
          aria-label="Monitor de reservas y lista de espera"
          [matTooltip]="chipTooltip()"
          (click)="toggle()"
        >
          @if (showReservations()) {
            <span
              class="sfm__metric"
              [class.sfm__metric--bump]="highlightNew() && monitor.lastBumpKind() === 'reservation'"
              title="Mesas sin marcar ni sentar"
            >
              <mat-icon>event_seat</mat-icon>
              <strong>{{ monitor.openReservations() }}</strong>
            </span>
          }
          @if (showWaiting()) {
            <span
              class="sfm__metric"
              [class.sfm__metric--bump]="highlightNew() && monitor.lastBumpKind() === 'waiting'"
              title="Lista de espera"
            >
              <mat-icon>hourglass_top</mat-icon>
              <strong>{{ monitor.waitingParties() }}</strong>
            </span>
          }
        </button>

        @if (open()) {
          <div class="sfm__panel" role="dialog" aria-label="Detalle del monitor de salón">
            <header class="sfm__head">
              <div>
                <strong>Salón en vivo</strong>
                <span>{{ shops.selectedShop()?.name ?? 'Local' }}</span>
              </div>
              <button
                type="button"
                class="sfm__close"
                aria-label="Cerrar"
                (click)="open.set(false)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </header>

            <ul class="sfm__stats">
              @if (showReservations()) {
                <li>
                  <mat-icon>event_seat</mat-icon>
                  <span>
                    {{ monitor.openReservations() }}
                    {{
                      monitor.openReservations() === 1
                        ? 'mesa sin marcar ni sentar'
                        : 'mesas sin marcar ni sentar'
                    }}
                  </span>
                </li>
              }
              @if (showWaiting()) {
                <li>
                  <mat-icon>hourglass_top</mat-icon>
                  <span>
                    {{ monitor.waitingParties() }}
                    {{ monitor.waitingParties() === 1 ? 'grupo en espera' : 'grupos en espera' }}
                  </span>
                </li>
              }
            </ul>

            @if (monitor.preview().length) {
              <ul class="sfm__preview">
                @for (row of monitor.preview(); track row.kind + row.id) {
                  <li>
                    <mat-icon>{{
                      row.kind === 'reservation' ? 'event_seat' : 'person'
                    }}</mat-icon>
                    <span class="sfm__preview-label">{{ row.label }}</span>
                    <span class="sfm__preview-size">{{ row.partySize }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="sfm__empty">Sin novedades ahora.</p>
            }

            <div class="sfm__links">
              @if (showReservationBoardLink()) {
                <a
                  mat-stroked-button
                  routerLink="/admin/public-pages/reservationsBoard"
                  (click)="open.set(false)"
                >
                  <mat-icon>table_restaurant</mat-icon>
                  Reservas
                </a>
              }
              @if (showWaitingBoardLink()) {
                <a
                  mat-stroked-button
                  routerLink="/admin/public-pages/waiting"
                  (click)="open.set(false)"
                >
                  <mat-icon>hourglass_top</mat-icon>
                  Lista de espera
                </a>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      right: max(0.75rem, env(safe-area-inset-right, 0px));
      bottom: max(0.85rem, env(safe-area-inset-bottom, 0px));
      z-index: 210;
      pointer-events: none;
    }
    .sfm {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.45rem;
      pointer-events: auto;
    }
    .sfm__chip {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 42px;
      padding: 0.35rem 0.75rem;
      border: 1px solid color-mix(in srgb, var(--guy-navy, #003366) 18%, #fff);
      border-radius: 999px;
      background: color-mix(in srgb, #fff 92%, var(--guy-navy, #003366));
      box-shadow:
        0 8px 22px color-mix(in srgb, #001a33 18%, transparent),
        0 1px 0 color-mix(in srgb, #fff 70%, transparent) inset;
      color: var(--guy-navy, #003366);
      cursor: pointer;
      backdrop-filter: blur(10px);
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease,
        border-color 0.25s ease,
        background 0.25s ease,
        color 0.25s ease;
    }
    .sfm__chip:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 26px color-mix(in srgb, #001a33 22%, transparent);
    }
    .sfm--alert .sfm__chip {
      border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 55%, #fff);
      background: color-mix(in srgb, var(--guy-accent, #2e7d32) 12%, #fff);
    }
    .sfm--new .sfm__chip {
      border-color: #e65100;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, #ff6d00 88%, #fff),
        color-mix(in srgb, #ff8f00 82%, #fff)
      );
      color: #3e1400;
      box-shadow:
        0 0 0 3px color-mix(in srgb, #ff6d00 35%, transparent),
        0 10px 28px color-mix(in srgb, #e65100 35%, transparent);
    }
    .sfm--new-res .sfm__chip {
      border-color: #c62828;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, #ef5350 90%, #fff),
        color-mix(in srgb, #ff7043 85%, #fff)
      );
      color: #3b0a0a;
      box-shadow:
        0 0 0 3px color-mix(in srgb, #ef5350 40%, transparent),
        0 12px 30px color-mix(in srgb, #c62828 38%, transparent);
    }
    .sfm--new-wait .sfm__chip {
      border-color: #1565c0;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, #42a5f5 88%, #fff),
        color-mix(in srgb, #29b6f6 84%, #fff)
      );
      color: #0d2137;
      box-shadow:
        0 0 0 3px color-mix(in srgb, #42a5f5 38%, transparent),
        0 12px 30px color-mix(in srgb, #1565c0 32%, transparent);
    }
    .sfm--pulse .sfm__chip {
      animation: sfm-pulse 1.1s ease;
    }
    .sfm__metric {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      font-size: 0.92rem;
      font-weight: 750;
      border-radius: 999px;
      padding: 0.1rem 0.2rem;
      transition:
        background 0.2s ease,
        transform 0.2s ease;
    }
    .sfm__metric--bump {
      background: color-mix(in srgb, #fff 55%, transparent);
      transform: scale(1.12);
    }
    .sfm__metric mat-icon {
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      color: color-mix(in srgb, var(--guy-navy, #003366) 72%, #5f6f76);
    }
    .sfm--alert .sfm__metric mat-icon {
      color: var(--guy-accent, #2e7d32);
    }
    .sfm--new .sfm__metric mat-icon,
    .sfm--new .sfm__metric strong {
      color: inherit;
    }
    .sfm__panel {
      width: min(18.5rem, calc(100vw - 1.5rem));
      padding: 0.75rem 0.8rem 0.8rem;
      border: 1px solid color-mix(in srgb, var(--guy-border, #e5e5e5) 90%, transparent);
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 14px 36px color-mix(in srgb, #001a33 18%, transparent);
      color: var(--guy-navy, #003366);
    }
    .sfm__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.55rem;
    }
    .sfm__head strong {
      display: block;
      font-size: 0.95rem;
    }
    .sfm__head span {
      display: block;
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
    }
    .sfm__close {
      border: 0;
      background: transparent;
      padding: 0.1rem;
      border-radius: 999px;
      cursor: pointer;
      color: var(--guy-muted, #5f6f76);
      line-height: 0;
    }
    .sfm__close mat-icon {
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
    }
    .sfm__stats {
      list-style: none;
      margin: 0 0 0.55rem;
      padding: 0;
      display: grid;
      gap: 0.3rem;
    }
    .sfm__stats li {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.86rem;
      font-weight: 650;
    }
    .sfm__stats mat-icon {
      font-size: 1.05rem;
      width: 1.05rem;
      height: 1.05rem;
      color: var(--guy-accent, #2e7d32);
    }
    .sfm__stats-hint {
      font-weight: 500;
      color: var(--guy-muted, #5f6f76);
    }
    .sfm__preview {
      list-style: none;
      margin: 0 0 0.65rem;
      padding: 0;
      display: grid;
      gap: 0.28rem;
    }
    .sfm__preview li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.45rem;
      border-radius: 8px;
      background: color-mix(in srgb, var(--guy-navy, #003366) 4%, #fff);
      font-size: 0.82rem;
    }
    .sfm__preview mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      color: var(--guy-muted, #5f6f76);
    }
    .sfm__preview-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sfm__preview-size {
      font-weight: 750;
      color: var(--guy-navy, #003366);
    }
    .sfm__empty {
      margin: 0 0 0.65rem;
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
    }
    .sfm__links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .sfm__links a {
      margin: 0;
      min-height: 36px;
    }
    @keyframes sfm-pulse {
      0% {
        transform: scale(1);
      }
      20% {
        transform: scale(1.12);
      }
      45% {
        transform: scale(0.97);
      }
      70% {
        transform: scale(1.08);
      }
      100% {
        transform: scale(1);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .sfm--pulse .sfm__chip {
        animation: none;
      }
      .sfm__metric--bump {
        transform: none;
      }
    }
  `,
})
export class SalonFloorMonitorComponent {
  readonly monitor = inject(SalonFloorMonitorService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly open = signal(false);
  readonly flashing = signal(false);
  readonly highlightNew = signal(false);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const n = this.monitor.pulse();
      if (n <= 0) return;
      this.flashing.set(true);
      this.highlightNew.set(true);
      if (this.flashTimer) clearTimeout(this.flashTimer);
      if (this.highlightTimer) clearTimeout(this.highlightTimer);
      this.flashTimer = setTimeout(() => this.flashing.set(false), 1100);
      this.highlightTimer = setTimeout(() => {
        this.highlightNew.set(false);
        this.monitor.clearBump();
      }, 10000);
    });
  }

  /** Métricas del chip: según features del local, no permisos de módulo. */
  readonly showReservations = computed(() => this.monitor.showReservationsMetric());

  readonly showWaiting = computed(() => this.monitor.showWaitingMetric());

  /** Tablero público /r embebido en el admin. */
  readonly showReservationBoardLink = computed(() => {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    return (
      !!shop?.reservationsEnabled &&
      canAccessPublicPage(this.auth.currentUser(), shopId, 'reservationsBoard')
    );
  });

  /** Pantalla pública /w embebida en el admin. */
  readonly showWaitingBoardLink = computed(() => {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    return (
      !!shop?.waitingListEnabled &&
      canAccessPublicPage(this.auth.currentUser(), shopId, 'waiting')
    );
  });

  chipTooltip(): string {
    const parts: string[] = [];
    if (this.showReservations()) {
      parts.push(`${this.monitor.openReservations()} sin marcar`);
    }
    if (this.showWaiting()) {
      parts.push(`${this.monitor.waitingParties()} en espera`);
    }
    return parts.length ? parts.join(' · ') : 'Monitor de salón';
  }

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.highlightNew.set(false);
      this.monitor.clearBump();
      if (this.highlightTimer) {
        clearTimeout(this.highlightTimer);
        this.highlightTimer = null;
      }
    }
  }
}
