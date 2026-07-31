import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ClosingsApiService, ExcelImportItem } from './closings-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export interface ExcelImportDialogData {
  shopId: string;
  shopName: string;
}

@Component({
  selector: 'app-excel-import-dialog',
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
        <mat-icon>table_view</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Importar desde Excel</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        Descargá la plantilla, completá una fila por día y subí el archivo .xlsx.
        Si “Quién se lo lleva” no existe, se crea como Visor (pass 123456).
      </p>

      <div class="xl-actions mb-3">
        <button mat-stroked-button type="button" (click)="downloadTemplate()" [disabled]="busy()">
          <mat-icon>download</mat-icon>
          Descargar plantilla
        </button>
        <input
          #fileInput
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          (change)="onFile($event)"
        />
        <button mat-stroked-button type="button" (click)="fileInput.click()" [disabled]="busy()">
          <mat-icon>attach_file</mat-icon>
          {{ fileName() || 'Elegir Excel' }}
        </button>
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
      }

      @if (items().length) {
        <p class="mb-2">
          {{ items().length }} filas ·
          {{ creatableCount() }} nuevas ·
          {{ existingCount() }} ya cargadas
          @if (newUsersCount() > 0) {
            · {{ newUsersCount() }} usuarios nuevos (Visor / 123456)
          }
        </p>
        <div class="xl-preview">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>PVS</th>
                <th>Efectivo</th>
                <th>Total</th>
                <th>Quién</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.businessDate + '-' + row.rowNumber) {
                <tr [class.xl-preview__exists]="row.alreadyExists">
                  <td>{{ row.businessDate }}</td>
                  <td>{{ money(row.cardAmount) }}</td>
                  <td>{{ money(row.cashAmount) }}</td>
                  <td>{{ money(row.declaredTotal) }}</td>
                  <td>
                    {{ row.cashWithdrawnByName || '—' }}
                    @if (row.willCreateUser) {
                      <span class="xl-new-user">nuevo</span>
                    }
                  </td>
                  <td>{{ row.alreadyExists ? 'Ya existe' : 'Listo' }}</td>
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
        [disabled]="busy() || !file() || creatableCount() === 0"
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
      .xl-preview__exists {
        opacity: 0.55;
      }
      .xl-new-user {
        display: inline-block;
        margin-left: 0.35rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 18%, transparent);
        color: var(--guy-accent, #2e7d32);
      }
    `,
  ],
})
export class ExcelImportDialogComponent {
  readonly data = inject<ExcelImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ExcelImportDialogComponent, boolean>);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<ExcelImportItem[]>([]);
  readonly busy = signal(false);

  creatableCount(): number {
    return this.items().filter(
      (i) =>
        !i.alreadyExists &&
        (i.cardAmount > 0 ||
          i.cashAmount > 0 ||
          i.mercadoPagoAmount > 0 ||
          i.deliveryAppsAmount > 0 ||
          i.transferAmount > 0 ||
          i.accountDniAmount > 0 ||
          i.otherAmount > 0 ||
          i.declaredTotal > 0),
    ).length;
  }

  existingCount(): number {
    return this.items().filter((i) => i.alreadyExists).length;
  }

  newUsersCount(): number {
    const names = new Set(
      this.items()
        .filter((i) => i.willCreateUser && i.cashWithdrawnByName)
        .map((i) => i.cashWithdrawnByName!.toLowerCase()),
    );
    return names.size;
  }

  money(n: number): string {
    return `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  }

  downloadTemplate(): void {
    this.busy.set(true);
    this.api.downloadImportTemplate(this.data.shopId).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla-cierres.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo descargar la plantilla', 'OK', { duration: 3500 });
      },
    });
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.file.set(f);
    this.fileName.set(f.name);
    this.busy.set(true);
    this.api.previewExcelImport(this.data.shopId, f).subscribe({
      next: (rows) => {
        this.items.set(Array.isArray(rows) ? rows : (rows as any)?.preview ?? []);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.items.set([]);
        const msg = err?.error?.message ?? 'No se pudo analizar el Excel';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  commit(): void {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.api.commitExcelImport(this.data.shopId, f).subscribe({
      next: (res) => {
        this.busy.set(false);
        const usersMsg = res.createdUsers?.length
          ? ` Usuarios nuevos: ${res.createdUsers.join(', ')} (Visor / 123456).`
          : '';
        this.snack.open(
          `Importados ${res.createdCount}. Omitidos ${res.skippedCount}.${usersMsg}`,
          'OK',
          { duration: 5000 },
        );
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo importar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }
}
