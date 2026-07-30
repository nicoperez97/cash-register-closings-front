import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface ChartSlice {
  label: string;
  value: number;
  /** Color opcional (hex/css). */
  color?: string;
}

export interface ChartPoint {
  label: string;
  value: number;
}

const PALETTE = [
  '#1d65a0',
  '#2e7d32',
  '#f27d16',
  '#6a4c93',
  '#c62828',
  '#00838f',
  '#ef6c00',
  '#455a64',
  '#ad1457',
  '#558b2f',
];

function colorAt(i: number, custom?: string): string {
  return custom || PALETTE[i % PALETTE.length];
}

/** Barras horizontales (top N / rubros / subrubros). */
@Component({
  selector: 'app-hbar-chart',
  imports: [DecimalPipe],
  template: `
    <div class="chart-card">
      @if (title) {
        <h3 class="chart-card__title">{{ title }}</h3>
      }
      @if (subtitle) {
        <p class="chart-card__sub">{{ subtitle }}</p>
      }
      @if (!items.length) {
        <p class="chart-card__empty">Sin datos en el período</p>
      } @else {
        <div class="hbar">
          @for (it of displayItems; track $index; let i = $index) {
            <div class="hbar__row">
              <div class="hbar__label" [title]="it.label">{{ it.label }}</div>
              <div class="hbar__track">
                <div
                  class="hbar__bar"
                  [style.width.%]="pct(it.value)"
                  [style.background]="colorAt(i, it.color)"
                ></div>
              </div>
              <div class="hbar__value">{{ it.value | number: '1.0-0' : 'es-AR' }}</div>
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
      .chart-card {
        background: #fff;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 12px;
        padding: 1rem 1.1rem 1.15rem;
        height: 100%;
      }
      .chart-card__title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 650;
        color: var(--guy-text, #1b2a33);
      }
      .chart-card__sub {
        margin: 0.2rem 0 0.85rem;
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }
      .chart-card__empty {
        margin: 1rem 0 0.25rem;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.85rem;
      }
      .hbar {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .hbar__row {
        display: grid;
        grid-template-columns: minmax(72px, 28%) 1fr auto;
        gap: 0.5rem;
        align-items: center;
      }
      .hbar__label {
        font-size: 0.72rem;
        color: var(--guy-text, #1b2a33);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hbar__track {
        height: 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--guy-border, #d7e0d9) 55%, #fff);
        overflow: hidden;
      }
      .hbar__bar {
        height: 100%;
        border-radius: 999px;
        min-width: 2px;
        transition: width 0.45s ease;
      }
      .hbar__value {
        font-size: 0.72rem;
        font-variant-numeric: tabular-nums;
        color: var(--guy-muted, #5f6f76);
        text-align: right;
        min-width: 3.5rem;
      }
    `,
  ],
})
export class HBarChartComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() items: ChartSlice[] = [];
  @Input() maxItems = 10;
  @Input() valueMode: 'raw' | 'money' = 'raw';

  get displayItems(): ChartSlice[] {
    return this.items.slice(0, this.maxItems);
  }

  pct(v: number): number {
    const max = Math.max(...this.displayItems.map((x) => x.value), 1);
    return Math.max(0, Math.min(100, (v / max) * 100));
  }

  colorAt = colorAt;
}

