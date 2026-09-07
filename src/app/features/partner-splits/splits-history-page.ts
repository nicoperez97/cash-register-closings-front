import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { SegmentTabsComponent } from '../../shared/components/filter-bar';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  EqualizePreview,
  PartnerSplitPreview,
  PartnerSplitRun,
  PartnerSplitsApiService,
} from './partner-splits-api.service';
import { downloadPartnerSplitPdf } from './split-pdf';
import { SplitRunDetailDialogComponent } from './split-run-detail-dialog';
import { formatMoney } from '../../shared/utils/money';
import { SplitsEqualizePanelComponent } from './splits-equalize-panel';

type SplitsTab = 'equalize' | 'history';

@Component({
  selector: 'app-splits-history-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    PageHeaderComponent,
    LoadingStateComponent,
    SegmentTabsComponent,
    SplitsEqualizePanelComponent,
  ],
  template: `
    <app-page-header
      title="Divisiones"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    <app-segment-tabs
      ariaLabel="Sección de divisiones"
      [fill]="true"
      [options]="tabs"
      [(value)]="tab"
    />

    <div class="tab-body" [hidden]="tab() !== 'equalize'">
      <app-splits-equalize-panel (applied)="onEqualizeApplied()" />
    </div>
    <div class="tab-body" [hidden]="tab() !== 'history'">
      <div class="hist-head">
        <p class="hint">
          Cada vez que aplicás una división o un equilibrado queda acá, con pases, montos y quién
          la hizo.
        </p>
        <a mat-stroked-button routerLink="/partner-splits">
          <mat-icon>call_split</mat-icon>
          Armar una nueva
        </a>
      </div>

      @if (loading()) {
        <app-loading-state label="Cargando divisiones" />
      } @else if (!rows().length) {
        <div class="hist-empty panel-card">
          <mat-icon>history</mat-icon>
          <p>Todavía no hay divisiones aplicadas.</p>
        </div>
      } @else {
        <div class="split-hist">
          @for (row of rows(); track row.id; let i = $index) {
            <article class="panel-card split-hist__card" [style.--i]="i">
              <div class="split-hist__main">
                <span
                  class="split-hist__badge"
                  [class.split-hist__badge--eq]="isEqualize(row)"
                  aria-hidden="true"
                >
                  <mat-icon>{{ isEqualize(row) ? 'balance' : 'call_split' }}</mat-icon>
                </span>
                <div>
                  <strong>{{ row.appliedAt | date: 'dd/MM/yyyy HH:mm' }}</strong>
                  <p>
                    {{ kindLabel(row) }} · {{ row.appliedByName || '—' }} ·
                    {{ row.transferCount }} pases · {{ money(row.distributedAmount) }}
                  </p>
                </div>
              </div>
              <div class="split-hist__actions">
                <button mat-stroked-button type="button" (click)="openDetail(row)">
                  <mat-icon>info</mat-icon>
                  Detalle
                </button>
                <button mat-stroked-button type="button" (click)="exportPdf(row)">
                  <mat-icon>picture_as_pdf</mat-icon>
                  PDF
                </button>
              </div>
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: `
    app-segment-tabs {
      margin: 0 0 0.85rem;
    }
    .tab-body {
      padding-top: 0.15rem;
    }
    .hist-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.65rem;
      margin-bottom: 0.85rem;
    }
    .hint {
      margin: 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
      line-height: 1.4;
      max-width: 40rem;
    }
    .hist-empty {
      display: grid;
      place-items: center;
      gap: 0.35rem;
      padding: 2rem 1rem;
      text-align: center;
      color: var(--guy-muted, #5f6f76);
    }
    .hist-empty mat-icon {
      font-size: 2rem;
      width: 2rem;
      height: 2rem;
      opacity: 0.55;
    }
    .hist-empty p {
      margin: 0;
    }
    .split-hist {
      display: grid;
      gap: 0.65rem;
    }
    .split-hist__card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.9rem 1rem;
      animation: hist-in 0.28s ease both;
      animation-delay: calc(var(--i, 0) * 35ms);
    }
    .split-hist__main {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }
    .split-hist__badge {
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 12%, #fff);
      color: var(--guy-green, #2e7d32);
      flex-shrink: 0;
    }
    .split-hist__badge--eq {
      background: color-mix(in srgb, var(--guy-navy, #003366) 12%, #fff);
      color: var(--guy-navy, #003366);
    }
    .split-hist__badge mat-icon {
      font-size: 1.2rem;
      width: 1.2rem;
      height: 1.2rem;
    }
    .split-hist__card p {
      margin: 0.25rem 0 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.86rem;
    }
    .split-hist__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      justify-content: flex-end;
    }
    @media (max-width: 640px) {
      .split-hist__card {
        flex-direction: column;
        align-items: stretch;
      }
      .split-hist__actions {
        justify-content: stretch;
      }
      .split-hist__actions button {
        flex: 1;
      }
    }
    @keyframes hist-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  `,
})
export class SplitsHistoryPage {
  readonly shops = inject(ShopContextService);
  private readonly api = inject(PartnerSplitsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  readonly rows = signal<PartnerSplitRun[]>([]);
  readonly loading = signal(true);
  readonly tab = signal<SplitsTab>('equalize');
  readonly tabs = [
    { id: 'equalize' as const, label: 'Equilibrar' },
    { id: 'history' as const, label: 'Historial' },
  ];

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        this.loading.set(false);
        return;
      }
      this.reloadRuns(shopId);
    });
  }

  isEqualize(row: PartnerSplitRun): boolean {
    return row.kind === 'equalize' || row.snapshot?.kind === 'equalize';
  }

  kindLabel(row: PartnerSplitRun): string {
    return this.isEqualize(row) ? 'Equilibrar' : 'División';
  }

  money(value: number): string {
    return formatMoney(value);
  }

  onEqualizeApplied(): void {
    const shopId = this.shops.selectedShopId();
    if (shopId) this.reloadRuns(shopId);
    // Quedamos en Equilibrar para ver saldos/objetivos actualizados; Historial se refresca abajo.
  }

  openDetail(row: PartnerSplitRun): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.getRun(shopId, row.id).subscribe({
      next: (full) => {
        if (!full.snapshot) {
          this.snack.open('Esa división no tiene detalle', 'OK', { duration: 3000 });
          return;
        }
        this.dialogTitle.track(
          this.dialog.open(SplitRunDetailDialogComponent, {
            width: '640px',
            maxWidth: '96vw',
            panelClass: 'guy-dialog',
            data: {
              run: full,
              shopName: this.shops.selectedShop()?.name ?? '',
            },
          }),
          full.kind === 'equalize' || full.snapshot?.kind === 'equalize'
            ? 'Detalle de equilibrado'
            : 'Detalle de división',
        );
      },
      error: () => this.snack.open('No se pudo abrir la división', 'OK', { duration: 3500 }),
    });
  }

  exportPdf(row: PartnerSplitRun): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.getRun(shopId, row.id).subscribe({
      next: async (full) => {
        const snap = full.snapshot as PartnerSplitPreview | EqualizePreview | undefined;
        if (!snap) {
          this.snack.open('Esa división no tiene detalle para PDF', 'OK', { duration: 3000 });
          return;
        }
        try {
          await downloadPartnerSplitPdf(
            snap,
            this.shops.selectedShop()?.name ?? 'Local',
            undefined,
            {
              appliedAt: full.appliedAt,
              appliedByName: full.appliedByName,
            },
          );
        } catch {
          this.snack.open('No se pudo generar el PDF', 'OK', { duration: 3500 });
        }
      },
      error: () => this.snack.open('No se pudo abrir la división', 'OK', { duration: 3500 }),
    });
  }

  private reloadRuns(shopId: string): void {
    this.loading.set(true);
    this.api.listRuns(shopId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar el historial', 'OK', { duration: 3500 });
      },
    });
  }
}
