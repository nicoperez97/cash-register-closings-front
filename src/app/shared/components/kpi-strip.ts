import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SpinnerComponent } from './spinner';

export interface KpiDetail {
  label: string;
  value: string | number;
}

export interface KpiItem {
  label: string;
  value: string | number;
  hint?: string;
  details?: KpiDetail[];
  icon?: string;
  route?: string;
  tone?: 'default' | 'ok' | 'warn' | 'muted';
  /** Spinner en esta KPI (además del loading global del strip). */
  loading?: boolean;
}

@Component({
  selector: 'app-kpi-strip',
  imports: [NgTemplateOutlet, RouterLink, MatIconModule, SpinnerComponent],
  template: `
    <div class="row g-2 guy-stagger" [attr.aria-busy]="loading() || null">
      @for (k of items(); track k.label) {
        <div class="col-6 col-md-3">
          @if (k.route) {
            <a
              class="guy-kpi guy-kpi--link"
              [class.guy-kpi--ok]="k.tone === 'ok'"
              [class.guy-kpi--warn]="k.tone === 'warn'"
              [class.guy-kpi--muted]="k.tone === 'muted'"
              [class.guy-kpi--loading]="isLoading(k)"
              [routerLink]="k.route"
              [attr.aria-busy]="isLoading(k) || null"
              [attr.tabindex]="isLoading(k) ? -1 : null"
              (click)="onNavigate($event, k)"
            >
              <ng-container *ngTemplateOutlet="kpiInner; context: { k }" />
            </a>
          } @else {
            <div
              class="guy-kpi"
              [class.guy-kpi--ok]="k.tone === 'ok'"
              [class.guy-kpi--warn]="k.tone === 'warn'"
              [class.guy-kpi--muted]="k.tone === 'muted'"
              [class.guy-kpi--loading]="isLoading(k)"
              [attr.aria-busy]="isLoading(k) || null"
            >
              <ng-container *ngTemplateOutlet="kpiInner; context: { k }" />
            </div>
          }
        </div>
      }
    </div>

    <ng-template #kpiInner let-k="k">
      <div class="guy-kpi__top">
        <div class="guy-kpi__label">{{ k.label }}</div>
        @if (k.icon) {
          <mat-icon class="guy-kpi__icon">{{ k.icon }}</mat-icon>
        }
      </div>
      <div class="guy-kpi__body">
        <div class="guy-kpi__stage">
          <div class="guy-kpi__layer guy-kpi__layer--busy" [class.guy-kpi__layer--on]="isLoading(k)">
            <app-spinner [size]="22" tone="accent" label="Cargando" />
          </div>
          <div class="guy-kpi__layer guy-kpi__layer--data" [class.guy-kpi__layer--on]="!isLoading(k)">
            <div class="guy-kpi__value">{{ k.value }}</div>
            @if (k.details?.length) {
              <div class="guy-kpi__details">
                @for (d of k.details; track d.label) {
                  <div class="guy-kpi__detail">
                    <span>{{ d.label }}</span>
                    <strong>{{ d.value }}</strong>
                  </div>
                }
              </div>
            } @else if (k.hint) {
              <div class="guy-kpi__hint">{{ k.hint }}</div>
            }
          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 100%;
        min-width: 0;
      }
      .row {
        --bs-gutter-x: 0.5rem;
        margin-left: 0;
        margin-right: 0;
        max-width: 100%;
        align-items: flex-start;
      }
      .col-6,
      [class*='col-'] {
        display: flex;
        align-items: flex-start;
      }
      :host ::ng-deep .guy-kpi,
      :host ::ng-deep a.guy-kpi {
        width: 100%;
        height: auto;
      }
      .guy-kpi__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.35rem;
        flex-shrink: 0;
      }
      .guy-kpi__icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
        color: var(--guy-muted, #5f6f76);
        opacity: 0.85;
      }
      .guy-kpi__body {
        display: flex;
        flex-direction: column;
        margin-top: 0.25rem;
      }
      /* Capas en grid: la altura la marca el contenido (data), el spinner flota encima. */
      .guy-kpi__stage {
        display: grid;
        position: relative;
      }
      .guy-kpi__layer {
        grid-area: 1 / 1;
        transition: opacity 280ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .guy-kpi__layer--busy {
        z-index: 2;
        display: flex;
        align-items: center;
        min-height: 1.55em;
        opacity: 0;
        pointer-events: none;
      }
      .guy-kpi__layer--busy.guy-kpi__layer--on {
        opacity: 1;
      }
      .guy-kpi__layer--data {
        z-index: 1;
        opacity: 0;
      }
      .guy-kpi__layer--data.guy-kpi__layer--on {
        opacity: 1;
      }
      /* Loading: la data sigue ocupando alto (evita achicar/estirar la card). */
      .guy-kpi--loading .guy-kpi__layer--data {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
      .guy-kpi__hint {
        margin-top: 0.15rem;
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
        line-height: 1.25;
      }
      .guy-kpi--loading {
        pointer-events: none;
      }
      @media (max-width: 960px) {
        .row {
          --bs-gutter-x: 0.65rem;
          --bs-gutter-y: 0.65rem;
        }
        :host ::ng-deep .guy-kpi,
        :host ::ng-deep a.guy-kpi {
          padding: 0.85rem 0.9rem;
          border-radius: 14px;
          touch-action: manipulation;
        }
        :host ::ng-deep .guy-kpi__value {
          font-size: 1.35rem;
        }
      }
      .guy-kpi__details {
        margin-top: 0.4rem;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .guy-kpi__detail {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }
      .guy-kpi__detail strong {
        font-variant-numeric: tabular-nums;
        color: var(--guy-navy, #003366);
        font-weight: 700;
      }
      .guy-kpi--warn .guy-kpi__detail strong {
        color: #c62828;
      }
      a.guy-kpi--link {
        display: flex;
        flex-direction: column;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
        height: auto;
      }
      .guy-kpi--ok .guy-kpi__value {
        color: var(--guy-green, #2e7d32);
      }
      .guy-kpi--warn .guy-kpi__value {
        color: #c62828;
      }
      .guy-kpi--muted .guy-kpi__value {
        color: var(--guy-muted, #5f6f76);
      }
      @media (prefers-reduced-motion: reduce) {
        .guy-kpi__layer {
          transition: none !important;
        }
      }
    `,
  ],
})
export class KpiStripComponent {
  readonly items = input<KpiItem[]>([]);
  /** Spinner en todas las KPIs del strip. */
  readonly loading = input(false);

  isLoading(k: KpiItem): boolean {
    return this.loading() || !!k.loading;
  }

  onNavigate(ev: Event, k: KpiItem): void {
    if (this.isLoading(k)) ev.preventDefault();
  }
}
