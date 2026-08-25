import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { conceptKindLabel, yesNoLabel } from '../../core/i18n/labels';
import { formatConceptCategories } from '../../shared/concept-categories';
import { ExcelImportShellComponent } from '../../shared/components/excel-import-shell';

export interface ConceptsExcelImportDialogData {
  shopId: string;
  shopName: string;
}

export interface ConceptImportItem {
  rowNumber: number;
  name: string;
  description: string | null;
  kind: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  categories?: string[];
  validated: boolean;
  exists: boolean;
  valid: boolean;
  error?: string;
}

export interface ConceptImportResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  items: ConceptImportItem[];
}

@Component({
  selector: 'app-admin-concepts-excel-dialog',
  imports: [ExcelImportShellComponent],
  template: `
    <app-excel-import-shell
      title="Importar conceptos"
      [subtitle]="data.shopName"
      [busy]="busy()"
      [fileName]="fileName()"
      [canCommit]="!!file() && validCount() > 0"
      [commitLabel]="'Importar ' + validCount()"
      (downloadTemplate)="downloadTemplate()"
      (fileSelected)="onPickedFile($event)"
      (commit)="commit()"
      (cancel)="ref.close(false)"
    >
      <p hint class="text-muted mb-0">
        Descargá la plantilla (hoja <em>Conceptos</em>), completala y subila acá. Columnas:
        Nombre, Descripción, Tipo (Ingreso / Egreso / Transferencia), Categorías
        (Empleados, Servicios, Proveedores, Movimientos, Otros) y Validado (Sí / No).
        Si el nombre ya existe, se actualiza. Solo los validados aparecen en movimientos y pagos.
      </p>
      @if (items().length) {
        <p class="mb-2">
          {{ items().length }} filas · {{ validNewCount() }} nuevas · {{ validUpdateCount() }} a
          actualizar · {{ invalidCount() }} con error
        </p>
        <div class="xl-preview">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th>Categorías</th>
                <th>Validado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of visibleItems(); track row.rowNumber) {
                <tr [class.xl-preview__exists]="!row.valid">
                  <td>{{ row.name || '—' }}</td>
                  <td>{{ row.description || '—' }}</td>
                  <td>{{ kindLabel(row.kind) }}</td>
                  <td>{{ formatCats(row.categories) }}</td>
                  <td>{{ yesNo(row.validated) }}</td>
                  <td>
                    @if (!row.valid) {
                      {{ row.error || 'Error' }}
                    } @else if (row.exists) {
                      Actualizar
                    } @else {
                      Nuevo
                    }
                  </td>
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
export class AdminConceptsExcelDialogComponent {
  readonly data = inject<ConceptsExcelImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminConceptsExcelDialogComponent, boolean>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<ConceptImportItem[]>([]);
  readonly busy = signal(false);

  readonly visibleItems = computed(() => this.items().slice(0, 100));

  validCount(): number {
    return this.items().filter((i) => i.valid).length;
  }

  validNewCount(): number {
    return this.items().filter((i) => i.valid && !i.exists).length;
  }

  validUpdateCount(): number {
    return this.items().filter((i) => i.valid && i.exists).length;
  }

  invalidCount(): number {
    return this.items().filter((i) => !i.valid).length;
  }

  kindLabel(kind: string): string {
    return conceptKindLabel(kind);
  }

  formatCats(categories?: string[]): string {
    return formatConceptCategories(categories);
  }

  yesNo(value: boolean): string {
    return yesNoLabel(value);
  }

  downloadTemplate(): void {
    this.busy.set(true);
    this.http
      .get(`${environment.apiUrl}/shops/${this.data.shopId}/concepts/import-template.xlsx`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.busy.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plantilla-conceptos.xlsx';
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
      .post<ConceptImportItem[]>(
        `${environment.apiUrl}/shops/${this.data.shopId}/concepts/import-excel`,
        body,
      )
      .subscribe({
        next: (rows) => {
          this.items.set(Array.isArray(rows) ? rows : []);
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
      .post<ConceptImportResult>(
        `${environment.apiUrl}/shops/${this.data.shopId}/concepts/import-excel`,
        body,
        { params: { commit: 'true' } },
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.snack.open(
            `Creados ${res.createdCount}. Actualizados ${res.updatedCount}. Omitidos ${res.skippedCount}.`,
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
