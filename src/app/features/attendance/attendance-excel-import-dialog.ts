import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { ExcelImportShellComponent } from '../../shared/components/excel-import-shell';

export interface AttendanceExcelImportDialogData {
  shopId: string;
  shopName: string;
}

export interface AttendanceImportItem {
  rowNumber: number;
  employeeName: string;
  date: string;
  isPresent: boolean;
  isHoliday: boolean;
  overtimeHours: number;
  employeeId: string | null;
  willCreateEmployee: boolean;
  baseSalaryHint: number | null;
  valid: boolean;
  error?: string;
}

interface AttendanceImportResult {
  upsertedDays: number;
  createdEmployees: string[];
  updatedEmployees: string[];
  preview: AttendanceImportItem[];
}

@Component({
  selector: 'app-attendance-excel-import-dialog',
  imports: [ExcelImportShellComponent],
  template: `
    <app-excel-import-shell
      title="Importar presentismo"
      [subtitle]="data.shopName"
      [busy]="busy()"
      [fileName]="fileName()"
      [canCommit]="!!file() && validCount() > 0"
      [commitLabel]="'Importar ' + validCount() + ' días'"
      (downloadTemplate)="downloadTemplate()"
      (fileSelected)="onPickedFile($event)"
      (commit)="commit()"
      (cancel)="ref.close(false)"
    >
      <p hint class="text-muted mb-0">
        Compatible con el Excel de Presentismo (hoja <em>Base de datos</em> y
        <em>Validación de datos</em> para sueldos). También podés usar la plantilla.
      </p>
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
                <th>Presente</th>
                <th>Feriado</th>
                <th>HE</th>
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
                    }
                  </td>
                  <td>{{ row.date }}</td>
                  <td>{{ row.isPresent ? 'Sí' : 'No' }}</td>
                  <td>{{ row.isHoliday ? 'Sí' : 'No' }}</td>
                  <td>{{ row.overtimeHours || 0 }}</td>
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
    </app-excel-import-shell>
  `,
})
export class AttendanceExcelImportDialogComponent {
  readonly data = inject<AttendanceExcelImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AttendanceExcelImportDialogComponent, boolean>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly base = environment.apiUrl;

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<AttendanceImportItem[]>([]);
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
      .get(`${this.base}/shops/${this.data.shopId}/attendance/import-template.xlsx`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.busy.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plantilla-presentismo.xlsx';
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.busy.set(false);
          this.snack.open('No se pudo descargar la plantilla', 'OK', { duration: 3500 });
        },
      });
  }

  onPickedFile(f: File): void {
    this.file.set(f);
    this.fileName.set(f.name);
    this.busy.set(true);
    const body = new FormData();
    body.append('file', f);
    this.http
      .post<AttendanceImportItem[]>(
        `${this.base}/shops/${this.data.shopId}/attendance/import-excel`,
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
      .post<AttendanceImportResult>(
        `${this.base}/shops/${this.data.shopId}/attendance/import-excel`,
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
