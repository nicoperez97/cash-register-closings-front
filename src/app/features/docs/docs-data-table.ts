import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DocsShellComponent } from './docs-shell';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';

interface DemoRow {
  id: string;
  name: string;
  status: string;
  amount: number;
}

type RowDialogData = { mode: 'create' } | { mode: 'edit'; item: DemoRow };

@Component({
  selector: 'app-docs-row-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'add' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar proyecto' : 'Nuevo proyecto' }}</strong>
        <span>{{ isEdit ? 'Actualiz? los datos del proyecto' : 'Complet? los datos para crear un proyecto' }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>folder</mat-icon>
          <input matInput formControlName="name" />
          @if (form.controls.name.touched && form.controls.name.hasError('required')) {
            <mat-error>Requerido</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-icon matPrefix>flag</mat-icon>
          <mat-select formControlName="status">
            <mat-option value="Activo">Activo</mat-option>
            <mat-option value="Pausa">Pausa</mat-option>
            <mat-option value="Cerrado">Cerrado</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto</mat-label>
          <mat-icon matPrefix>payments</mat-icon>
          <input matInput type="number" formControlName="amount" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="form.invalid" (click)="save()">
        <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
        {{ isEdit ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
})
class DocsRowDialogComponent {
  readonly data = inject<RowDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<DocsRowDialogComponent, Omit<DemoRow, 'id'> & { id?: string }>);
  private readonly fb = inject(FormBuilder);
  readonly isEdit = this.data.mode === 'edit';
  private readonly item = this.data.mode === 'edit' ? this.data.item : null;

  readonly form = this.fb.nonNullable.group({
    name: [this.item?.name ?? '', Validators.required],
    status: [this.item?.status ?? 'Activo', Validators.required],
    amount: [this.item?.amount ?? 0, [Validators.required, Validators.min(0)]],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close({ id: this.item?.id, ...this.form.getRawValue() });
  }
}

@Component({
  selector: 'app-docs-data-table',
  imports: [
    DocsShellComponent,
    DataTableComponent,
    MatSnackBarModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
  ],
  template: `
    <app-docs-shell
      title="Data table"
      subtitle="app-data-table"
      description="Tabla Material en desktop; cards .guy-entity-card en ?720px. Incluye search, sort, paginaci?n y acciones CRUD en memoria."
    >
      <div class="panel-card mb-3">
        <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2">
          <h2 class="guy-section-title mb-0">Demo</h2>
          <button mat-flat-button color="primary" type="button" (click)="onCreate()">
            <mat-icon>add</mat-icon>
            Nuevo
          </button>
        </div>
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [sortable]="true"
          [selectable]="true"
          [selection]="selection()"
          (selectionChange)="selection.set($event)"
          (edit)="onEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">API (resumen)</h2>
        <table class="docs-api">
          <thead>
            <tr>
              <th>Input / Output</th>
              <th>Descripci?n</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>columns</code> / <code>rows</code></td>
              <td>Definici?n de columnas y datos</td>
            </tr>
            <tr>
              <td><code>sortable</code> / <code>showSearch</code> / <code>showPaginator</code></td>
              <td>Controles de UX</td>
            </tr>
            <tr>
              <td><code>selectable</code> + <code>selectionChange</code></td>
              <td>Selecci?n por checkbox</td>
            </tr>
            <tr>
              <td><code>edit</code> / <code>remove</code> / <code>duplicate</code></td>
              <td>Acciones de fila</td>
            </tr>
            <tr>
              <td><code>serverPaging</code> + <code>page</code></td>
              <td>Paginaci?n server-side</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel-card">
        <pre class="docs-code">{{ snippet }}</pre>
      </div>
    </app-docs-shell>
  `,
})
export class DocsDataTablePage {
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly snack = inject(MatSnackBar);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly snippet = `<app-data-table
  [columns]="columns"
  [rows]="rows"
  [sortable]="true"
  (edit)="onEdit($event)"
  (remove)="onRemove($event)"
/>`;

  readonly selection = signal<string[]>([]);
  readonly rows = signal<DemoRow[]>([
    { id: '1', name: 'Proyecto Alpha', status: 'Activo', amount: 1200 },
    { id: '2', name: 'Proyecto Beta', status: 'Pausa', amount: 850 },
    { id: '3', name: 'Proyecto Gamma', status: 'Activo', amount: 2100 },
    { id: '4', name: 'Proyecto Delta', status: 'Cerrado', amount: 400 },
  ]);

  readonly columns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'status', label: 'Estado' },
    {
      key: 'amount',
      label: 'Monto',
      format: (r) => `$ ${Number(r.amount).toLocaleString('es-AR')}`,
    },
  ];

  onCreate(): void {
    void this.openForm({ mode: 'create' }).then((result) => {
      if (!result) return;
      const item: DemoRow = {
        id: crypto.randomUUID(),
        name: result.name.trim(),
        status: result.status,
        amount: Number(result.amount) || 0,
      };
      this.rows.update((list) => [item, ...list]);
      this.snack.open(`Creado: ${item.name}`, 'OK', { duration: 2500 });
    });
  }

  onEdit(row: DemoRow): void {
    void this.openForm({ mode: 'edit', item: row }).then((result) => {
      if (!result?.id) return;
      this.rows.update((list) =>
        list.map((item) =>
          item.id === result.id
            ? {
                ...item,
                name: result.name.trim(),
                status: result.status,
                amount: Number(result.amount) || 0,
              }
            : item,
        ),
      );
      this.snack.open(`Actualizado: ${result.name}`, 'OK', { duration: 2500 });
    });
  }

  async onRemove(row: DemoRow): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Eliminar proyecto',
      `?Eliminar ?${row.name}?? (solo en memoria)`,
    );
    if (!ok) return;
    this.rows.update((list) => list.filter((r) => r.id !== row.id));
    this.selection.update((ids) => ids.filter((id) => id !== row.id));
    this.snack.open(`Eliminado: ${row.name}`, 'OK', { duration: 2500 });
  }

  private openForm(data: RowDialogData): Promise<(Omit<DemoRow, 'id'> & { id?: string }) | undefined> {
    const title = data.mode === 'edit' ? 'Editar proyecto' : 'Nuevo proyecto';
    return new Promise((resolve) => {
      const ref = this.dialogTitle.track(
        this.dialog.open(DocsRowDialogComponent, {
          data,
          width: '440px',
          maxWidth: '95vw',
          panelClass: 'guy-dialog',
          autoFocus: 'first-tabbable',
        }),
        title,
      );
      ref.afterClosed().subscribe((result) => resolve(result));
    });
  }
}
