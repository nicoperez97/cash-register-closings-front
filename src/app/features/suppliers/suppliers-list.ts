import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopSupplier, SuppliersApiService } from './suppliers-api.service';
import { SupplierDialogComponent } from './supplier-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';

@Component({
  selector: 'app-suppliers-list',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Proveedores"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      [actionLabel]="canManage() ? 'Nuevo proveedor' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div class="panel-card guy-filters mb-3">
      <div class="guy-filters__head">
        <div>
          <h3 class="guy-filters__title">Filtros</h3>
          <p class="guy-filters__subtitle">Incluí proveedores ocultos</p>
        </div>
      </div>
      <mat-slide-toggle [ngModel]="includeInactive()" (ngModelChange)="onToggleInactive($event)">
        Mostrar ocultos
      </mat-slide-toggle>
    </div>

    <div class="supplier-list">
      @for (row of rows(); track row.id) {
        <article class="panel-card supplier-card" [class.supplier-card--hidden]="!row.active">
          <div class="supplier-card__main">
            <div>
              <h3 class="supplier-card__name">{{ row.name }}</h3>
              <p class="supplier-card__meta">
                {{ row.accountName || 'Sin cuenta' }}
                @if (!row.active) {
                  · Oculto
                }
              </p>
            </div>
            @if (canManage()) {
              <div class="supplier-card__actions">
                <button mat-icon-button type="button" matTooltip="Editar" (click)="openEdit(row)">
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  type="button"
                  [matTooltip]="row.active ? 'Ocultar' : 'Mostrar'"
                  (click)="onToggleVisibility(row)"
                >
                  <mat-icon>{{ row.active ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </div>
            }
          </div>

          <div class="supplier-card__alias">
            <span class="supplier-card__label">Alias / CBU</span>
            <div class="supplier-card__alias-row">
              <code class="supplier-card__value">{{ row.bankAlias || '—' }}</code>
              @if (row.bankAlias) {
                <button
                  mat-stroked-button
                  type="button"
                  (click)="copyAlias(row)"
                >
                  <mat-icon>content_copy</mat-icon>
                  Copiar
                </button>
              }
            </div>
          </div>
        </article>
      } @empty {
        <div class="panel-card guy-empty">
          <mat-icon>local_shipping</mat-icon>
          <div>
            <strong>Sin proveedores todavía</strong>
            <div class="small">Creá el primero para asociarle una cuenta y su alias/CBU.</div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .supplier-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .supplier-card__main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.85rem;
      }
      .supplier-card__name {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .supplier-card__meta {
        margin: 0.2rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .supplier-card__actions {
        display: flex;
        gap: 0.15rem;
      }
      .supplier-card__label {
        display: block;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--guy-muted, #5f6f76);
        margin-bottom: 0.25rem;
      }
      .supplier-card__alias-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
      .supplier-card__value {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.95rem;
        word-break: break-all;
      }
      .supplier-card--hidden {
        opacity: 0.72;
      }
    `,
  ],
})
export class SuppliersListPage {
  private readonly api = inject(SuppliersApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly rows = signal<ShopSupplier[]>([]);
  readonly includeInactive = signal(false);

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        return;
      }
      this.reload();
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'suppliers.manage',
    );
  }

  onToggleInactive(value: boolean): void {
    this.includeInactive.set(value);
    this.reload();
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.list(shopId, this.includeInactive()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.snack.open('No se pudieron cargar los proveedores', 'OK', { duration: 3000 }),
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: ShopSupplier): void {
    this.openDialog({ mode: 'edit', supplier: row });
  }

  async copyAlias(row: ShopSupplier): Promise<void> {
    const text = (row.bankAlias ?? '').trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.snack.open('Alias / CBU copiado', 'OK', { duration: 2000 });
    } catch {
      this.snack.open('No se pudo copiar', 'OK', { duration: 2500 });
    }
  }

  async onToggleVisibility(row: ShopSupplier): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;

    if (row.active) {
      const ok = await this.confirmDialog.confirm(
        'Ocultar proveedor',
        `¿Ocultar a "${row.name}"?`,
      );
      if (!ok) return;
      this.api.remove(shopId, row.id).subscribe({
        next: () => {
          this.snack.open('Proveedor oculto', 'OK', { duration: 2500 });
          this.reload();
        },
        error: () => this.snack.open('No se pudo ocultar', 'OK', { duration: 3500 }),
      });
      return;
    }

    this.api.update(shopId, row.id, { active: true }).subscribe({
      next: () => {
        this.snack.open('Proveedor visible de nuevo', 'OK', { duration: 2500 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo mostrar', 'OK', { duration: 3500 }),
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; supplier: ShopSupplier },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(SupplierDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, shopId, shopName },
        }),
        mode.mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
