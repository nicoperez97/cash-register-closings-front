import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import {
  DemoItemDialogComponent,
  DemoItemDialogResult,
  DemoListItem,
} from './demo-item-dialog';

@Component({
  selector: 'app-demo-list',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Listado demo"
      subtitle="CRUD en memoria (sin API)"
      actionLabel="Nuevo"
      actionIcon="add"
      (action)="onCreate()"
    />

    <div class="panel-card guy-filters mb-3">
      <div class="guy-filters__head">
        <div>
          <h3 class="guy-filters__title">Filtros</h3>
          <p class="guy-filters__subtitle">Filtrá por categoría</p>
        </div>
        <button mat-button type="button" class="guy-filters__clear" (click)="category.set('')">
          <mat-icon>filter_alt_off</mat-icon>
          Limpiar
        </button>
      </div>
      <div class="guy-filters__grid guy-filters__grid--1">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Categoría</mat-label>
          <mat-select [ngModel]="category()" (ngModelChange)="category.set($event)">
            <mat-option value="">Todas</mat-option>
            <mat-option value="Producto">Producto</mat-option>
            <mat-option value="Servicio">Servicio</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <div class="guy-list-head">
          <div>
            <h3 class="guy-list-head__title">Ítems</h3>
            <p class="guy-list-head__meta">{{ filtered().length }} resultados</p>
          </div>
        </div>
        <app-data-table
          [columns]="columns"
          [rows]="filtered()"
          [sortable]="true"
          (edit)="onEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>
    </div>
  `,
})
export class DemoListPage {
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly snack = inject(MatSnackBar);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly category = signal('');
  readonly rows = signal<DemoListItem[]>([
    { id: '1', name: 'Portal clientes', category: 'Producto', owner: 'Ana' },
    { id: '2', name: 'Soporte 24/7', category: 'Servicio', owner: 'Luis' },
    { id: '3', name: 'App móvil', category: 'Producto', owner: 'María' },
    { id: '4', name: 'Capacitación', category: 'Servicio', owner: 'Ana' },
  ]);

  readonly columns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'owner', label: 'Owner' },
  ];

  readonly filtered = computed(() => {
    const cat = this.category();
    const rows = this.rows();
    return cat ? rows.filter((r) => r.category === cat) : rows;
  });

  onCreate(): void {
    void this.openForm({ mode: 'create' }).then((result) => {
      if (!result) return;
      const item: DemoListItem = {
        id: crypto.randomUUID(),
        name: result.name.trim(),
        category: result.category,
        owner: result.owner.trim(),
      };
      this.rows.update((list) => [item, ...list]);
      this.snack.open(`Creado: ${item.name}`, 'OK', { duration: 2500 });
    });
  }

  onEdit(row: DemoListItem): void {
    void this.openForm({ mode: 'edit', item: row }).then((result) => {
      if (!result?.id) return;
      this.rows.update((list) =>
        list.map((item) =>
          item.id === result.id
            ? {
                ...item,
                name: result.name.trim(),
                category: result.category,
                owner: result.owner.trim(),
              }
            : item,
        ),
      );
      this.snack.open(`Actualizado: ${result.name}`, 'OK', { duration: 2500 });
    });
  }

  async onRemove(row: DemoListItem): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Eliminar ítem',
      `¿Eliminar “${row.name}”? Esta acción es solo en memoria (demo).`,
    );
    if (!ok) return;
    this.rows.update((list) => list.filter((r) => r.id !== row.id));
    this.snack.open(`Eliminado: ${row.name}`, 'OK', { duration: 2500 });
  }

  private openForm(
    data: { mode: 'create' } | { mode: 'edit'; item: DemoListItem },
  ): Promise<DemoItemDialogResult | undefined> {
    const title = data.mode === 'edit' ? 'Editar ítem' : 'Nuevo ítem';
    return new Promise((resolve) => {
      const ref = this.dialogTitle.track(
        this.dialog.open(DemoItemDialogComponent, {
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
