import { Component, computed, effect, inject, signal, viewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import {
  ReimbursementRow,
  ReimbursementStatus,
  ReimbursementsApiService,
} from './reimbursements-api.service';
import { ReimbursementsInboxService } from './reimbursements-inbox.service';
import { RecordSavedDialogComponent } from '../../shared/components/record-saved-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateString(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function money(value: number): string {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusLabel(status: ReimbursementStatus): string {
  if (status === 'PAID') return 'Pagado';
  if (status === 'CANCELLED') return 'Cancelado';
  return 'Pendiente';
}

@Component({
  selector: 'app-reimbursements-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatSnackBarModule,
    MatDialogModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  template: `
    <app-page-header
      [title]="canReadAll() ? 'Reintegros' : 'Mis reintegros'"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    @if (loading()) {
      <app-loading-state label="Cargando reintegros" />
    } @else {
      @if (canSelf() && producerLinked()) {
        <section class="panel-card mb-3">
          <div class="panel-card__body">
            <h2 class="guy-list-head__title">Tu alias para transferir</h2>
            <p class="hint">
              Lo usa administración para devolverte el gasto. Podés cambiarlo cuando quieras.
            </p>
            <form class="alias-row" [formGroup]="aliasForm" (ngSubmit)="saveAlias()">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Alias o CBU</mat-label>
                <input matInput formControlName="bankAlias" maxlength="120" />
              </mat-form-field>
              <button mat-flat-button color="primary" type="submit" [disabled]="aliasBusy()">
                Guardar alias
              </button>
            </form>
            @if (profileName()) {
              <p class="small">Productor: {{ profileName() }}</p>
            }
          </div>
        </section>

        <section class="panel-card mb-3">
          <div class="panel-card__body">
            <h2 class="guy-list-head__title">Cargar un gasto</h2>
            <form class="expense-form" [formGroup]="expenseForm" (ngSubmit)="createExpense()">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Fecha</mat-label>
                <input matInput [matDatepicker]="expPicker" formControlName="expenseDate" />
                <mat-datepicker-toggle matIconSuffix [for]="expPicker" />
                <mat-datepicker #expPicker />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span-2">
                <mat-label>Qué compraste / pagaste</mat-label>
                <input matInput formControlName="description" maxlength="200" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Importe $</mat-label>
                <input matInput type="number" min="0.01" step="0.01" formControlName="amount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span-2">
                <mat-label>Notas (opcional)</mat-label>
                <input matInput formControlName="notes" maxlength="500" />
              </mat-form-field>
              <div class="expense-form__actions">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="expenseForm.invalid || saveBusy()"
                >
                  <mat-icon>add</mat-icon>
                  Cargar gasto
                </button>
              </div>
            </form>
          </div>
        </section>
      }

      <section class="panel-card">
        <div class="panel-card__body">
          <div class="guy-list-head">
            <div>
              <h2 class="guy-list-head__title">
                {{ canReadAll() ? 'Gastos a reintegrar' : 'Tus gastos' }}
              </h2>
              <p class="guy-list-head__meta">
                {{ rows().length }} · pendiente {{ money(pendingTotal()) }}
              </p>
            </div>
            @if (canReadAll()) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Estado</mat-label>
                <mat-select [formControl]="statusFilter" (selectionChange)="load()">
                  <mat-option value="PENDING">Pendientes</mat-option>
                  <mat-option value="PAID">Pagados</mat-option>
                  <mat-option value="CANCELLED">Cancelados</mat-option>
                  <mat-option value="">Todos</mat-option>
                </mat-select>
              </mat-form-field>
            }
          </div>

          @if (!rows().length) {
            <div class="guy-empty">
              <mat-icon>inbox</mat-icon>
              <div>
                <strong>No hay gastos en este filtro</strong>
                <div class="small">
                  {{ canSelf() ? 'Cargá el primer gasto arriba.' : 'Cuando un productor cargue, aparece acá.' }}
                </div>
              </div>
            </div>
          } @else {
            <div class="reimb-list">
              @for (row of rows(); track row.id) {
                <article class="reimb-card" [attr.data-status]="row.status">
                  <div class="reimb-card__main">
                    <div class="reimb-card__title">{{ row.description }}</div>
                    <div class="reimb-card__meta">
                      {{ row.expenseDate }}
                      @if (canReadAll() && row.employeeName) {
                        · {{ row.employeeName }}
                      }
                      @if (row.bankAliasSnapshot) {
                        · Alias {{ row.bankAliasSnapshot }}
                      }
                    </div>
                    @if (row.notes) {
                      <div class="reimb-card__notes">{{ row.notes }}</div>
                    }
                    @if (row.status === 'PAID' && row.paidAt) {
                      <div class="reimb-card__meta">
                        Pagado el {{ row.paidAt }}
                        @if (row.paidByName) {
                          · {{ row.paidByName }}
                        }
                      </div>
                    }
                  </div>
                  <div class="reimb-card__side">
                    <div class="reimb-card__amount">{{ money(row.amount) }}</div>
                    <span class="reimb-chip" [attr.data-status]="row.status">
                      {{ statusLabel(row.status) }}
                    </span>
                    <div class="reimb-card__actions">
                      @if (row.hasReceiptFile) {
                        <button mat-stroked-button type="button" (click)="openReceipt(row)">
                          Ver comprobante
                        </button>
                      }
                      @if (canPay() && row.status === 'PENDING') {
                        <button
                          mat-flat-button
                          color="primary"
                          type="button"
                          [disabled]="busyId() === row.id"
                          (click)="markPaid(row)"
                        >
                          Marcar pagado
                        </button>
                        <button
                          mat-stroked-button
                          type="button"
                          [disabled]="busyId() === row.id"
                          (click)="cancelRow(row)"
                        >
                          Cancelar
                        </button>
                      }
                      @if (canPay() && row.status === 'PAID') {
                        <button mat-stroked-button type="button" (click)="pickReceipt(row)">
                          {{ row.hasReceiptFile ? 'Cambiar comprobante' : 'Cargar comprobante' }}
                        </button>
                      }
                      @if (canSelf() && !canPay() && row.status === 'PENDING') {
                        <button
                          mat-stroked-button
                          type="button"
                          [disabled]="busyId() === row.id"
                          (click)="removeMine(row)"
                        >
                          Borrar
                        </button>
                      }
                    </div>
                  </div>
                </article>
              }
            </div>
          }
        </div>
      </section>
    }
    <input
      #receiptInput
      type="file"
      accept="image/*,.pdf,application/pdf"
      hidden
      (change)="onReceiptPicked($event)"
    />
  `,
  styles: `
    .hint {
      margin: 0 0 0.75rem;
      color: var(--guy-muted, #5f6f66);
      font-size: 0.9rem;
    }
    .small {
      color: var(--guy-muted, #5f6f66);
      font-size: 0.85rem;
    }
    .alias-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.75rem;
      align-items: start;
    }
    .expense-form {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
    }
    .span-2 {
      grid-column: span 2;
    }
    .expense-form__actions {
      grid-column: 1 / -1;
    }
    .reimb-list {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .reimb-card {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      background: var(--guy-card, #fff);
    }
    .reimb-card__title {
      font-weight: 700;
    }
    .reimb-card__meta,
    .reimb-card__notes {
      color: var(--guy-muted, #5f6f66);
      font-size: 0.85rem;
      margin-top: 0.15rem;
    }
    .reimb-card__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.35rem;
      flex: 0 0 auto;
    }
    .reimb-card__amount {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .reimb-chip {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: #fff4d6;
      color: #8a5a00;
    }
    .reimb-chip[data-status='PAID'] {
      background: #e5f6e8;
      color: #1b7a32;
    }
    .reimb-chip[data-status='CANCELLED'] {
      background: #f3f3f3;
      color: #666;
    }
    .reimb-card__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.4rem;
    }
    @media (max-width: 720px) {
      .alias-row,
      .expense-form,
      .reimb-card {
        grid-template-columns: 1fr;
        flex-direction: column;
      }
      .span-2 {
        grid-column: auto;
      }
      .reimb-card__side {
        align-items: stretch;
      }
    }
  `,
})
export class ReimbursementsPage {
  readonly shops = inject(ShopContextService);
  private readonly api = inject(ReimbursementsApiService);
  private readonly inbox = inject(ReimbursementsInboxService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private openedReimbursementId: string | null = null;

  readonly loading = signal(true);
  readonly aliasBusy = signal(false);
  readonly saveBusy = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly rows = signal<ReimbursementRow[]>([]);
  readonly profileName = signal('');
  readonly producerLinked = signal(false);
  readonly statusFilter = new FormControl<ReimbursementStatus | ''>('PENDING', { nonNullable: true });
  private readonly receiptInput = viewChild<ElementRef<HTMLInputElement>>('receiptInput');
  private receiptTargetId: string | null = null;

  readonly aliasForm = new FormGroup({
    bankAlias: new FormControl('', { nonNullable: true }),
  });

  readonly expenseForm = new FormGroup({
    expenseDate: new FormControl<Date | null>(new Date(), { validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    notes: new FormControl('', { nonNullable: true }),
  });

  readonly canSelf = computed(() =>
    hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reimbursements.self'),
  );
  readonly canReadAll = computed(() =>
    hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reimbursements.read') ||
    hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reimbursements.manage'),
  );
  readonly canPay = computed(() =>
    hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reimbursements.manage'),
  );

  readonly pendingTotal = computed(() =>
    this.rows()
      .filter((r) => r.status === 'PENDING')
      .reduce((s, r) => s + Number(r.amount || 0), 0),
  );

  readonly money = money;
  readonly statusLabel = statusLabel;

  constructor() {
    usePageRefresh(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.load();
    });
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.loading.set(true);
    if (this.canSelf()) {
      this.api.me(shopId).subscribe({
        next: (p) => {
          this.producerLinked.set(true);
          this.profileName.set(p.fullName);
          this.aliasForm.setValue({ bankAlias: p.bankAlias ?? '' });
        },
        error: () => {
          this.producerLinked.set(false);
          this.profileName.set('');
        },
      });
    } else {
      this.producerLinked.set(false);
    }
    const req = this.canReadAll()
      ? this.api.list(shopId, this.statusFilter.value)
      : this.api.listMine(shopId);
    req.subscribe({
      next: (rows) => {
        this.rows.set(rows ?? []);
        this.loading.set(false);
        this.inbox.refresh();
        this.openReimbursementFromQuery(rows ?? []);
      },
      error: (err) => {
        this.rows.set([]);
        this.loading.set(false);
        const msg = err?.error?.message ?? 'No se pudieron cargar los reintegros';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private openReimbursementFromQuery(rows: ReimbursementRow[]): void {
    const id = (this.route.snapshot.queryParamMap.get('reimbursement') || '').trim();
    if (!id || this.openedReimbursementId === id) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    this.openedReimbursementId = id;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle.track(
      this.dialog.open(RecordSavedDialogComponent, {
        width: '440px',
        maxWidth: '95vw',
        panelClass: 'guy-dialog',
        data: {
          title: 'Reintegro',
          subtitle: 'Desde la notificación.',
          shareTitle: `Reintegro · ${shopName}`,
          icon: 'receipt_long',
          iconOk: false,
          fields: [
            { label: 'Local', value: shopName },
            { label: 'Productor', value: row.employeeName || '—' },
            { label: 'Descripción', value: row.description || '—' },
            { label: 'Fecha', value: row.expenseDate || '—' },
            { label: 'Estado', value: statusLabel(row.status) },
            { label: 'Monto', value: money(row.amount), emphasize: true },
          ],
        },
      }),
      'Reintegro',
    );
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { reimbursement: null, shop: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  saveAlias(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.aliasBusy.set(true);
    this.api.updateAlias(shopId, this.aliasForm.controls.bankAlias.value.trim() || null).subscribe({
      next: (p) => {
        this.aliasBusy.set(false);
        this.aliasForm.setValue({ bankAlias: p.bankAlias ?? '' });
        this.snack.open('Alias guardado', 'OK', { duration: 2200 });
      },
      error: (err) => {
        this.aliasBusy.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar el alias';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  createExpense(): void {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.expenseForm.getRawValue();
    const expenseDate = toDateString(raw.expenseDate) || isoToday();
    this.saveBusy.set(true);
    this.api
      .createMine(shopId, {
        description: raw.description.trim(),
        amount: Number(raw.amount),
        expenseDate,
        notes: raw.notes.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saveBusy.set(false);
          this.expenseForm.reset({
            expenseDate: new Date(),
            description: '',
            amount: null,
            notes: '',
          });
          this.snack.open('Gasto cargado. Administración lo va a reintegrar', 'OK', {
            duration: 2800,
          });
          this.load();
        },
        error: (err) => {
          this.saveBusy.set(false);
          const msg = err?.error?.message ?? 'No se pudo cargar el gasto';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  async markPaid(row: ReimbursementRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirm.confirm(
      'Marcar como pagado',
      `¿Confirmás el reintegro de ${money(row.amount)} a ${row.employeeName ?? 'este productor'}?`,
      { confirmLabel: 'Marcar pagado', confirmColor: 'primary', icon: 'payments' },
    );
    if (!ok) return;
    this.busyId.set(row.id);
    this.api.pay(shopId, row.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.snack.open('Marcado como pagado. Ahora podés cargar el comprobante', 'OK', {
          duration: 3200,
        });
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        const msg = err?.error?.message ?? 'No se pudo marcar como pagado';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  async cancelRow(row: ReimbursementRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirm.confirm(
      'Cancelar gasto',
      `Se cancela “${row.description}” de ${money(row.amount)}.`,
      { confirmLabel: 'Cancelar gasto', icon: 'cancel' },
    );
    if (!ok) return;
    this.busyId.set(row.id);
    this.api.cancel(shopId, row.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
      },
      error: () => {
        this.busyId.set(null);
        this.snack.open('No se pudo cancelar', 'OK', { duration: 3000 });
      },
    });
  }

  async removeMine(row: ReimbursementRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirm.confirm(
      'Borrar gasto',
      `Se borra “${row.description}”.`,
      { confirmLabel: 'Borrar', icon: 'delete' },
    );
    if (!ok) return;
    this.busyId.set(row.id);
    this.api.removeMine(shopId, row.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
      },
      error: () => {
        this.busyId.set(null);
        this.snack.open('No se pudo borrar', 'OK', { duration: 3000 });
      },
    });
  }

  pickReceipt(row: ReimbursementRow): void {
    this.receiptTargetId = row.id;
    this.receiptInput()?.nativeElement.click();
  }

  onReceiptPicked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    const shopId = this.shops.selectedShopId();
    const id = this.receiptTargetId;
    input.value = '';
    this.receiptTargetId = null;
    if (!file || !shopId || !id) return;
    this.busyId.set(id);
    this.api.uploadReceiptFile(shopId, id, file).subscribe({
      next: () => {
        this.busyId.set(null);
        this.snack.open('Comprobante cargado', 'OK', { duration: 2200 });
        this.load();
      },
      error: () => {
        this.busyId.set(null);
        this.snack.open('No se pudo subir el comprobante', 'OK', { duration: 3500 });
      },
    });
  }

  openReceipt(row: ReimbursementRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.downloadReceiptFile(shopId, row.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => this.snack.open('No se pudo abrir el comprobante', 'OK', { duration: 3000 }),
    });
  }
}
