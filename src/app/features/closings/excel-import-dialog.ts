import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ClosingsApiService, ExcelImportItem } from './closings-api.service';
import { ExcelImportShellComponent } from '../../shared/components/excel-import-shell';

export interface ExcelImportDialogData {
  shopId: string;
  shopName: string;
}

@Component({
  selector: 'app-excel-import-dialog',
  imports: [ExcelImportShellComponent],
  template: `
    <app-excel-import-shell
      title="Importar desde Excel"
      [subtitle]="data.shopName"
      [busy]="busy()"
      [fileName]="fileName()"
      [canCommit]="!!file() && creatableCount() > 0"
      (downloadTemplate)="downloadTemplate()"
      (fileSelected)="onPickedFile($event)"
      (commit)="commit()"
      (cancel)="ref.close(false)"
    >
      <p hint class="text-muted mb-0">
        Plantilla propia de cierres de caja (no es el reporte Restosoft).
        Descargá la plantilla, completá una fila por día y subí el archivo .xlsx.
        Si “Quién se lo lleva” no existe, se crea como Visor (pass 123456).
      </p>
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
    </app-excel-import-shell>
  `,
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

  onPickedFile(f: File): void {
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
