import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { PartnerSplitRun, PartnerSplitsApiService } from './partner-splits-api.service';
import { downloadPartnerSplitPdf } from './split-pdf';
import { SplitRunDetailDialogComponent } from './split-run-detail-dialog';

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
  ],
  template: `
    <app-page-header
      title="Divisiones"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    <p class="hint">
      Cada vez que aplicás una división de socios queda acá, con pases, montos y quién la hizo.
      <a routerLink="/partner-splits">Armar una nueva</a>
    </p>

    @if (loading()) {
      <app-loading-state label="Cargando divisiones" />
    } @else if (!rows().length) {
      <p class="empty">Todavía no hay divisiones aplicadas.</p>
    } @else {
      <div class="split-hist">
        @for (row of rows(); track row.id) {
          <article class="panel-card split-hist__card">
            <div>
              <strong>{{ row.appliedAt | date: 'dd/MM/yyyy HH:mm' }}</strong>
              <p>
                {{ row.appliedByName || '—' }} · {{ row.transferCount }} pases ·
                {{ money(row.distributedAmount) }}
              </p>
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
  `,
  styles: `
    .hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
    }
    .empty {
      color: var(--guy-muted, #5f6f76);
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
    }
    .split-hist__card p {
      margin: 0.25rem 0 0;
      color: var(--guy-muted, #5f6f76);
    }
    .split-hist__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      justify-content: flex-end;
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

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      this.api.listRuns(shopId).subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar las divisiones', 'OK', { duration: 3500 });
        },
      });
    });
  }

  money(value: number): string {
    const n = Number(value || 0);
    const abs = Math.abs(n).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return n < 0 ? `-$${abs}` : `$${abs}`;
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
          'Detalle de división',
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
        const snap = full.snapshot;
        if (!snap) {
          this.snack.open('Esa división no tiene detalle', 'OK', { duration: 3000 });
          return;
        }
        try {
          await downloadPartnerSplitPdf(
            snap,
            this.shops.selectedShop()?.name ?? 'Local',
            `division-${String(row.appliedAt).slice(0, 10)}.pdf`,
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
}
