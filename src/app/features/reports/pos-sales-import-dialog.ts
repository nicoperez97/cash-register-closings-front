import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClosingsApiService, PosSalesImportPreview } from '../closings/closings-api.service';
import { ExcelImportShellComponent } from '../../shared/components/excel-import-shell';

export interface PosSalesImportDialogData {
  shopId: string;
  shopName: string;
  salesSystemName?: string | null;
}

@Component({
  selector: 'app-pos-sales-import-dialog',
  imports: [ExcelImportShellComponent],
  template: `
    <app-excel-import-shell
      title="Importar ventas POS"
      [subtitle]="data.shopName + (data.salesSystemName ? ' · ' + data.salesSystemName : '')"
      icon="point_of_sale"
      [showTemplate]="false"
      pickLabel="Elegir reporte"
      accept=".xls,.xlsx,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      [busy]="busy()"
      [fileName]="fileName()"
      [canCommit]="!!file() && !!preview()?.dayCount"
      (fileSelected)="onPickedFile($event)"
      (commit)="commit()"
      (cancel)="ref.close(false)"
    >
      <p hint class="text-muted mb-0">
        Subí el reporte del sistema de ventas (Restosoft .xls / WeMenu .pdf).
        Solo alimenta estadísticas de platos vendidos y mesas (cubiertos) en Ventas POS.
        No crea ni modifica movimientos, cuentas ni cierres de caja.
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
        <div class="xl-preview">
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
      }
    </app-excel-import-shell>
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
  readonly busy = signal(false);

  money(n: number): string {
    return `$${Number(n || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  onPickedFile(f: File): void {
    this.file.set(f);
    this.fileName.set(f.name);
    this.busy.set(true);
    this.api.previewPosSalesImport(this.data.shopId, f).subscribe({
      next: (res) => {
        this.preview.set(res);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.preview.set(null);
        const msg = err?.error?.message ?? 'No se pudo analizar el reporte';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 5000 });
      },
    });
  }

  commit(): void {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.api.commitPosSalesImport(this.data.shopId, f).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.snack.open(
          `Importados ${res.committedDays} días · ${res.ticketCount} comprobantes`,
          'OK',
          { duration: 5000 },
        );
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo importar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 5000 });
      },
    });
  }
}
