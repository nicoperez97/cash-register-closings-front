import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ClosingsApiService,
  MenuPosLinkedPreview,
  MenuPosLinkedPreviewRow,
  SalesProductsFilters,
} from '../closings/closings-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { formatMoney, formatNumber } from '../../shared/utils/money';

export interface MenuPosBringDialogData {
  shopId: string;
  shopName: string;
  filters: SalesProductsFilters;
}

export interface MenuPosBringDialogResult {
  menuItemIds: string[];
}

@Component({
  selector: 'app-menu-pos-bring-dialog',
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
        <mat-icon>restaurant_menu</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Traer de ventas POS</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (busy() && !preview()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
        <p class="xl-lead">Buscando platos enlazados y ventas POS del período…</p>
      }

      @if (preview(); as p) {
        <p class="xl-lead">
          Se suman en Ventas las cantidades e importes de Restosoft de los platos enlazados a la
          carta. No crea pedidos: solo cambia este reporte. Si el mismo plato ya se vendió por
          comanda/online, puede duplicarse el conteo.
        </p>

        <div class="xl-stats">
          <div class="xl-stat">
            <strong>{{ p.linkedCount }}</strong>
            <span>enlazados</span>
          </div>
          <div class="xl-stat xl-stat--ok">
            <strong>{{ p.withPosSalesCount }}</strong>
            <span>con venta POS</span>
          </div>
          <div class="xl-stat">
            <strong>{{ money(p.totals.posAmount) }}</strong>
            <span>importe POS</span>
          </div>
          <div class="xl-stat">
            <strong>{{ selectedCount() }}</strong>
            <span>marcados</span>
          </div>
        </div>

        <div class="xl-toolbar">
          <button mat-stroked-button type="button" (click)="selectWithPos()" [disabled]="busy()">
            Con venta POS
          </button>
          <button mat-stroked-button type="button" (click)="selectAll()" [disabled]="busy()">
            Todos
          </button>
          <button mat-stroked-button type="button" (click)="selectNone()" [disabled]="busy()">
            Ninguno
          </button>
        </div>

        @if (!p.items.length) {
          <p class="xl-empty">No hay platos enlazados a Restosoft con estos filtros.</p>
        } @else {
          <div class="xl-list" role="list">
            @for (row of p.items; track row.menuItemId) {
              <div
                class="xl-item"
                role="listitem"
                [class.xl-item--on]="isSelected(row)"
                (click)="toggle(row)"
              >
                <div class="xl-item__check" (click)="$event.stopPropagation()">
                  <mat-checkbox
                    [checked]="isSelected(row)"
                    (change)="toggle(row)"
                    [disabled]="busy()"
                  />
                </div>
                <div class="xl-item__body">
                  <div class="xl-item__top">
                    <strong>{{ row.menuItemName || row.productName || '—' }}</strong>
                    <span class="xl-code">{{ row.productCode }}</span>
                  </div>
                  <div class="xl-item__meta">
                    {{ row.category || 'Sin rubro' }}
                    @if (row.subcategory) {
                      · {{ row.subcategory }}
                    }
                  </div>
                  <div class="xl-item__amts">
                    <span>
                      Carta
                      <b>{{ num(row.cartaQty) }}</b>
                      ·
                      <b>{{ money(row.cartaAmount) }}</b>
                    </span>
                    <span>
                      POS
                      <b>{{ num(row.posQty) }}</b>
                      ·
                      <b>{{ money(row.posAmount) }}</b>
                    </span>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="busy()" (click)="ref.close()">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy() || selectedCount() === 0"
        (click)="confirm()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Cargando…">
          <mat-icon>download</mat-icon>
          Traer {{ selectedCount() }} a Ventas
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
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
    .xl-stat strong {
      font-size: 1.05rem;
      font-variant-numeric: tabular-nums;
    }
    .xl-stat span {
      font-size: 0.75rem;
      color: var(--guy-muted, #667);
    }
    .xl-stat--ok {
      border-color: color-mix(in srgb, #2e7d32 40%, var(--guy-border, #ddd));
      background: color-mix(in srgb, #2e7d32 8%, #fff);
    }
    .xl-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 0.65rem;
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
    .xl-item__top {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      align-items: center;
    }
    .xl-item__top strong {
      font-size: 0.95rem;
    }
    .xl-code {
      font-size: 0.78rem;
      color: var(--guy-muted, #667);
      font-variant-numeric: tabular-nums;
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
    .xl-empty {
      margin: 0.5rem 0 0;
      color: var(--guy-muted, #667);
      font-size: 0.9rem;
    }
  `,
})
export class MenuPosBringDialogComponent implements OnInit {
  readonly data = inject<MenuPosBringDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MenuPosBringDialogComponent, MenuPosBringDialogResult>);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly busy = signal(false);
  readonly preview = signal<MenuPosLinkedPreview | null>(null);
  readonly selected = signal<Set<string>>(new Set());

  readonly selectedCount = computed(() => this.selected().size);

  ngOnInit(): void {
    this.load();
  }

  money(v: number): string {
    return formatMoney(v, { spaced: true });
  }

  num(v: number): string {
    return formatNumber(v, { maximumFractionDigits: 2 });
  }

  isSelected(row: MenuPosLinkedPreviewRow): boolean {
    return this.selected().has(row.menuItemId);
  }

  toggle(row: MenuPosLinkedPreviewRow): void {
    const next = new Set(this.selected());
    if (next.has(row.menuItemId)) next.delete(row.menuItemId);
    else next.add(row.menuItemId);
    this.selected.set(next);
  }

  selectWithPos(): void {
    const ids = (this.preview()?.items ?? [])
      .filter((r) => r.posQty > 0 || r.posAmount > 0)
      .map((r) => r.menuItemId);
    this.selected.set(new Set(ids));
  }

  selectAll(): void {
    this.selected.set(new Set((this.preview()?.items ?? []).map((r) => r.menuItemId)));
  }

  selectNone(): void {
    this.selected.set(new Set());
  }

  confirm(): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.ref.close({ menuItemIds: ids });
  }

  private load(): void {
    this.busy.set(true);
    this.api.salesMenuPosLinkedPreview(this.data.shopId, this.data.filters).subscribe({
      next: (p) => {
        this.preview.set(p);
        const withPos = p.items
          .filter((r) => r.posQty > 0 || r.posAmount > 0)
          .map((r) => r.menuItemId);
        this.selected.set(new Set(withPos.length ? withPos : p.items.map((r) => r.menuItemId)));
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo cargar el preview de Ventas POS', 'OK', { duration: 3500 });
        this.ref.close();
      },
    });
  }
}