/** Donut / torta simple con SVG. */
@Component({
  selector: 'app-donut-chart',
  imports: [DecimalPipe],
  template: `
    <div class="chart-card">
      @if (title) {
        <h3 class="chart-card__title">{{ title }}</h3>
      }
      @if (subtitle) {
        <p class="chart-card__sub">{{ subtitle }}</p>
      }
      @if (!items.length || total <= 0) {
        <p class="chart-card__empty">Sin datos en el período</p>
      } @else {
        <div class="donut">
          <svg viewBox="0 0 120 120" class="donut__svg" aria-hidden="true">
            @for (seg of segments; track $index) {
              <circle
                cx="60"
                cy="60"
                r="40"
                fill="transparent"
                [attr.stroke]="seg.color"
                stroke-width="18"
                [attr.stroke-dasharray]="seg.dash"
                [attr.stroke-dashoffset]="seg.offset"
                transform="rotate(-90 60 60)"
              />
            }
            <circle cx="60" cy="60" r="28" fill="#fff" />
            <text x="60" y="58" text-anchor="middle" class="donut__center-label">Total</text>
            <text x="60" y="72" text-anchor="middle" class="donut__center-value">
              {{ total | number: '1.0-0' : 'es-AR' }}
            </text>
          </svg>
          <ul class="donut__legend">
            @for (it of displayItems; track $index; let i = $index) {
              <li>
                <span class="swatch" [style.background]="colorAt(i, it.color)"></span>
                <span class="name" [title]="it.label">{{ it.label }}</span>
                <span class="pct">{{ sharePct(it.value) }}%</span>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .chart-card {
        background: #fff;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 12px;
        padding: 1rem 1.1rem 1.15rem;
        height: 100%;
      }
      .chart-card__title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 650;
      }
      .chart-card__sub {
        margin: 0.2rem 0 0.85rem;
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }
      .chart-card__empty {
        margin: 1rem 0 0.25rem;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.85rem;
      }
      .donut {
        display: grid;
        grid-template-columns: minmax(140px, 42%) 1fr;
        gap: 0.75rem;
        align-items: center;
      }
      @media (max-width: 576px) {
        .donut {
          grid-template-columns: 1fr;
        }
      }
      .donut__svg {
        width: 100%;
        max-width: 180px;
        margin: 0 auto;
      }
      .donut__center-label {
        font-size: 7px;
        fill: #5f6f76;
      }
      .donut__center-value {
        font-size: 9px;
        font-weight: 700;
        fill: #1b2a33;
      }
      .donut__legend {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        max-height: 200px;
        overflow: auto;
      }
      .donut__legend li {
        display: grid;
        grid-template-columns: 10px 1fr auto;
        gap: 0.4rem;
        align-items: center;
        font-size: 0.72rem;
      }
      .swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
      }
      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pct {
        font-variant-numeric: tabular-nums;
        color: var(--guy-muted, #5f6f76);
      }
    `,
  ],
})
export class DonutChartComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() items: ChartSlice[] = [];
  @Input() maxItems = 8;

  get displayItems(): ChartSlice[] {
    const top = this.items.slice(0, this.maxItems);
    const rest = this.items.slice(this.maxItems);
    const restSum = rest.reduce((s, x) => s + x.value, 0);
    if (restSum > 0) return [...top, { label: 'Otros', value: restSum }];
    return top;
  }

  get total(): number {
    return this.items.reduce((s, x) => s + x.value, 0);
  }

  get segments(): Array<{ color: string; dash: string; offset: number }> {
    const circ = 2 * Math.PI * 40;
    let acc = 0;
    return this.displayItems.map((it, i) => {
      const len = this.total > 0 ? (it.value / this.total) * circ : 0;
      const offset = -acc + circ * 0.25; // start at top; we also rotate -90 in SVG
      // With rotate(-90), dashoffset should be -acc
      const seg = {
        color: colorAt(i, it.color),
        dash: `${len} ${circ - len}`,
        offset: -acc,
      };
      acc += len;
      return seg;
    });
  }

  sharePct(v: number): string {
    if (this.total <= 0) return '0';
    return ((v / this.total) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 });
  }

  colorAt = colorAt;
}

