import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { menuPriceOf } from './menu-display';

export type MenuPriceSlot = {
  id: string;
  itemId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  color?: string;
};

export type PriceSlotMenuItem = {
  id: string;
  name: string;
  sectionName: string;
  price?: number | null;
  priceLabel?: string | null;
};

/** px de canvas por punto PDF. Fijo: no depende del tamaño de pantalla. */
const RENDER_SCALE = 1.5;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

function newSlotId(): string {
  return `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHex(raw: string | null | undefined): string | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toLowerCase()}` : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

@Component({
  selector: 'app-menu-price-slots-editor',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <section class="slots">
      <div class="slots__head">
        <div>
          <h3>Precios en carta física</h3>
          <p>
            Arrastrá sobre el PDF para marcar dónde va cada precio. Zoom con la rueda; mové con el
            modo mano o clic medio. Vinculá un ítem, ajustá tamaño y color, y descargá el PDF.
          </p>
        </div>
        <div class="slots__head-actions">
          <button mat-stroked-button type="button" [disabled]="!pageCount()" (click)="prevPage()">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <span class="slots__page">{{ pageIndex() + 1 }} / {{ pageCount() || '—' }}</span>
          <button mat-stroked-button type="button" [disabled]="!pageCount()" (click)="nextPage()">
            <mat-icon>chevron_right</mat-icon>
          </button>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!slots().length || downloading()"
            (click)="download.emit()"
          >
            <mat-icon>download</mat-icon>
            {{ downloading() ? 'Generando…' : 'Descargar PDF con precios' }}
          </button>
        </div>
      </div>

      @if (loadError()) {
        <p class="slots__error">{{ loadError() }}</p>
      } @else if (loading()) {
        <p class="slots__hint">Cargando PDF…</p>
      }

      @if (pickMode()) {
        <p class="slots__pick-hint">Tocá el PDF para muestrear el color de esa zona. Esc cancela.</p>
      }

      <div class="slots__body">
        <div class="slots__viewport-col">
          <div class="slots__zoom-bar">
            <button
              mat-stroked-button
              type="button"
              [class.slots__tool--on]="tool() === 'pan'"
              matTooltip="Mover (también clic medio o Alt+arrastrar)"
              (click)="tool.set(tool() === 'pan' ? 'draw' : 'pan')"
            >
              <mat-icon>pan_tool</mat-icon>
            </button>
            <button
              mat-stroked-button
              type="button"
              [class.slots__tool--on]="tool() === 'draw'"
              matTooltip="Dibujar caja"
              (click)="tool.set('draw')"
            >
              <mat-icon>crop_free</mat-icon>
            </button>
            <span class="slots__zoom-sep"></span>
            <button
              mat-stroked-button
              type="button"
              [disabled]="!pageCount()"
              matTooltip="Alejar"
              (click)="zoomBy(1 / 1.2)"
            >
              <mat-icon>remove</mat-icon>
            </button>
            <span class="slots__zoom-label">{{ zoomPct() }}%</span>
            <button
              mat-stroked-button
              type="button"
              [disabled]="!pageCount()"
              matTooltip="Acercar"
              (click)="zoomBy(1.2)"
            >
              <mat-icon>add</mat-icon>
            </button>
            <button
              mat-stroked-button
              type="button"
              [disabled]="!pageCount()"
              matTooltip="Ajustar a la ventana"
              (click)="fitToView()"
            >
              <mat-icon>fit_screen</mat-icon>
              Ajustar
            </button>
          </div>

          <div
            class="slots__viewport"
            [class.slots__viewport--pick]="pickMode()"
            [class.slots__viewport--pan]="tool() === 'pan' || panning()"
            #viewport
            (wheel)="onWheel($event)"
            (pointerdown)="onPointerDown($event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
            (pointerleave)="onPointerUp($event)"
            (pointercancel)="onPointerUp($event)"
          >
            <div
              class="slots__stage"
              [style.width.px]="canvasCssW()"
              [style.height.px]="canvasCssH()"
              [style.transform]="stageTransform()"
            >
              <canvas #canvas class="slots__canvas"></canvas>
              @for (slot of pageSlots(); track slot.id) {
                <button
                  type="button"
                  class="slots__box"
                  [class.slots__box--active]="slot.id === selectedId()"
                  [style.left.px]="cssRect(slot).left"
                  [style.top.px]="cssRect(slot).top"
                  [style.width.px]="cssRect(slot).width"
                  [style.height.px]="cssRect(slot).height"
                  [style.font-size.px]="previewFontPx(slot)"
                  [style.color]="slotColor(slot)"
                  [style.border-color]="slotColor(slot)"
                  [style.background]="slotBg(slot)"
                  [style.justify-content]="alignFlex(slot.align)"
                  (pointerdown)="selectSlot(slot.id, $event)"
                >
                  {{ previewLabel(slot) }}
                </button>
              }
              @if (draftCss(); as d) {
                <div
                  class="slots__box slots__box--draft"
                  [style.left.px]="d.left"
                  [style.top.px]="d.top"
                  [style.width.px]="d.width"
                  [style.height.px]="d.height"
                ></div>
              }
            </div>
          </div>
        </div>

        <aside class="slots__side">
          <p class="slots__hint">{{ slots().length }} caja(s). Tocá una para editar.</p>
          @if (selected(); as sel) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="slots__field">
              <mat-label>Ítem</mat-label>
              <mat-select
                [ngModel]="sel.itemId"
                (ngModelChange)="updateSelected({ itemId: $event })"
              >
                <mat-option value="">— Sin vincular —</mat-option>
                @for (group of itemGroups(); track group.name) {
                  <mat-optgroup [label]="group.name">
                    @for (it of group.items; track it.id) {
                      <mat-option [value]="it.id">{{ it.name }}</mat-option>
                    }
                  </mat-optgroup>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="slots__field">
              <mat-label>Tamaño letra</mat-label>
              <input
                matInput
                type="number"
                min="6"
                max="96"
                step="0.5"
                [ngModel]="sel.fontSize ?? 12"
                (ngModelChange)="onFontSizeChange($event)"
              />
            </mat-form-field>
            <p class="slots__hint slots__hint--tight">
              Si la caja es chica, el PDF achica la letra para que entre. Agrandá la caja si querés
              {{ sel.fontSize ?? 12 }} pt.
            </p>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="slots__field">
              <mat-label>Alineación</mat-label>
              <mat-select
                [ngModel]="sel.align ?? 'center'"
                (ngModelChange)="updateSelected({ align: $event })"
              >
                <mat-option value="left">Izquierda</mat-option>
                <mat-option value="center">Centro</mat-option>
                <mat-option value="right">Derecha</mat-option>
              </mat-select>
            </mat-form-field>
            <div class="slots__color-row">
              <label class="slots__color-swatch" [matTooltip]="'Color del precio'">
                <input
                  type="color"
                  [ngModel]="slotColor(sel)"
                  (ngModelChange)="onColorChange($event)"
                />
              </label>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="slots__field">
                <mat-label>Color</mat-label>
                <input
                  matInput
                  maxlength="7"
                  [ngModel]="slotColor(sel)"
                  (ngModelChange)="onColorChange($event)"
                  placeholder="#1c3a5d"
                />
              </mat-form-field>
            </div>
            <div class="slots__color-actions">
              <button
                mat-stroked-button
                type="button"
                [class.slots__pick-btn--on]="pickMode()"
                [matTooltip]="
                  eyeDropperSupported()
                    ? 'Abrí el gotero y tocá cualquier color de la pantalla'
                    : 'Tocá el PDF para tomar el color de esa zona'
                "
                (click)="startColorPick()"
              >
                <mat-icon>colorize</mat-icon>
                Detectar color
              </button>
              @if (pickMode()) {
                <button mat-button type="button" (click)="cancelColorPick()">Cancelar</button>
              }
            </div>
            <button mat-stroked-button color="warn" type="button" (click)="removeSelected()">
              <mat-icon>delete</mat-icon>
              Quitar caja
            </button>
          } @else {
            <p class="slots__hint">
              Arrastrá en el PDF para crear una caja. Rueda = zoom · mano / clic medio = mover.
            </p>
          }
        </aside>
      </div>
    </section>
  `,
  styles: `
    .slots {
      margin-top: 1rem;
      padding: 1rem;
      border: 1px solid color-mix(in srgb, var(--guy-border, #ccc) 80%, transparent);
      border-radius: 12px;
      background: color-mix(in srgb, var(--guy-surface, #fff) 92%, #f4f6f8);
    }
    .slots__head {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }
    .slots__head h3 {
      margin: 0 0 0.25rem;
      font-size: 1.05rem;
    }
    .slots__head p {
      margin: 0;
      max-width: 40rem;
      color: var(--guy-muted, #666);
      font-size: 0.9rem;
    }
    .slots__head-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      align-items: center;
    }
    .slots__page {
      min-width: 3.5rem;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .slots__body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 240px;
      gap: 0.75rem;
    }
    @media (max-width: 900px) {
      .slots__body {
        grid-template-columns: 1fr;
      }
    }
    .slots__viewport-col {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      min-width: 0;
    }
    .slots__zoom-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      align-items: center;
    }
    .slots__zoom-sep {
      width: 1px;
      height: 1.4rem;
      background: color-mix(in srgb, var(--guy-border, #ccc) 80%, transparent);
      margin: 0 0.15rem;
    }
    .slots__zoom-label {
      min-width: 3.2rem;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-size: 0.85rem;
      font-weight: 650;
    }
    .slots__tool--on {
      border-color: #1565c0 !important;
      color: #1565c0;
    }
    .slots__viewport {
      position: relative;
      overflow: hidden;
      height: min(70vh, 900px);
      border-radius: 8px;
      background: #2a2a2a;
      touch-action: none;
      user-select: none;
      cursor: crosshair;
    }
    .slots__viewport--pan {
      cursor: grab;
    }
    .slots__viewport--pan:active {
      cursor: grabbing;
    }
    .slots__viewport--pick {
      cursor: crosshair;
    }
    .slots__viewport--pick .slots__box {
      pointer-events: none;
    }
    .slots__stage {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 0 0;
      will-change: transform;
    }
    .slots__canvas {
      display: block;
      width: 100%;
      height: 100%;
      /* Nunca max-width:100% — desalineaba las cajas al achicar la ventana. */
    }
    .slots__box {
      position: absolute;
      margin: 0;
      padding: 0 2px;
      border: 1.5px solid #1c3a5d;
      background: color-mix(in srgb, #1c3a5d 18%, transparent);
      color: #1c3a5d;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-sizing: border-box;
      overflow: hidden;
      white-space: nowrap;
    }
    .slots__box--active {
      outline: 2px solid #c62828;
      outline-offset: 1px;
      z-index: 2;
    }
    .slots__box--draft {
      border-style: dashed;
      pointer-events: none;
    }
    .slots__side {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .slots__field {
      width: 100%;
    }
    .slots__hint {
      margin: 0;
      font-size: 0.85rem;
      color: var(--guy-muted, #666);
    }
    .slots__hint--tight {
      margin-top: -0.25rem;
      font-size: 0.78rem;
      line-height: 1.35;
    }
    .slots__pick-hint {
      margin: 0 0 0.5rem;
      padding: 0.4rem 0.65rem;
      border-radius: 8px;
      background: color-mix(in srgb, #1565c0 14%, transparent);
      color: #0d47a1;
      font-size: 0.85rem;
    }
    .slots__color-row {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }
    .slots__color-swatch {
      flex: 0 0 auto;
      width: 48px;
      height: 48px;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--guy-border, #ccc) 80%, transparent);
      cursor: pointer;
      margin-top: 2px;
    }
    .slots__color-swatch input[type='color'] {
      display: block;
      width: 150%;
      height: 150%;
      margin: -25%;
      border: 0;
      padding: 0;
      cursor: pointer;
      background: transparent;
    }
    .slots__color-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      align-items: center;
    }
    .slots__pick-btn--on {
      border-color: #1565c0;
      color: #1565c0;
    }
    .slots__error {
      color: #c62828;
      margin: 0 0 0.5rem;
    }
  `,
})
export class MenuPriceSlotsEditorComponent implements OnDestroy {
  private readonly http = inject(HttpClient);

  readonly shopId = input.required<string>();
  readonly menuId = input.required<string>();
  readonly items = input.required<PriceSlotMenuItem[]>();
  readonly slots = input.required<MenuPriceSlot[]>();
  readonly downloading = input(false);

  readonly slotsChange = output<MenuPriceSlot[]>();
  readonly download = output<void>();

  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewport') private viewportRef?: ElementRef<HTMLDivElement>;

  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly pageIndex = signal(0);
  readonly pageCount = signal(0);
  readonly selectedId = signal<string | null>(null);
  readonly draftCss = signal<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  readonly pickMode = signal(false);
  readonly eyeDropperSupported = signal(
    typeof window !== 'undefined' && 'EyeDropper' in window,
  );
  readonly tool = signal<'draw' | 'pan'>('draw');
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly panning = signal(false);
  readonly canvasCssW = signal(0);
  readonly canvasCssH = signal(0);

  /** Escala fija pt→px del render (no cambia al redimensionar). */
  readonly renderScale = RENDER_SCALE;

  readonly zoomPct = computed(() => Math.round(this.zoom() * 100));
  readonly stageTransform = computed(
    () => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`,
  );

  private pdfDoc: import('pdfjs-dist').PDFDocumentProxy | null = null;
  private pageSizePt = { width: 595.28, height: 841.89 };
  private drag: { x0: number; y0: number } | null = null;
  private panDrag: { x0: number; y0: number; panX0: number; panY0: number } | null = null;
  private renderToken = 0;
  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && this.pickMode()) this.cancelColorPick();
  };

  readonly pageSlots = computed(() =>
    this.slots().filter((s) => s.page === this.pageIndex()),
  );

  readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? this.slots().find((s) => s.id === id) ?? null : null;
  });

  readonly itemGroups = computed(() => {
    const map = new Map<string, PriceSlotMenuItem[]>();
    for (const it of this.items()) {
      const list = map.get(it.sectionName) ?? [];
      list.push(it);
      map.set(it.sectionName, list);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  });

  private readonly itemsById = computed(() => {
    const m = new Map<string, PriceSlotMenuItem>();
    for (const it of this.items()) m.set(it.id, it);
    return m;
  });

  constructor() {
    effect(() => {
      const shopId = this.shopId();
      const menuId = this.menuId();
      if (!shopId || !menuId) return;
      void this.loadPdf(shopId, menuId);
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
    }
    void this.pdfDoc?.destroy();
    this.pdfDoc = null;
  }

  slotColor(slot: MenuPriceSlot): string {
    return normalizeHex(slot.color) ?? '#1c3a5d';
  }

  slotBg(slot: MenuPriceSlot): string {
    const c = this.slotColor(slot);
    return `color-mix(in srgb, ${c} 18%, transparent)`;
  }

  previewFontPx(slot: MenuPriceSlot): number {
    const pt = slot.fontSize && slot.fontSize > 0 ? slot.fontSize : 12;
    const scale = this.renderScale;
    const byHeight = slot.height * scale * 0.92;
    return Math.max(6, Math.min(pt * scale, byHeight || pt * scale));
  }

  alignFlex(align?: MenuPriceSlot['align']): string {
    if (align === 'left') return 'flex-start';
    if (align === 'right') return 'flex-end';
    return 'center';
  }

  previewLabel(slot: MenuPriceSlot): string {
    const it = this.itemsById().get(slot.itemId);
    if (!it) return '¿?';
    return menuPriceOf(it) || it.name.slice(0, 8);
  }

  /** Coordenadas en px del stage (= canvas bitmap), ancladas al PDF. */
  cssRect(slot: MenuPriceSlot): { left: number; top: number; width: number; height: number } {
    const s = this.renderScale;
    const pageH = this.pageSizePt.height;
    return {
      left: slot.x * s,
      top: (pageH - slot.y - slot.height) * s,
      width: slot.width * s,
      height: slot.height * s,
    };
  }

  selectSlot(id: string, ev: PointerEvent): void {
    ev.stopPropagation();
    ev.preventDefault();
    if (this.pickMode() || this.tool() === 'pan') return;
    this.selectedId.set(id);
  }

  updateSelected(patch: Partial<MenuPriceSlot>): void {
    const id = this.selectedId();
    if (!id) return;
    this.slotsChange.emit(
      this.slots().map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  onFontSizeChange(raw: string | number): void {
    const n = Number(raw);
    const fontSize =
      Number.isFinite(n) && n >= 6 ? Math.min(96, Math.round(n * 10) / 10) : 12;
    this.updateSelected({ fontSize });
  }

  onColorChange(raw: string): void {
    const hex = normalizeHex(raw);
    if (!hex) return;
    this.updateSelected({ color: hex });
  }

  async startColorPick(): Promise<void> {
    if (!this.selectedId()) return;
    if (this.eyeDropperSupported()) {
      try {
        const EyeDropperCtor = (
          window as unknown as {
            EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> };
          }
        ).EyeDropper;
        const result = await new EyeDropperCtor().open();
        const hex = normalizeHex(result.sRGBHex);
        if (hex) this.updateSelected({ color: hex });
        return;
      } catch {
        // canceló → modo clic en PDF
      }
    }
    this.pickMode.set(true);
  }

  cancelColorPick(): void {
    this.pickMode.set(false);
  }

  removeSelected(): void {
    const id = this.selectedId();
    if (!id) return;
    this.slotsChange.emit(this.slots().filter((s) => s.id !== id));
    this.selectedId.set(null);
    this.cancelColorPick();
  }

  prevPage(): void {
    if (this.pageIndex() <= 0) return;
    this.pageIndex.update((n) => n - 1);
    void this.renderPage(true);
  }

  nextPage(): void {
    if (this.pageIndex() >= this.pageCount() - 1) return;
    this.pageIndex.update((n) => n + 1);
    void this.renderPage(true);
  }

  zoomBy(factor: number): void {
    const vp = this.viewportRef?.nativeElement;
    if (!vp) {
      this.zoom.set(clamp(this.zoom() * factor, ZOOM_MIN, ZOOM_MAX));
      return;
    }
    const r = vp.getBoundingClientRect();
    this.zoomAt(r.width / 2, r.height / 2, this.zoom() * factor);
  }

  fitToView(): void {
    const vp = this.viewportRef?.nativeElement;
    const cw = this.canvasCssW();
    const ch = this.canvasCssH();
    if (!vp || !cw || !ch) return;
    const pad = 24;
    const z = clamp(
      Math.min((vp.clientWidth - pad) / cw, (vp.clientHeight - pad) / ch),
      ZOOM_MIN,
      ZOOM_MAX,
    );
    this.zoom.set(z);
    this.panX.set((vp.clientWidth - cw * z) / 2);
    this.panY.set((vp.clientHeight - ch * z) / 2);
  }

  onWheel(ev: WheelEvent): void {
    if (!this.pdfDoc) return;
    ev.preventDefault();
    const vp = this.viewportRef?.nativeElement;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const my = ev.clientY - r.top;
    const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomAt(mx, my, this.zoom() * factor);
  }

  onPointerDown(ev: PointerEvent): void {
    if (this.pickMode()) {
      ev.preventDefault();
      this.sampleColorAt(ev);
      return;
    }
    const wantPan =
      this.tool() === 'pan' || ev.button === 1 || ev.altKey || ev.buttons === 4;
    if (wantPan) {
      ev.preventDefault();
      this.panDrag = {
        x0: ev.clientX,
        y0: ev.clientY,
        panX0: this.panX(),
        panY0: this.panY(),
      };
      this.panning.set(true);
      this.viewportRef?.nativeElement.setPointerCapture?.(ev.pointerId);
      return;
    }
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest('.slots__box:not(.slots__box--draft)')) return;
    if (!this.pdfDoc) return;
    const { x, y } = this.clientToStage(ev);
    this.drag = { x0: x, y0: y };
    this.viewportRef?.nativeElement.setPointerCapture?.(ev.pointerId);
    this.draftCss.set({ left: x, top: y, width: 0, height: 0 });
    this.selectedId.set(null);
  }

  onPointerMove(ev: PointerEvent): void {
    if (this.panDrag) {
      const dx = ev.clientX - this.panDrag.x0;
      const dy = ev.clientY - this.panDrag.y0;
      this.panX.set(this.panDrag.panX0 + dx);
      this.panY.set(this.panDrag.panY0 + dy);
      return;
    }
    if (this.pickMode() || !this.drag) return;
    const { x, y } = this.clientToStage(ev);
    const left = Math.min(this.drag.x0, x);
    const top = Math.min(this.drag.y0, y);
    this.draftCss.set({
      left,
      top,
      width: Math.abs(x - this.drag.x0),
      height: Math.abs(y - this.drag.y0),
    });
  }

  onPointerUp(_ev: PointerEvent): void {
    if (this.panDrag) {
      this.panDrag = null;
      this.panning.set(false);
      return;
    }
    if (this.pickMode() || !this.drag) return;
    const draft = this.draftCss();
    this.drag = null;
    this.draftCss.set(null);
    if (!draft || draft.width < 8 || draft.height < 6) return;
    const s = this.renderScale;
    const pageH = this.pageSizePt.height;
    const slot: MenuPriceSlot = {
      id: newSlotId(),
      itemId: '',
      page: this.pageIndex(),
      x: draft.left / s,
      y: pageH - draft.top / s - draft.height / s,
      width: draft.width / s,
      height: draft.height / s,
      fontSize: 12,
      align: 'center',
      color: '#1c3a5d',
    };
    this.slotsChange.emit([...this.slots(), slot]);
    this.selectedId.set(slot.id);
  }

  private zoomAt(viewX: number, viewY: number, nextZoom: number): void {
    const oldZ = this.zoom();
    const newZ = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
    if (newZ === oldZ) return;
    const stageX = (viewX - this.panX()) / oldZ;
    const stageY = (viewY - this.panY()) / oldZ;
    this.zoom.set(newZ);
    this.panX.set(viewX - stageX * newZ);
    this.panY.set(viewY - stageY * newZ);
  }

  private clientToStage(ev: PointerEvent): { x: number; y: number } {
    const vp = this.viewportRef?.nativeElement;
    if (!vp) return { x: 0, y: 0 };
    const r = vp.getBoundingClientRect();
    const z = this.zoom() || 1;
    return {
      x: (ev.clientX - r.left - this.panX()) / z,
      y: (ev.clientY - r.top - this.panY()) / z,
    };
  }

  private sampleColorAt(ev: PointerEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const { x: stageX, y: stageY } = this.clientToStage(ev);
    const x = Math.floor(stageX);
    const y = Math.floor(stageY);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    this.updateSelected({ color: rgbToHex(r, g, b) });
    this.cancelColorPick();
  }

  private async loadPdf(shopId: string, menuId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.pageIndex.set(0);
    this.cancelColorPick();
    try {
      await this.pdfDoc?.destroy();
      this.pdfDoc = null;
      const url = `${environment.apiUrl}/shops/${shopId}/menu/${encodeURIComponent(menuId)}/source`;
      const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
      const buf = await blob.arrayBuffer();
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      this.pdfDoc = await pdfjs.getDocument({ data: buf }).promise;
      this.pageCount.set(this.pdfDoc.numPages);
      await this.renderPage(true);
    } catch (err) {
      this.loadError.set(
        'No se pudo cargar el PDF físico. Guardá la carta y volvé a subir el archivo.',
      );
      this.pageCount.set(0);
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  private async renderPage(fitAfter = false): Promise<void> {
    const doc = this.pdfDoc;
    const canvas = this.canvasRef?.nativeElement;
    if (!doc || !canvas) return;
    const token = ++this.renderToken;
    const page = await doc.getPage(this.pageIndex() + 1);
    if (token !== this.renderToken) return;
    const base = page.getViewport({ scale: 1 });
    this.pageSizePt = { width: base.width, height: base.height };
    const scale = RENDER_SCALE;
    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const w = Math.floor(viewport.width);
    const h = Math.floor(viewport.height);
    canvas.width = w;
    canvas.height = h;
    this.canvasCssW.set(w);
    this.canvasCssH.set(h);
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (fitAfter) {
      // Esperar un frame para que el viewport tenga tamaño real.
      requestAnimationFrame(() => this.fitToView());
    }
  }
}
