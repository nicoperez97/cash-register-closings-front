import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

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
}

@Component({
  selector: 'app-kpi-strip',
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="row g-2 guy-stagger">
      @for (k of items; track k.label) {
        <div class="col-6 col-md-3">
          @if (k.route) {
            <a
              class="guy-kpi guy-kpi--link"
              [class.guy-kpi--ok]="k.tone === 'ok'"
              [class.guy-kpi--warn]="k.tone === 'warn'"
              [class.guy-kpi--muted]="k.tone === 'muted'"
              [routerLink]="k.route"
            >
              <div class="guy-kpi__top">
                <div class="guy-kpi__label">{{ k.label }}</div>
                @if (k.icon) {
                  <mat-icon class="guy-kpi__icon">{{ k.icon }}</mat-icon>
                }
              </div>
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
            </a>
          } @else {
            <div
              class="guy-kpi"
              [class.guy-kpi--ok]="k.tone === 'ok'"
              [class.guy-kpi--warn]="k.tone === 'warn'"
              [class.guy-kpi--muted]="k.tone === 'muted'"
            >
              <div class="guy-kpi__top">
                <div class="guy-kpi__label">{{ k.label }}</div>
                @if (k.icon) {
                  <mat-icon class="guy-kpi__icon">{{ k.icon }}</mat-icon>
                }
              </div>
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
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .guy-kpi__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.35rem;
      }
      .guy-kpi__icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
        color: var(--guy-muted, #5f6f76);
        opacity: 0.85;
      }
      .guy-kpi__hint {
        margin-top: 0.15rem;
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
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
        display: block;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
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
    `,
  ],
})
export class KpiStripComponent {
  @Input() items: KpiItem[] = [];
}
