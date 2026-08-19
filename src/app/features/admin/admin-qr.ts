import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { toDataURL } from 'qrcode';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { downloadCaptureRootPdf } from '../../shared/pdf/html-pdf';

const MAX_TEXT = 1200;
const MAX_DESC = 280;
const DESC_KEY = (shopId: string) => `crc.qr.desc.${shopId}`;

@Component({
  selector: 'app-admin-qr',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  template: `
    <div>
      <app-page-header
        title="QR"
        [subtitle]="shops.selectedShop()?.name ?? 'Armá un código a partir de un texto'"
      />

      <p class="qr-hint">
        Pegá un link, un Wi‑Fi o un texto. El PDF es un cartel: logo, nombre, QR y la descripción.
      </p>

      @if (shortcuts().length) {
        <div class="qr-shortcuts">
          @for (s of shortcuts(); track s.label) {
            <button type="button" mat-stroked-button (click)="useShortcut(s.url)">
              <mat-icon>{{ s.icon }}</mat-icon>
              {{ s.label }}
            </button>
          }
        </div>
      }

      <section class="panel-card qr-page">
        <div class="qr-page__fields">
          <mat-form-field appearance="outline" class="qr-page__field" subscriptSizing="dynamic">
            <mat-label>Texto del código</mat-label>
            <textarea
              matInput
              rows="5"
              maxlength="1200"
              [ngModel]="text()"
              (ngModelChange)="text.set($event)"
              placeholder="https://… o el texto que quieras"
            ></textarea>
            <mat-hint align="end">{{ text().length }} / {{ maxText }}</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="qr-page__field" subscriptSizing="dynamic">
            <mat-label>Descripción del cartel</mat-label>
            <textarea
              matInput
              rows="3"
              maxlength="280"
              [ngModel]="description()"
              (ngModelChange)="onDescriptionChange($event)"
              placeholder="Una frase para el PDF, por ejemplo: Escaneá para ver la carta"
            ></textarea>
            <mat-hint>Va debajo del QR en el PDF. No se imprime el link.</mat-hint>
            <mat-hint align="end">{{ description().length }} / {{ maxDesc }}</mat-hint>
          </mat-form-field>
        </div>

        <div class="qr-page__preview">
          @if (dataUrl(); as url) {
            <img class="qr-page__img" [src]="url" width="256" height="256" alt="Código QR" />
            <div class="qr-page__actions">
              <button mat-flat-button color="primary" type="button" (click)="download()">
                <mat-icon>download</mat-icon>
                PNG
              </button>
              <button mat-stroked-button type="button" (click)="printPdf()">
                <mat-icon>picture_as_pdf</mat-icon>
                PDF
              </button>
            </div>
          } @else {
            <div class="qr-page__empty">
              <mat-icon>qr_code_2</mat-icon>
              <span>{{ error() || 'Escribí un texto para ver el QR' }}</span>
            </div>
          }
        </div>
      </section>

      @if (dataUrl(); as url) {
        <div id="qr-pdf-sheet" class="qr-sheet" aria-hidden="true">
          <img class="qr-sheet__logo" [src]="shops.logoUrl()" alt="" />
          <p class="qr-sheet__name">{{ shops.selectedShop()?.name || 'Local' }}</p>
          <img class="qr-sheet__qr" [src]="url" width="280" height="280" alt="" />
          @if (description().trim()) {
            <p class="qr-sheet__desc">{{ description().trim() }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .qr-hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .qr-shortcuts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin: 0 0 0.9rem;
    }
    .qr-page {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr);
      gap: 1.25rem;
      align-items: start;
      padding: 1.1rem 1.15rem 1.2rem;
    }
    .qr-page__fields {
      display: grid;
      gap: 0.85rem;
    }
    .qr-page__field {
      width: 100%;
    }
    .qr-page__preview {
      display: grid;
      justify-items: center;
      gap: 0.85rem;
      padding: 1rem 0.75rem;
      border-radius: 16px;
      background: color-mix(in srgb, var(--guy-navy, #003366) 4%, #fff);
      border: 1px solid var(--guy-border, #d7e0d9);
    }
    .qr-page__img {
      width: 16rem;
      height: 16rem;
      object-fit: contain;
      image-rendering: pixelated;
      background: #fff;
      border-radius: 12px;
    }
    .qr-page__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem;
    }
    .qr-page__empty {
      display: grid;
      place-items: center;
      gap: 0.4rem;
      min-height: 12rem;
      color: var(--guy-muted, #5f6f76);
      text-align: center;
      font-size: 0.9rem;
    }
    .qr-page__empty mat-icon {
      font-size: 2.4rem;
      width: 2.4rem;
      height: 2.4rem;
      opacity: 0.55;
    }
    .qr-sheet {
      position: absolute;
      left: -12000px;
      top: 0;
      width: 595px;
      height: 842px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.35rem;
      padding: 3.4rem 2.6rem;
      background: #f6f3ec;
      color: #1c1c1c;
      font-family: Figtree, system-ui, sans-serif;
    }
    .qr-sheet__logo {
      width: 104px;
      height: 104px;
      object-fit: contain;
    }
    .qr-sheet__name {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: 0.01em;
      text-align: center;
      line-height: 1.15;
    }
    .qr-sheet__qr {
      width: 280px;
      height: 280px;
      object-fit: contain;
      display: block;
      background: #fff;
      image-rendering: pixelated;
    }
    .qr-sheet__desc {
      margin: 0.35rem 0 0;
      max-width: 26rem;
      text-align: center;
      font-size: 1.12rem;
      line-height: 1.45;
      color: #3d3d3d;
      white-space: pre-wrap;
    }
    @media (max-width: 800px) {
      .qr-page {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AdminQrPage {
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);

  readonly maxText = MAX_TEXT;
  readonly maxDesc = MAX_DESC;
  readonly text = signal('');
  readonly description = signal('');
  readonly dataUrl = signal<string | null>(null);
  readonly error = signal('');

  readonly accent = computed(() => qrDarkColor(this.shops.selectedShop()?.accentColor));

  readonly shortcuts = computed(() => {
    const shop = this.shops.selectedShop();
    if (!shop?.slug) return [];
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const slug = encodeURIComponent(shop.slug);
    const items: Array<{ label: string; url: string; icon: string }> = [];
    if (shop.publicAttendanceEnabled) {
      items.push({ label: 'Presentismo', url: `${origin}/p/${slug}`, icon: 'event_available' });
    }
    if (shop.publicServiceRulesEnabled) {
      items.push({ label: 'Normas de servicio', url: `${origin}/n/${slug}`, icon: 'menu_book' });
    }
    if (shop.menuEnabled) {
      items.push({ label: 'Carta', url: `${origin}/m/${slug}`, icon: 'restaurant_menu' });
    }
    if (shop.reservationsEnabled) {
      items.push({ label: 'Reservas', url: `${origin}/r/${slug}`, icon: 'table_restaurant' });
    }
    return items;
  });

  constructor() {
    effect(() => {
      const value = this.text();
      const color = this.accent();
      void this.render(value, color);
    });
    effect(() => {
      const id = this.shops.selectedShopId();
      if (!id || typeof localStorage === 'undefined') {
        this.description.set('');
        return;
      }
      this.description.set(localStorage.getItem(DESC_KEY(id)) ?? '');
    });
  }

  onDescriptionChange(value: string): void {
    const next = String(value ?? '').slice(0, MAX_DESC);
    this.description.set(next);
    const id = this.shops.selectedShopId();
    if (id && typeof localStorage !== 'undefined') {
      localStorage.setItem(DESC_KEY(id), next);
    }
  }

  useShortcut(url: string): void {
    this.text.set(url);
  }

  download(): void {
    const url = this.dataUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = this.fileName();
    a.click();
  }

  async printPdf(): Promise<void> {
    const url = this.dataUrl();
    if (!url) return;
    try {
      await downloadCaptureRootPdf(
        'qr-pdf-sheet',
        `${this.fileName().replace(/\.png$/i, '')}.pdf`,
        {
          widthPx: 595,
          background: '#f6f3ec',
          singlePage: true,
        },
      );
    } catch {
      this.snack.open('No se pudo generar el PDF', 'OK', { duration: 3000 });
    }
  }

  private fileName(): string {
    const shop = this.shops.selectedShop()?.name?.trim() || 'qr';
    const slug = shop
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `${slug || 'qr'}.png`;
  }

  private async render(raw: string, color: string): Promise<void> {
    const text = String(raw ?? '').trim();
    if (!text) {
      this.dataUrl.set(null);
      this.error.set('');
      return;
    }
    if (text.length > MAX_TEXT) {
      this.dataUrl.set(null);
      this.error.set('El texto es demasiado largo');
      return;
    }
    try {
      const url = await toDataURL(text, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: color || '#003366', light: '#ffffff' },
      });
      this.dataUrl.set(url);
      this.error.set('');
    } catch {
      this.dataUrl.set(null);
      this.error.set('No se pudo armar el QR con ese texto');
    }
  }
}

function qrDarkColor(raw?: string | null): string {
  const hex = String(raw ?? '').trim();
  const m = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '#111111';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.42 ? '#111111' : `#${h}`;
}
