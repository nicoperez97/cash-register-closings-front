import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop } from '../../core/auth/auth.models';
import { activeLabel } from '../../core/i18n/labels';
import {
  AdminPosProductDialogComponent,
  AdminPosProductRow,
} from './admin-pos-product-dialog';

@Component({
  selector: 'app-admin-pos-products',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Platos (POS)"
      subtitle="Asigná rubros a los productos importados del sistema de ventas"
    />

    <div class="panel-card guy-filters mb-3">
      <form class="guy-filters__grid guy-filters__grid--dense" (submit)="$event.preventDefault(); load()">
        <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
          <mat-label>Buscar</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [formControl]="q" placeholder="Código, nombre o rubro" />
        </mat-form-field>
        <div class="guy-filters__actions">
          <button mat-flat-button color="primary" type="button" (click)="load()">
            <mat-icon>search</mat-icon>
            Filtrar
          </button>
        </div>
      </form>
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [sortable]="true"
          [canRemove]="never"
          (edit)="openEdit($event)"
        />
      </div>
    </div>
  `,
})
export class AdminPosProductsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly shops = inject(ShopContextService);

  readonly never = () => false;
  readonly q = new FormControl('', { nonNullable: true });
  readonly rows = signal<AdminPosProductRow[]>([]);

  readonly columns: DataTableColumn[] = [
    { key: 'productCode', label: 'Código' },
    { key: 'productName', label: 'Plato' },
    {
      key: 'category',
      label: 'Rubro',
      format: (r) => String(r['category'] || '—'),
    },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageShop(this.auth.currentUser(), shopId)) {
      void this.router.navigate(['/']);
      return;
    }
    this.load();
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const params: Record<string, string> = {};
    const q = this.q.value.trim();
    if (q) params['q'] = q;
    this.http
      .get<AdminPosProductRow[]>(`${environment.apiUrl}/shops/${shopId}/pos-products`, { params })
      .subscribe({
        next: (rows) => this.rows.set(rows),
        error: () => this.snack.open('Error al cargar platos', 'OK', { duration: 3000 }),
      });
  }

  openEdit(row: Record<string, unknown>): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const product = row as unknown as AdminPosProductRow;
    const ref = this.dialogTitle.track(
      this.dialog.open(AdminPosProductDialogComponent, {
        width: '480px',
        maxWidth: '96vw',
        panelClass: 'guy-dialog',
        data: { shopId, product },
      }),
      'Editar plato',
    );
    ref.afterClosed().subscribe((updated) => {
      if (updated) this.load();
    });
  }
}
