import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { PaymentFilePreviewDialogComponent } from '../payments/payment-file-preview-dialog';
import { Order, OrdersApiService, orderSourceLabel } from './orders-api.service';
import { OrderDialogComponent } from './order-dialog';

@Component({
  selector: 'app-orders-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  template: `
    <app-page-header
      title="Pedidos"
      [subtitle]="shops.selectedShop()?.name ?? ''"
      [actionLabel]="canManage() ? 'Nuevo pedido' : ''"
      actionIcon="add"
      (action)="openCreate()"
    />

    <section class="panel-card mb-3">
      <div class="panel-card__body guy-filters">
        <form class="ord-filters" [formGroup]="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Desde</mat-label>
            <input matInput [matDatepicker]="fromPicker" formControlName="from" />
            <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
            <mat-datepicker #fromPicker />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Hasta</mat-label>
            <input matInput [matDatepicker]="toPicker" formControlName="to" />
            <mat-datepicker-toggle matIconSuffix [for]="toPicker" />
            <mat-datepicker #toPicker />
          </mat-form-field>
          <button mat-stroked-button type="button" (click)="reload()">
            <mat-icon>search</mat-icon>
            Filtrar
          </button>
        </form>
      </div>
    </section>

    @if (loading()) {
      <app-loading-state label="Cargando pedidos" />
    } @else if (!rows().length) {
      <p class="text-muted">Todavía no hay pedidos en este período.</p>
    } @else {
      <div class="ord-list">
        @for (row of rows(); track row.id) {
          <article class="panel-card ord-card">
            <div class="panel-card__body">
              <header class="ord-card__head">
                <div>
                  <strong>{{ row.orderDate | date: 'dd/MM/yyyy' }}</strong>
                  <p>{{ summary(row) }}</p>
                </div>
                <div class="ord-card__actions">
                  @if (row.hasInvoiceFile) {
                    <button mat-stroked-button type="button" (click)="previewInvoice(row)">
                      <mat-icon>picture_as_pdf</mat-icon>
                      Factura
                    </button>
                  }
                  @if (canManage()) {
                    <button mat-icon-button type="button" aria-label="Borrar" (click)="remove(row)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </div>
              </header>
              <ul>
                @for (line of row.lines; track line.id) {
                  <li>
                    {{ orderSourceLabel(line.source) }} · {{ line.name }} · {{ line.quantity }}
                  </li>
                }
              </ul>
              @if (row.notes) {
                <p class="ord-card__notes">{{ row.notes }}</p>
              }
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: `
    .ord-filters {
      display: grid;
      gap: 0.6rem;
    }
    .ord-list {
      display: grid;
      gap: 0.7rem;
    }
    .ord-card__head {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: flex-start;
    }
    .ord-card__head p,
    .ord-card ul,
    .ord-card__notes {
      margin: 0.25rem 0 0;
      color: var(--guy-muted, #667);
    }
    .ord-card ul {
      padding-left: 1.1rem;
    }
    .ord-card__actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    @media (min-width: 720px) {
      .ord-filters {
        grid-template-columns: 12rem 12rem auto;
        align-items: center;
      }
    }
  `,
})
export class OrdersPage {
  private readonly api = inject(OrdersApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(false);
  readonly rows = signal<Order[]>([]);
  readonly orderSourceLabel = orderSourceLabel;

  readonly filters = new FormGroup({
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  constructor() {
    usePageRefresh(() => this.reload());
    this.reload();
  }

  canManage(): boolean {
    const shopId = this.shops.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'orders.manage');
  }

  summary(row: Order): string {
    const n = row.lines.length;
    return `${n} ${n === 1 ? 'material' : 'materiales'}`;
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const from = this.toIso(this.filters.controls.from.value);
    const to = this.toIso(this.filters.controls.to.value);
    this.loading.set(true);
    this.api.list(shopId, { from: from ?? undefined, to: to ?? undefined }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los pedidos', 'OK', { duration: 3500 });
      },
    });
  }

  openCreate(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.dialogTitle
      .track(
        this.dialog.open(OrderDialogComponent, {
          width: '720px',
          maxWidth: '100vw',
          panelClass: 'guy-dialog',
          data: { shopId },
        }),
        'Nuevo pedido',
      )
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.snack.open('Pedido guardado. El stock de alimentos y bebidas se actualizó.', 'OK', {
            duration: 4000,
          });
          this.reload();
        }
      });
  }

  previewInvoice(row: Order): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.downloadInvoice(shopId, row.id).subscribe({
      next: (blob) => {
        this.dialog.open(PaymentFilePreviewDialogComponent, {
          width: '860px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            title: 'Factura del pedido',
            fileName: row.invoiceFileName || 'factura',
            blob,
          },
        });
      },
      error: () => this.snack.open('No se pudo abrir la factura', 'OK', { duration: 3500 }),
    });
  }

  async remove(row: Order): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirm.confirm(
      'Borrar pedido',
      `¿Borrar el pedido del ${row.orderDate}? Si sumó stock, se revierte.`,
    );
    if (!ok) return;
    this.api.remove(shopId, row.id).subscribe({
      next: () => {
        this.snack.open('Pedido borrado', 'OK', { duration: 3000 });
        this.reload();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo borrar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private toIso(value: Date | null): string | null {
    if (!value) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
}
