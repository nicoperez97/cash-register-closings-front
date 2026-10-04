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
  ResyncDiffItem,
  ResyncMovementsPreview,
} from './closings-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { HelpDialogComponent } from '../../shared/components/help-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { hasShopPermission, Permission } from '../../core/auth/auth.models';
import { topicById } from '../../core/help/module-help';
import { formatMoney } from '../../shared/utils/money';

export interface ResyncMovementsDialogData {
  shopId: string;
  shopName: string;
}

type ClosingGroup = {
  closingId: string;
  businessDate: string;
  added: number;
  removed: number;
  changed: number;
  items: ResyncDiffItem[];
};

@Component({
  selector: 'app-resync-movements-dialog',
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
        <mat-icon>autorenew</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Re-sincronizar movimientos</strong>
        <span>{{ data.shopName }}</span>
      </span>
      <button
        type="button"
        mat-icon-button
        class="xl-help"
        matTooltip="Cómo funciona"
        aria-label="Ayuda de Re-sincronizar movimientos"
        (click)="openHelp()"
      >
        <mat-icon>info_outline</mat-icon>
      </button>
    </h2>

    <mat-dialog-content>
      @if (busy() && !preview()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
        <p class="xl-lead">Comparando el libro con la configuración actual…</p>
      }

      @if (preview(); as data) {
        <p class="xl-lead">
          Vuelve a generar los movimientos según cuentas y conceptos de hoy. Marcá qué
          cierres querés corregir.
        </p>

        <div class="xl-stats">
          <div class="xl-stat">
            <strong>{{ data.closingsCount }}</strong>
            <span>cierres</span>
          </div>
          <div class="xl-stat" [class.xl-stat--warn]="data.changedClosingsCount > 0">
            <strong>{{ data.changedClosingsCount }}</strong>
            <span>con cambios</span>
          </div>
          <div class="xl-stat xl-stat--ok">
            <strong>{{ data.counts.added }}</strong>
            <span>agregados</span>
          </div>
          <div class="xl-stat">
            <strong>{{ data.counts.changed }}</strong>
            <span>distintos</span>
          </div>
          <div class="xl-stat">
            <strong>{{ data.counts.removed }}</strong>
            <span>a quitar</span>
          </div>
        </div>

        <div class="xl-legend">
          <span class="xl-pill xl-pill--new">Agregado</span>
          falta en el libro
          <span class="xl-pill xl-pill--mis">Distinto</span>
          otra cuenta o monto
          <span class="xl-pill xl-pill--rm">A quitar</span>
          sobra en el libro
        </div>

        @if (!changedGroups().length) {
          <p class="xl-empty">Los movimientos ya coinciden con la configuración actual.</p>
        } @else {
          <div class="xl-toolbar">
            <button mat-stroked-button type="button" (click)="selectChanged()" [disabled]="busy()">
              Solo con cambios
            </button>
            <button mat-stroked-button type="button" (click)="selectAll()" [disabled]="busy()">
              Todos
            </button>
            <button mat-stroked-button type="button" (click)="selectNone()" [disabled]="busy()">
              Ninguno
            </button>
          </div>

          <div class="xl-list" role="list">
            @for (group of visibleGroups(); track group.closingId) {
              <div
                class="xl-item"
                role="listitem"
                [class.xl-item--on]="isSelected(group.closingId)"
                (click)="toggleClosing(group.closingId)"
              >
                <div class="xl-item__check" (click)="$event.stopPropagation()">
                  <mat-checkbox
                    [checked]="isSelected(group.closingId)"
                    (change)="toggleClosing(group.closingId)"
                  />
                </div>
                <div class="xl-item__body">
                  <div class="xl-item__top">
                    <strong>{{ formatDate(group.businessDate) }}</strong>
                    <span class="xl-item__meta-inline">
                      @if (group.added) {
                        <span class="xl-pill xl-pill--new">+{{ group.added }}</span>
                      }
                      @if (group.changed) {
                        <span class="xl-pill xl-pill--mis">~{{ group.changed }}</span>
                      }
                      @if (group.removed) {
                        <span class="xl-pill xl-pill--rm">−{{ group.removed }}</span>
                      }
                    </span>
                  </div>
                  <div class="xl-diffs">
                    @for (row of group.items; track trackItem(row, $index)) {
                      <div class="xl-diff" [class.xl-diff--mis]="row.status === 'changed'" [class.xl-diff--rm]="row.status === 'removed'">
                        <span class="xl-pill" [class.xl-pill--new]="row.status === 'added'" [class.xl-pill--mis]="row.status === 'changed'" [class.xl-pill--rm]="row.status === 'removed'">
                          {{ statusLabel(row) }}
                        </span>
                        <strong>{{ row.label || 'Movimiento' }}</strong>
                        <div class="xl-diff__amts">
                          <span>
                            Hoy
                            <b>
                              @if (row.status === 'added') {
                                —
                              } @else {
                                {{ accountLabel(row.currentToAccountName, row.currentFromAccountName) }}
                                {{ money(row.currentAmount) }}
                              }
                            </b>
                          </span>
                          <span>
                            Queda
                            <b>
                              @if (row.status === 'removed') {
                                —
                              } @else {
                                {{ accountLabel(row.plannedToAccountName, row.plannedFromAccountName) }}
                                {{ money(row.plannedAmount) }}
                              }
                            </b>
                          </span>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
          @if (changedGroups().length > 60) {
            <p class="xl-note">Se muestran 60 de {{ changedGroups().length }} cierres con cambios.</p>
          }
        }

        @if (changedBalances().length) {
          <h3 class="xl-block__title">Cómo quedan los saldos</h3>
          <div class="xl-bals">
            @for (row of changedBalances(); track row.accountId) {
              <div class="xl-bal">
                <strong>{{ row.name }}</strong>
                <div class="xl-bal__row">
                  <span>Hoy {{ money(row.current) }}</span>
                  <span
                    [class.xl-amt--neg]="row.incoming < 0"
                    [class.xl-amt--pos]="row.incoming > 0"
                  >
                    Cambia {{ money(row.incoming) }}
                  </span>
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
        <app-busy-label [busy]="busy()" busyLabel="Re-sincronizando…">
          <mat-icon>autorenew</mat-icon>
          Re-sincronizar {{ selectedCount() }}
          {{ selectedCount() === 1 ? 'cierre' : 'cierres' }}
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
      .xl-pill--rm {
        background: color-mix(in srgb, #c62828 14%, #fff);
        color: #b71c1c;
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
        cursor: pointer;
      }
      .xl-item--on {
        border-color: color-mix(in srgb, var(--guy-navy, #1a3650) 35%, var(--guy-border, #ddd));
        background: color-mix(in srgb, var(--guy-navy, #1a3650) 5%, #fff);
      }
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
      .xl-item__meta-inline {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
      }
      .xl-diffs {
        display: grid;
        gap: 0.4rem;
        margin-top: 0.45rem;
      }
      .xl-diff {
        padding: 0.45rem 0.55rem;
        border-radius: 10px;
        border: 1px solid var(--guy-border, #eee);
        background: #fafafa;
        display: grid;
        gap: 0.2rem;
      }
      .xl-diff strong {
        font-size: 0.88rem;
      }
      .xl-diff__amts {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 1rem;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }
      .xl-diff__amts b {
        font-variant-numeric: tabular-nums;
        color: inherit;
      }
      .xl-diff--mis {
        border-color: color-mix(in srgb, #e65100 35%, var(--guy-border, #eee));
      }
      .xl-diff--rm {
        border-color: color-mix(in srgb, #c62828 30%, var(--guy-border, #eee));
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
        .xl-stats { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .xl-list {
          max-height: min(36vh, 320px);
        }
        .xl-bals {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class ResyncMovementsDialogComponent {
  readonly data = inject<ResyncMovementsDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ResyncMovementsDialogComponent, boolean>);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly auth = inject(AuthService);
  private readonly shops = inject(ShopContextService);

  readonly busy = signal(false);
  readonly preview = signal<ResyncMovementsPreview | null>(null);
  readonly selected = signal<Set<string>>(new Set());

  readonly selectedCount = computed(() => this.selected().size);

  readonly changedGroups = computed((): ClosingGroup[] => {
    const preview = this.preview();
    if (!preview) return [];
    const map = new Map<string, ClosingGroup>();
    for (const row of preview.items) {
      if (row.status === 'unchanged') continue;
      let group = map.get(row.closingId);
      if (!group) {
        group = {
          closingId: row.closingId,
          businessDate: row.businessDate,
          added: 0,
          removed: 0,
          changed: 0,
          items: [],
        };
        map.set(row.closingId, group);
      }
      group.items.push(row);
      if (row.status === 'added') group.added += 1;
      else if (row.status === 'removed') group.removed += 1;
      else if (row.status === 'changed') group.changed += 1;
    }
    return [...map.values()].sort((a, b) =>
      String(b.businessDate).localeCompare(String(a.businessDate)),
    );
  });

  readonly visibleGroups = computed(() => this.changedGroups().slice(0, 60));

  readonly changedBalances = computed(() => {
    const preview = this.preview();
    if (!preview) return [];
    const selected = this.selected();
    if (!selected.size) return [];
    // Los balances del preview asumen todos los cambios; si hay selección parcial
    // solo mostramos la proyección global cuando está todo marcado.
    if (selected.size !== this.changedGroups().length) return [];
    return (preview.balances ?? []).filter((b) => Math.abs(b.incoming) >= 0.005);
  });

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

  isSelected(closingId: string): boolean {
    return this.selected().has(closingId);
  }

  toggleClosing(closingId: string): void {
    if (this.busy()) return;
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(closingId)) next.delete(closingId);
      else next.add(closingId);
      return next;
    });
  }

  selectChanged(): void {
    this.selected.set(new Set(this.changedGroups().map((g) => g.closingId)));
  }

  selectAll(): void {
    this.selectChanged();
  }

  selectNone(): void {
    this.selected.set(new Set());
  }

  statusLabel(row: ResyncDiffItem): string {
    if (row.status === 'added') return 'Agregado';
    if (row.status === 'removed') return 'A quitar';
    if (row.status === 'changed') return 'Distinto';
    return 'Igual';
  }

  accountLabel(toName: string | null, fromName: string | null): string {
    if (toName) return toName;
    if (fromName) return fromName;
    return 'Sin cuenta';
  }

  trackItem(row: ResyncDiffItem, index: number): string {
    return `${row.closingId}|${row.status}|${row.label}|${index}`;
  }

  formatDate(iso: string): string {
    const day = String(iso || '').slice(0, 10);
    const d = new Date(`${day}T12:00:00`);
    if (Number.isNaN(d.getTime())) return day;
    return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  money(n: number): string {
    return formatMoney(n, { spaced: true });
  }

  load(): void {
    this.busy.set(true);
    this.api.previewResyncMovements(this.data.shopId).subscribe({
      next: (res) => {
        this.preview.set(res);
        const changed = new Set(
          (res.items ?? [])
            .filter((i) => i.status !== 'unchanged')
            .map((i) => i.closingId),
        );
        this.selected.set(changed);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo armar el preview';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  commit(): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.busy.set(true);
    this.api.commitResyncMovements(this.data.shopId, ids).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.snack.open(
          `Movimientos re-sincronizados (${res.resynced} cierre${res.resynced === 1 ? '' : 's'})`,
          'OK',
          { duration: 3000 },
        );
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo re-sincronizar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }
}
