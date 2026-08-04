import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { Candidate, CandidatesApiService, CandidateStatus } from './candidates-api.service';
import { CandidateDialogComponent, CandidateDialogData } from './candidate-dialog';

const STATUS_LABEL: Record<CandidateStatus, string> = {
  new: 'Nuevo',
  reviewing: 'En revisión',
  hired: 'Contratado',
  rejected: 'Descartado',
};

@Component({
  selector: 'app-candidates-list',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="CVs / Candidatos"
      [subtitle]="shops.selectedShop()?.name ?? 'Personal'"
      [actionLabel]="canManage() ? 'Nuevo desde CV' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="document_scanner"
      [actionLarge]="true"
      (action)="openFromCv()"
    />

    @if (canManage()) {
      <div class="candidates-toolbar mb-3">
        <button mat-stroked-button type="button" (click)="openManual()">
          <mat-icon>person_add</mat-icon>
          Alta manual
        </button>
      </div>
    }

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h3 class="guy-filters__title">Filtros</h3>
          <p class="guy-filters__subtitle">Estado del candidato</p>
        </div>
        <div class="guy-filters__tools">
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select [ngModel]="statusFilter()" (ngModelChange)="onStatus($event)">
            <mat-option value="">Todos</mat-option>
            <mat-option value="new">Nuevo</mat-option>
            <mat-option value="reviewing">En revisión</mat-option>
            <mat-option value="hired">Contratado</mat-option>
            <mat-option value="rejected">Descartado</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [loading]="loading()"
          [sortable]="true"
          [showActions]="canManage()"
          [canRemove]="canDelete"
          removeLabel="Eliminar"
          removeIcon="delete"
          (edit)="openEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .candidates-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
    `,
  ],
})
export class CandidatesListPage {
  private readonly filtersUi = createFiltersCollapsed('candidates');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(CandidatesApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly rows = signal<Candidate[]>([]);
  readonly loading = signal(true);
  readonly statusFilter = signal('');

  readonly columns: DataTableColumn[] = [
    {
      key: 'fullName',
      label: 'Nombre',
      format: (r) => `${r['firstName'] ?? ''} ${r['lastName'] ?? ''}`.trim(),
    },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    {
      key: 'status',
      label: 'Estado',
      format: (r) => STATUS_LABEL[r['status'] as CandidateStatus] ?? String(r['status'] ?? ''),
    },
    {
      key: 'createdAt',
      label: 'Alta',
      format: (r) => {
        const v = r['createdAt'];
        if (!v) return '';
        const d = new Date(String(v));
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR');
      },
    },
  ];

  readonly canDelete = (_row: Candidate) => this.canManage();

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'candidates.manage',
    );
  }

  onStatus(value: string): void {
    this.statusFilter.set(value);
    this.reload();
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.list(shopId, this.statusFilter() || undefined).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los candidatos', 'OK', { duration: 3000 });
      },
    });
  }

  openFromCv(): void {
    this.openDialog({ mode: 'from-cv' });
  }

  openManual(): void {
    this.openDialog({ mode: 'manual' });
  }

  openEdit(row: Candidate): void {
    this.openDialog({ mode: 'edit', candidate: row });
  }

  async onRemove(row: Candidate): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirmDialog.confirm(
      'Eliminar candidato',
      `¿Eliminar a ${row.firstName} ${row.lastName}?`,
    );
    if (!ok) return;
    this.api.remove(shopId, row.id).subscribe({
      next: () => {
        this.snack.open('Candidato eliminado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }

  private openDialog(
    mode: { mode: 'from-cv' } | { mode: 'manual' } | { mode: 'edit'; candidate: Candidate },
  ): void {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    if (!shopId || !shop) return;
    const data: CandidateDialogData = {
      shopId,
      shopName: shop.name,
      ...mode,
    };
    const title =
      mode.mode === 'edit'
        ? 'Editar candidato'
        : mode.mode === 'from-cv'
          ? 'Nuevo desde CV'
          : 'Nuevo candidato';
    this.dialogTitle
      .track(
        this.dialog.open(CandidateDialogComponent, {
          width: '820px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          panelClass: 'guy-dialog',
          data,
          autoFocus: 'dialog',
        }),
        title,
      )
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.reload();
      });
  }
}
