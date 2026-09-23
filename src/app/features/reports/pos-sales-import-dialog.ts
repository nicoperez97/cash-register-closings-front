import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ClosingsApiService,
  PosSalesImportPreview,
  PosSalesProductLabel,
  PosSalesProductPreview,
  PosSalesProductSource,
} from '../closings/closings-api.service';
import { ExcelImportShellComponent } from '../../shared/components/excel-import-shell';
import { formatMoney } from '../../shared/utils/money';
import { apiErrorMessage } from '../../core/http/api-error-message';

export interface PosSalesImportDialogData {
  shopId: string;
  shopName: string;
  salesSystemName?: string | null;
}

type EditableProduct = PosSalesProductPreview;

@Component({
  selector: 'app-pos-sales-import-dialog',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ExcelImportShellComponent,
  ],
  template: `
    <app-excel-import-shell
      title="Importar ventas POS"
      [subtitle]="data.shopName + (data.salesSystemName ? ' · ' + data.salesSystemName : '')"
      icon="point_of_sale"
      [showTemplate]="false"
      pickLabel="Elegir reporte"
      accept=".xls,.xlsx,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      [busy]="busy()"
      [busyHint]="busyHint()"
      [fileName]="fileName()"
      [canCommit]="!!file() && !!preview()?.dayCount"
      (fileSelected)="onPickedFile($event)"
      (commit)="commit()"
      (cancel)="ref.close(false)"
    >
      <p hint class="text-muted mb-0">
        Subí el reporte del sistema de ventas (Restosoft .xls / WeMenu .pdf).
        Revisá platos y rubros antes de confirmar. Solo alimenta Ventas POS (no toca movimientos ni
        cierres).
      </p>
      @if (preview(); as p) {
        <p class="mb-2">
          {{ p.ticketCount }} comprobantes · {{ p.dayCount }} días
          @if (p.periodFrom && p.periodTo) {
            · {{ p.periodFrom }} → {{ p.periodTo }}
          }
          @if (p.unknownPaymentCodes.length) {
            · códigos de pago desconocidos: {{ p.unknownPaymentCodes.join(', ') }}
          }
        </p>
        @if (p.geminiWarning) {
          <p class="pos-import__warn mb-2">{{ p.geminiWarning }}</p>
        }

        <div class="xl-preview mb-3">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tickets</th>
                <th>Total</th>
                <th>Efectivo</th>
                <th>Tarjeta</th>
              </tr>
            </thead>
            <tbody>
              @for (row of p.days; track row.businessDate) {
                <tr>
                  <td>{{ row.businessDate }}</td>
                  <td>{{ row.ticketCount }}</td>
                  <td>{{ money(row.totalAmount) }}</td>
                  <td>{{ money(row.cashAmount) }}</td>
                  <td>{{ money(row.cardAmount) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (products().length) {
          <div class="pos-import__products-head">
            <h3 class="pos-import__title">Platos y rubros</h3>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="pos-import__search">
              <mat-label>Buscar plato</mat-label>
              <input
                matInput
                [ngModel]="productQuery()"
                (ngModelChange)="productQuery.set($event)"
                name="pos-product-q"
              />
            </mat-form-field>
          </div>
          <p class="text-muted mb-2">
            {{ products().length }} platos · {{ withoutCategory() }} sin rubro. Podés corregir nombre
            y rubro antes de cargar.
          </p>
          <div class="xl-preview pos-import__products">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Plato</th>
                  <th>Rubro</th>
                  <th>Origen</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                @for (row of filteredProducts(); track row.productCode; let i = $index) {
                  <tr>
                    <td class="pos-import__code">{{ row.productCode }}</td>
                    <td>
                      <input
                        class="pos-import__input"
                        [(ngModel)]="row.productName"
                        [name]="'name-' + row.productCode"
                      />
                    </td>
                    <td>
                      <select
                        class="pos-import__select"
                        [(ngModel)]="row.category"
                        [name]="'cat-' + row.productCode"
                      >
                        <option [ngValue]="null">Sin rubro</option>
                        @for (c of categoryOptions(); track c) {
                          <option [ngValue]="c">{{ c }}</option>
                        }
                      </select>
                    </td>
                    <td>
                      <span class="pos-import__src" [attr.data-src]="row.source">{{
                        sourceLabel(row.source)
                      }}</span>
                    </td>
                    <td>{{ money(row.amount) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </app-excel-import-shell>
  `,
  styles: `
    .pos-import__warn {
      margin: 0;
      padding: 0.5rem 0.65rem;
      border-radius: 8px;
      background: #fff8e6;
      color: #6a4c00;
      font-size: 0.85rem;
    }
    .pos-import__products-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin: 0.5rem 0 0.25rem;
    }
    .pos-import__title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 650;
    }
    .pos-import__search {
      width: min(100%, 220px);
    }
    .pos-import__products {
      max-height: 280px;
      overflow: auto;
    }
    .pos-import__code {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .pos-import__input,
    .pos-import__select {
      width: 100%;
      min-width: 0;
      border: 1px solid #d7e0d9;
      border-radius: 6px;
      padding: 0.25rem 0.4rem;
      font: inherit;
      background: #fff;
    }
    .pos-import__src {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #5f6f76;
    }
    .pos-import__src[data-src='gemini'] {
      color: #6a4c93;
    }
    .pos-import__src[data-src='catalog'] {
      color: #2e7d32;
    }
    .pos-import__src[data-src='seed'] {
      color: #1d65a0;
    }
    .pos-import__src[data-src='none'] {
      color: #c62828;
    }
  `,
})
export class PosSalesImportDialogComponent {
  readonly data = inject<PosSalesImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PosSalesImportDialogComponent, boolean>);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly preview = signal<PosSalesImportPreview | null>(null);
  readonly products = signal<EditableProduct[]>([]);
  readonly categoryOptions = signal<string[]>([]);
  readonly busy = signal(false);
  readonly busyHint = signal('');
  readonly productQuery = signal('');

  readonly filteredProducts = computed(() => {
    const q = this.productQuery().trim().toLowerCase();
    const rows = this.products();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.productCode.toLowerCase().includes(q) ||
        String(r.productName ?? '')
          .toLowerCase()
          .includes(q) ||
        String(r.category ?? '')
          .toLowerCase()
          .includes(q),
    );
  });

  readonly withoutCategory = computed(
    () => this.products().filter((p) => !String(p.category ?? '').trim()).length,
  );

  money(n: number): string {
    return formatMoney(n);
  }

  sourceLabel(source: PosSalesProductSource): string {
    switch (source) {
      case 'catalog':
        return 'Catálogo';
      case 'seed':
        return 'Sugerido';
      case 'gemini':
        return 'IA';
      default:
        return 'Sin rubro';
    }
  }

  onPickedFile(f: File): void {
    this.file.set(f);
    this.fileName.set(f.name);
    this.busy.set(true);
    this.busyHint.set('Analizando reporte y platos…');
    this.preview.set(null);
    this.products.set([]);
    this.api.previewPosSalesImport(this.data.shopId, f).subscribe({
      next: (res) => {
        this.preview.set(res);
        const cats = [...(res.categoryOptions ?? [])];
        this.categoryOptions.set(cats);
        this.products.set(
          (res.products ?? []).map((p) => ({
            ...p,
            productName: p.productName ?? '',
            category: p.category ?? null,
          })),
        );
        this.busy.set(false);
        this.busyHint.set('');
      },
      error: (err) => {
        this.busy.set(false);
        this.busyHint.set('');
        this.preview.set(null);
        this.snack.open(apiErrorMessage(err, 'No se pudo analizar el reporte'), 'OK', {
          duration: 5000,
        });
      },
    });
  }

  commit(): void {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.busyHint.set('Importando…');
    const productLabels: PosSalesProductLabel[] = this.products().map((p) => ({
      productCode: p.productCode,
      productName: String(p.productName ?? '').trim() || null,
      category: String(p.category ?? '').trim() || null,
      subcategory: p.subcategory ?? null,
    }));
    this.api.commitPosSalesImport(this.data.shopId, f, productLabels).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.busyHint.set('');
        this.snack.open(
          `Importados ${res.committedDays} días · ${res.ticketCount} comprobantes`,
          'OK',
          { duration: 5000 },
        );
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.busyHint.set('');
        this.snack.open(apiErrorMessage(err, 'No se pudo importar'), 'OK', { duration: 5000 });
      },
    });
  }
}