/** Línea / área de serie temporal. */
@Component({
  selector: 'app-line-chart',
  template: `
    <div class="chart-card">
      @if (title) {
        <h3 class="chart-card__title">{{ title }}</h3>
      }
      @if (subtitle) {
        <p class="chart-card__sub">{{ subtitle }}</p>
      }
      @if (!points.length) {
        <p class="chart-card__empty">Sin datos en el período</p>
      } @else {
        <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="line__svg" role="img">
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--guy-primary, #1d65a0)" stop-opacity="0.28" />
              <stop offset="100%" stop-color="var(--guy-primary, #1d65a0)" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          @for (g of gridYs; track g) {
            <line
              [attr.x1]="pad.l"
              [attr.x2]="w - pad.r"
              [attr.y1]="g"
              [attr.y2]="g"
              class="line__grid"
            />
          }
          <path [attr.d]="areaPath" fill="url(#areaFill)" />
          <path [attr.d]="linePath" class="line__path" fill="none" />
          @for (p of plotted; track $index) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.5" class="line__dot">
              <title>{{ p.label }}: {{ p.value }}</title>
            </circle>
          }
          @for (lab of xLabels; track lab.x) {
            <text [attr.x]="lab.x" [attr.y]="h - 6" text-anchor="middle" class="line__xlabel">
              {{ lab.text }}
            </text>
          }
          <text [attr.x]="pad.l" [attr.y]="14" class="line__ylabel">{{ maxLabel }}</text>
        </svg>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .chart-card {
        background: #fff;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 12px;
        padding: 1rem 1.1rem 0.75rem;
        height: 100%;
      }
      .chart-card__title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 650;
      }
      .chart-card__sub {
        margin: 0.2rem 0 0.5rem;
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }
      .chart-card__empty {
        margin: 1rem 0 0.25rem;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.85rem;
      }
      .line__svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .line__grid {
        stroke: color-mix(in srgb, var(--guy-border, #d7e0d9) 70%, transparent);
        stroke-width: 1;
      }
      .line__path {
        stroke: var(--guy-primary, #1d65a0);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .line__dot {
        fill: var(--guy-primary, #1d65a0);
      }
      .line__xlabel,
      .line__ylabel {
        font-size: 9px;
        fill: #5f6f76;
      }
    `,
  ],
})
export class LineChartComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() points: ChartPoint[] = [];

  readonly w = 560;
  readonly h = 180;
  readonly pad = { t: 20, r: 12, b: 28, l: 12 };

  get max(): number {
    return Math.max(...this.points.map((p) => p.value), 1);
  }

  get maxLabel(): string {
    return this.max.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  get plotted(): Array<{ x: number; y: number; label: string; value: number }> {
    const n = this.points.length;
    if (!n) return [];
    const iw = this.w - this.pad.l - this.pad.r;
    const ih = this.h - this.pad.t - this.pad.b;
    return this.points.map((p, i) => {
      const x = this.pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = this.pad.t + ih - (p.value / this.max) * ih;
      return { x, y, label: p.label, value: p.value };
    });
  }

  get linePath(): string {
    return this.plotted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }

  get areaPath(): string {
    const pts = this.plotted;
    if (!pts.length) return '';
    const baseY = this.h - this.pad.b;
    return (
      `M${pts[0].x},${baseY} ` +
      pts.map((p) => `L${p.x},${p.y}`).join(' ') +
      ` L${pts[pts.length - 1].x},${baseY} Z`
    );
  }

  get gridYs(): number[] {
    const ih = this.h - this.pad.t - this.pad.b;
    return [0, 0.5, 1].map((t) => this.pad.t + ih * (1 - t));
  }

  get xLabels(): Array<{ x: number; text: string }> {
    const pts = this.plotted;
    if (!pts.length) return [];
    const pick = new Set<number>([0, Math.floor((pts.length - 1) / 2), pts.length - 1]);
    if (pts.length > 10) {
      const step = Math.ceil(pts.length / 5);
      for (let i = 0; i < pts.length; i += step) pick.add(i);
    }
    return [...pick]
      .sort((a, b) => a - b)
      .map((i) => ({
        x: pts[i].x,
        text: this.shortDate(pts[i].label),
      }));
  }

  private shortDate(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso.slice(5, 10);
    return `${m[3]}/${m[2]}`;
  }
}
