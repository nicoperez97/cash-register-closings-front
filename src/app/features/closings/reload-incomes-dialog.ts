import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ClosingsApiService,
  ReloadIncomeItem,
  ReloadIncomesPreview,
} from './closings-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { HelpDialogComponent } from '../../shared/components/help-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { hasShopPermission, Permission } from '../../core/auth/auth.models';
import { topicById } from '../../core/help/module-help';

export interface ReloadIncomesDialogData {
  shopId: string;
  shopName: string;
}

@Component({
  selector: 'app-reload-incomes-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>sync</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Volver a procesar</strong>
        <span>{{ data.shopName }}</span>
      </span>
      <button
        type="button"
        mat-icon-button
        class="xl-help"
        matTooltip="Cómo funciona"
        aria-label="Ayuda de Volver a procesar"
        (click)="openHelp()"
      >
        <mat-icon>info_outline</mat-icon>
      </button>
    </h2>

    <mat-dialog-content>
      @if (busy() && !preview()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
        <p class="xl-lead">Mirando los cierres y el libro…</p>
      }

      @if (preview(); as data) {
        <p class="xl-lead">
          Compará cada ingreso del cierre con el libro. Marcá qué querés cargar.
        </p>

        <div class="xl-stats">
          <div class="xl-stat">
            <strong>{{ data.closingsCount }}</strong>
            <span>cierres</span>
          </div>
          <div class="xl-stat xl-stat--ok">
            <strong>{{ data.counts.new }}</strong>
            <span>nuevos</span>
          </div>
          <div class="xl-stat">
            <strong>{{ data.counts.exists }}</strong>
            <span>ya están</span>
          </div>
          <div class="xl-stat" [class.xl-stat--warn]="data.counts.mismatch > 0">
            <strong>{{ data.counts.mismatch }}</strong>
            <span>distintos</span>
          </div>
        </div>

        <div class="xl-legend">
          <span class="xl-pill xl-pill--new">Nuevo</span>
          falta en el libro
          <span class="xl-pill xl-pill--mis">No coincide</span>
          el cierre y el libro tienen otro importe
        </div>

        <div class="xl-toolbar">
          <button mat-stroked-button type="button" (click)="selectNews()" [disabled]="busy()">
            Solo nuevos
          </button>
          <button mat-stroked-button type="button" (click)="selectReview()" [disabled]="busy()">
            Todos
          </button>
          <button mat-stroked-button type="button" (click)="selectNone()" [disabled]="busy()">
            Ninguno
          </button>
        </div>

        <div class="xl-list" role="list">
          @for (row of visibleItems(); track itemKey(row)) {
            <div
              class="xl-item"
              role="listitem"
              [class.xl-item--on]="isSelected(row)"
              [class.xl-item--off]="!canSelect(row)"
              [class.xl-item--mis]="row.status === 'mismatch'"
              (click)="toggleRow(row)"
            >
              <div class="xl-item__check" (click)="$event.stopPropagation()">
                @if (canSelect(row)) {
                  <mat-checkbox [checked]="isSelected(row)" (change)="toggleRow(row)" />
                }
              </div>
              <div class="xl-item__body">
                <div class="xl-item__top">
                  <strong>{{ row.toAccountName }}</strong>
                  <span class="xl-pill" [class.xl-pill--new]="row.status === 'new'" [class.xl-pill--mis]="row.status === 'mismatch'">
                    {{ statusLabel(row) }}
                  </span>
                </div>
                <div class="xl-item__meta">{{ formatDate(row.businessDate) }}</div>
                <div class="xl-item__amts">
                  <span>Cierre <b>{{ money(row.amount) }}</b></span>
                  <span>
                    Libro
                    <b>{{ row.status === 'new' ? '—' : money(row.existingAmount) }}</b>
                  </span>
                </div>
              </div>
            </div>
          } @empty {
            <p class="xl-empty">No hay ingresos para revisar.</p>
          }
        </div>
        @if (reviewItems().length > 80) {
          <p class="xl-note">Se muestran 80 de {{ reviewItems().length }}.</p>
        }

        <h3 class="xl-block__title">Cómo quedan los saldos</h3>
        @if (changedBalances().length) {
          <div class="xl-bals">
            @for (row of changedBalances(); track row.accountId) {
              <div class="xl-bal">
                <strong>{{ row.name }}</strong>
                <div class="xl-bal__row">
                  <span>Hoy {{ money(row.current) }}</span>
                  <span>Entra {{ money(row.incoming) }}</span>
                  <span
                    [class.xl-amt--neg]="row.projected < 0"
                    [class.xl-amt--pos]="row.projected > 0"
                  >
                    Queda {{ money(row.projected) }}
                  </span>
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="xl-empty">Con lo marcado, los saldos no cambian.</p>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy() || selectedCount() === 0"
        (click)="commit()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Cargando…">
          <mat-icon>sync</mat-icon>
          Cargar {{ selectedCount() }}
          {{ selectedCount() === 1 ? 'ingreso' : 'ingresos' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host { display: block; }
      h2[mat-dialog-title] {
        align-items: center;
      }
      .xl-help {
        margin-left: auto;
        color: var(--guy-muted, #5f6f76);
      }
      .xl-lead {
        margin: 0 0 0.85rem;
        font-size: 0.92rem;
        line-height: 1.4;
        color: var(--guy-muted, #5f6f76);
      }
      .xl-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem;
        margin-bottom: 0.85rem;
      }
      .xl-stat {
        display: grid;
        gap: 0.05rem;
        padding: 0.55rem 0.7rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #ddd);
        background: var(--guy-card, #fff);
      }
      .xl-stat strong { font-size: 1.15rem; }
      .xl-stat span {
        font-size: 0.75rem;
        color: var(--guy-muted, #667);
      }
      .xl-stat--ok {
        border-color: color-mix(in srgb, #2e7d32 40%, var(--guy-border, #ddd));
        background: color-mix(in srgb, #2e7d32 8%, #fff);
      }
      .xl-stat--warn {
        border-color: color-mix(in srgb, #e65100 45%, var(--guy-border, #ddd));
        background: color-mix(in srgb, #e65100 8%, #fff);
      }
      .xl-legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem 0.55rem;
        margin: 0 0 0.75rem;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
        line-height: 1.35;
      }
      .xl-pill {
        display: inline-flex;
        align-items: center;
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .xl-pill--new {
        background: color-mix(in srgb, #2e7d32 16%, #fff);
        color: #1b5e20;
      }
      .xl-pill--mis {
        background: color-mix(in srgb, #e65100 16%, #fff);
        color: #bf360c;
      }
      .xl-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 0.65rem;
      }
      .xl-toolbar button {
        min-height: 2.25rem;
      }
      .xl-list {
        display: grid;
        gap: 0.5rem;
        max-height: min(42vh, 360px);
        overflow: auto;
        padding: 0.1rem 0.15rem 0.35rem;
      }
      .xl-item {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 0.35rem 0.45rem;
        align-items: start;
        padding: 0.7rem 0.75rem;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 12px;
        background: #fff;
      }
      .xl-item--on {
        border-color: color-mix(in srgb, var(--guy-navy, #1a3650) 35%, var(--guy-border, #ddd));
        background: color-mix(in srgb, var(--guy-navy, #1a3650) 5%, #fff);
      }
      .xl-item--mis.xl-item--on {
        border-color: color-mix(in srgb, #e65100 45%, var(--guy-border, #ddd));
        background: color-mix(in srgb, #e65100 6%, #fff);
      }
      .xl-item--off { opacity: 0.55; }
      .xl-item:not(.xl-item--off) { cursor: pointer; }
      .xl-item__check { padding-top: 0.05rem; }
      .xl-item__body { min-width: 0; }
      .xl-item__top {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        align-items: center;
      }
      .xl-item__top strong {
        font-size: 0.95rem;
      }
      .xl-item__meta {
        margin-top: 0.15rem;
        font-size: 0.78rem;
        color: var(--guy-muted, #667);
      }
      .xl-item__amts {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 1rem;
        margin-top: 0.4rem;
        font-size: 0.82rem;
      }
      .xl-item__amts b {
        font-variant-numeric: tabular-nums;
      }
      .xl-block__title {
        margin: 1rem 0 0.5rem;
        font-size: 0.95rem;
        font-weight: 650;
      }
      .xl-bals {
        display: grid;
        gap: 0.45rem;
      }
      .xl-bal {
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 12px;
      }
      .xl-bal__row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 0.85rem;
        margin-top: 0.25rem;
        font-size: 0.82rem;
        font-variant-numeric: tabular-nums;
        color: var(--guy-muted, #5f6f76);
      }
      .xl-empty, .xl-note {
        margin: 0.35rem 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #667);
      }
      .xl-amt--neg { color: #c62828; font-weight: 700; }
      .xl-amt--pos { color: #2e7d32; font-weight: 700; }
      @media (min-width: 720px) {
        .xl-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .xl-list {
          max-height: min(36vh, 320px);
          grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
        }
        .xl-bals {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class ReloadIncomesDialogComponent {
  readonly data = inject<ReloadIncomesDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ReloadIncomesDialogComponent, boolean>);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly auth = inject(AuthService);
  private readonly shops = inject(ShopContextService);

  readonly busy = signal(false);
  readonly preview = signal<ReloadIncomesPreview | null>(null);
  readonly selected = signal<Set<string>>(new Set());

  readonly selectedCount = computed(() => this.selected().size);
  readonly projectedBalances = computed(() => {
    const preview = this.preview();
    if (!preview) return [];
    const incoming = new Map<string, number>();
    for (const row of this.selectedRows()) {
      if (!row.toAccountId) continue;
      const existing = Number(row.existingAmount ?? 0);
      const delta = row.status === 'mismatch' ? row.amount - existing : row.amount;
      incoming.set(row.toAccountId, (incoming.get(row.toAccountId) ?? 0) + delta);
    }
    return preview.balances.map((row) => {
      const inc = Math.round((incoming.get(row.accountId) ?? 0) * 100) / 100;
      const projected = Math.round((row.current + inc) * 100) / 100;
      return { ...row, incoming: inc, projected };
    });
  });
  readonly changedBalances = computed(() =>
    this.projectedBalances().filter((row) => Math.abs(row.incoming) >= 0.005),
  );

  constructor() {
    this.load();
  }

  openHelp(): void {
    const topic = topicById('closings');
    if (!topic) return;
    const user = this.auth.currentUser();
    const shopId = this.shops.selectedShopId();
    const blocks = topic.blocks.filter((b) => {
      if (!b.anyOf?.length) return true;
      return b.anyOf.some((p: Permission) => hasShopPermission(user, shopId, p));
    });
    this.dialogTitle.track(
      this.dialog.open(HelpDialogComponent, {
        width: '640px',
        maxWidth: '96vw',
        panelClass: ['guy-dialog', 'help-dialog-panel'],
        data: { topic, blocks },
      }),
      topic.title,
    );
  }

  itemKey(row: ReloadIncomeItem): string {
    return `${row.closingId}|${row.toAccountId ?? ''}|${row.label}|${row.amount}`;
  }

  canSelect(row: ReloadIncomeItem): boolean {
    return row.status === 'new' || row.status === 'mismatch';
  }

  isSelected(row: ReloadIncomeItem): boolean {
    return this.selected().has(this.itemKey(row));
  }

  toggleRow(row: ReloadIncomeItem): void {
    if (!this.canSelect(row) || this.busy()) return;
    const key = this.itemKey(row);
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  selectNews(): void {
    this.selected.set(
      new Set(
        this.reviewItems()
          .filter((i) => i.status === 'new')
          .map((i) => this.itemKey(i)),
      ),
    );
  }

  selectReview(): void {
    this.selected.set(
      new Set(this.reviewItems().filter((i) => this.canSelect(i)).map((i) => this.itemKey(i))),
    );
  }

  selectNone(): void {
    this.selected.set(new Set());
  }

  selectedRows(): ReloadIncomeItem[] {
    const keys = this.selected();
    return (this.preview()?.items ?? []).filter((i) => keys.has(this.itemKey(i)));
  }

  reviewItems(): ReloadIncomeItem[] {
    return (this.preview()?.items ?? []).filter((i) => i.status !== 'exists');
  }

  visibleItems(): ReloadIncomeItem[] {
    return this.reviewItems().slice(0, 80);
  }

  statusLabel(row: ReloadIncomeItem): string {
    if (row.status === 'new') return 'Nuevo';
    if (row.status === 'mismatch') return 'No coincide';
    if (row.status === 'skipped') return 'Sin cuenta';
    return 'Ya está';
  }

  formatDate(iso: string): string {
    const day = String(iso || '').slice(0, 10);
    const d = new Date(`${day}T12:00:00`);
    if (Number.isNaN(d.getTime())) return day;
    return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  money(n: number): string {
    return `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  }

  load(): void {
    this.busy.set(true);
    this.api.previewReloadIncomes(this.data.shopId).subscribe({
      next: (res) => {
        this.preview.set(res);
        this.selected.set(
          new Set(
            (res.items ?? []).filter((i) => i.status === 'new').map((i) => this.itemKey(i)),
          ),
        );
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudieron procesar los cierres';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  commit(): void {
    const rows = this.selectedRows().filter((i) => this.canSelect(i) && i.toAccountId);
    if (!rows.length) return;
    this.busy.set(true);
    this.api
      .commitReloadIncomes(
        this.data.shopId,
        rows.map((i) => ({
          closingId: i.closingId,
          toAccountId: i.toAccountId as string,
          amount: i.amount,
          label: i.label,
        })),
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          const created = res.createdCount ?? 0;
          const updated = res.updatedCount ?? 0;
          const parts = [
            created ? `${created} nuevos` : null,
            updated ? `${updated} actualizados` : null,
          ].filter(Boolean);
          this.snack.open(`Se cargaron ${parts.join(' y ') || 'los ingresos'}.`, 'OK', {
            duration: 4500,
          });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudieron cargar los ingresos';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
        },
      });
  }
}
