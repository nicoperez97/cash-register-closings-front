import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export interface ProductionAttendanceExcelImportDialogData {
  shopId: string;
  shopName: string;
}

export interface ProductionAttendanceImportItem {
  rowNumber: number;
  employeeName: string;
  date: string;
  hours: number;
  employeeId: string | null;
  willCreateEmployee: boolean;
  willMarkProducer: boolean;
  valid: boolean;
  error?: string;
}

interface ProductionAttendanceImportResult {
  upsertedDays: number;
  createdEmployees: string[];
  updatedEmployees: string[];
  preview: ProductionAttendanceImportItem[];
}

@Component({
  selector: 'app-production-attendance-excel-import-dialog',
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
        <strong>Importar producción</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        Descargá la plantilla (hoja <em>Produccion</em>: Colaborador, Fecha, Horas), completá y
        subí el archivo .xlsx.
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
          {{ items().length }} filas · {{ validCount() }} válidas
          @if (newEmployeesCount() > 0) {
            · {{ newEmployeesCount() }} empleados nuevos
          }
        </p>
        <div class="xl-preview">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Fecha</th>
                <th>Horas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of visibleItems(); track row.rowNumber) {
                <tr [class.xl-preview__exists]="!row.valid">
                  <td>
                    {{ row.employeeName }}
                    @if (row.willCreateEmployee) {
                      <span class="xl-new-user">nuevo</span>
                    } @else if (row.willMarkProducer) {
                      <span class="xl-new-user">productor</span>
                    }
                  </td>
                  <td>{{ row.date }}</td>
                  <td>{{ row.hours }}</td>
                  <td>{{ row.valid ? 'Listo' : row.error || 'Error' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (items().length > 100) {
          <p class="text-muted mt-2">Mostrando las primeras 100 filas de {{ items().length }}.</p>
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
        [disabled]="busy() || !file() || validCount() === 0"
        (click)="commit()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Importando…">
          <mat-icon>cloud_upload</mat-icon>
          Importar {{ validCount() }} días
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
        max-height: 280px;
        overflow: auto;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 8px;
      }
      .xl-preview table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .xl-preview th,
      .xl-preview td {
        padding: 0.4rem 0.55rem;
        text-align: left;
        border-bottom: 1px solid var(--guy-border, #d7e0d9);
      }
      .xl-preview th {
        position: sticky;
        top: 0;
        background: #f7faf8;
        font-weight: 650;
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
export class ProductionAttendanceExcelImportDialogComponent {
  readonly data = inject<ProductionAttendanceExcelImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<ProductionAttendanceExcelImportDialogComponent, boolean>,
  );
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly base = environment.apiUrl;

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<ProductionAttendanceImportItem[]>([]);
  readonly busy = signal(false);

  readonly visibleItems = computed(() => this.items().slice(0, 100));

  validCount(): number {
    return this.items().filter((i) => i.valid).length;
  }

  newEmployeesCount(): number {
    return new Set(
      this.items()
        .filter((i) => i.willCreateEmployee)
        .map((i) => i.employeeName.toLowerCase()),
    ).size;
  }

  downloadTemplate(): void {
    this.busy.set(true);
    this.http
      .get(`${this.base}/shops/${this.data.shopId}/production-attendance/import-template.xlsx`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.busy.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plantilla-produccion.xlsx';
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
    const body = new FormData();
    body.append('file', f);
    this.http
      .post<ProductionAttendanceImportItem[]>(
        `${this.base}/shops/${this.data.shopId}/production-attendance/import-excel`,
        body,
      )
      .subscribe({
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
    const body = new FormData();
    body.append('file', f);
    this.http
      .post<ProductionAttendanceImportResult>(
        `${this.base}/shops/${this.data.shopId}/production-attendance/import-excel`,
        body,
        { params: { commit: 'true' } },
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          const empMsg = res.createdEmployees?.length
            ? ` Empleados nuevos: ${res.createdEmployees.join(', ')}.`
            : '';
          this.snack.open(
            `Actualizados ${res.upsertedDays} días.${empMsg}`,
            'OK',
            { duration: 5500 },
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
