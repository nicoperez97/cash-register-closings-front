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

const MAX_TEXT = 1200;

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
    <app-page-header
      title="QR"
      [subtitle]="shops.selectedShop()?.name ?? 'Armá un código a partir de un texto'"
    />

    <p class="qr-hint">Pegá un link, un Wi‑Fi, un mensaje o cualquier texto. El código se arma solo.</p>

    <section class="panel-card qr-page">
      <mat-form-field appearance="outline" class="qr-page__field" subscriptSizing="dynamic">
        <mat-label>Texto</mat-label>
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

      <div class="qr-page__preview">
        @if (dataUrl(); as url) {
          <img class="qr-page__img" [src]="url" alt="Código QR" />
          <div class="qr-page__actions">
            <button mat-flat-button color="primary" type="button" (click)="download()">
              <mat-icon>download</mat-icon>
              Descargar
            </button>
            <button mat-stroked-button type="button" (click)="print()">
              <mat-icon>print</mat-icon>
              Imprimir
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
  `,
  styles: `
    .qr-hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .qr-page {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr);
      gap: 1.25rem;
      align-items: start;
      padding: 1.1rem 1.15rem 1.2rem;
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
      width: min(100%, 16rem);
      height: auto;
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
    @media (max-width: 720px) {
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
  readonly text = signal('');
  readonly dataUrl = signal<string | null>(null);
  readonly error = signal('');

  readonly accent = computed(() => qrDarkColor(this.shops.selectedShop()?.accentColor));

  constructor() {
    effect(() => {
      const value = this.text();
      const color = this.accent();
      void this.render(value, color);
    });
  }

  download(): void {
    const url = this.dataUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = this.fileName();
    a.click();
  }

  print(): void {
    const url = this.dataUrl();
    if (!url) return;
    const win = window.open('', '_blank', 'noopener,width=480,height=640');
    if (!win) {
      this.snack.open('Permití ventanas emergentes para imprimir', 'OK', { duration: 3000 });
      return;
    }
    const shop = this.shops.selectedShop()?.name ?? 'QR';
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(shop)}</title>
<style>
  body{margin:0;display:grid;place-items:center;min-height:100vh;font-family:Segoe UI,sans-serif}
  img{width:min(90vw,22rem);height:auto}
</style></head><body><img src="${url}" alt="QR" /></body></html>`);
    win.document.close();
    win.focus();
    win.onload = () => {
      win.print();
    };
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
