import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  ClosingsApiService,
  PosSalesImportPreview,
} from '../closings/closings-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export interface PosSalesImportDialogData {
  shopId: string;
  shopName: string;
  salesSystemName?: string | null;
}

@Component({
  selector: 'app-pos-sales-import-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>point_of_sale</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Importar ventas POS</strong>
        <span>{{ data.shopName }}{{ data.salesSystemName ? ' · ' + data.salesSystemName : '' }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        Subí el reporte del sistema de ventas (Restosoft .xls / WeMenu .pdf).
        Solo alimenta estadísticas de platos vendidos y mesas (cubiertos) en Ventas POS.
        No crea ni modifica movimientos, cuentas ni cierres de caja.
      </p>

      <div class="xl-actions mb-3">
        <input
          #fileInput
          type="file"
          accept=".xls,.xlsx,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          (change)="onFile($event)"
        />
        <button mat-stroked-button type="button" (click)="fileInput.click()" [disabled]="busy()">
          <mat-icon>attach_file</mat-icon>
          {{ fileName() || 'Elegir reporte' }}
        </button>
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
      }

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
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy() || !file() || !preview()?.dayCount"
        (click)="commit()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Importando…">
          <mat-icon>cloud_upload</mat-icon>
          Confirmar importación
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .xl-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .xl-preview {
        overflow: auto;
        max-height: 360px;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 10px;
      }
      .xl-preview table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .xl-preview th,
      .xl-preview td {
        padding: 0.45rem 0.6rem;
        text-align: left;
        border-bottom: 1px solid var(--guy-border, #eee);
        white-space: nowrap;
      }
      .xl-preview th {
        position: sticky;
        top: 0;
        background: var(--guy-card, #fff);
        font-weight: 600;
      }
    `,
  ],
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

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
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
