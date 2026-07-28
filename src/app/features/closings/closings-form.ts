import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { startWith } from 'rxjs';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ClosingsApiService } from './closings-api.service';
import { environment } from '../../../environments/environment';

interface ShopUserOption {
  id: string;
  fullName: string;
  email?: string;
}

@Component({
  selector: 'app-closings-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      [title]="isEdit() ? 'Editar cierre' : 'Nuevo cierre'"
      [subtitle]="shop()?.name ?? ''"
    />

    <div class="panel-card">
      <form class="guy-form-grid guy-form-grid--2" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput type="date" formControlName="businessDate" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Caja (sistema)</mat-label>
          <input matInput type="number" formControlName="posSystemAmount" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>PVS</mat-label>
          <input matInput type="number" formControlName="cardAmount" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Efectivo</mat-label>
          <input matInput type="number" formControlName="cashAmount" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>MercadoPago</mat-label>
          <input matInput type="number" formControlName="mercadoPagoAmount" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>PedidosYa / delivery</mat-label>
          <input matInput type="number" formControlName="deliveryAppsAmount" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Transferencia</mat-label>
          <input matInput type="number" formControlName="transferAmount" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Cuenta DNI</mat-label>
          <input matInput type="number" formControlName="accountDniAmount" />
        </mat-form-field>
        @if (shop()?.unitsLabel) {
          <mat-form-field appearance="outline">
            <mat-label>{{ shop()?.unitsLabel }}</mat-label>
            <input matInput type="number" formControlName="unitsSold" />
          </mat-form-field>
        }
        @if (shop()?.coversEnabled) {
          <mat-form-field appearance="outline">
            <mat-label>Comensales</mat-label>
            <input matInput type="number" formControlName="coversCount" />
          </mat-form-field>
        }
        <mat-form-field appearance="outline">
          <mat-label>Cambio en caja</mat-label>
          <input matInput type="number" formControlName="cashLeftInRegister" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Efectivo retirado</mat-label>
          <input matInput type="number" formControlName="cashWithdrawn" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Quién se lo lleva</mat-label>
          <mat-select formControlName="cashWithdrawnByUserId">
            <mat-option value="">— Sin asignar —</mat-option>
            @for (u of shopUsers(); track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Propinas</mat-label>
          <input matInput type="number" formControlName="tipsAmount" />
        </mat-form-field>

        <div class="closing-totals" style="grid-column:1/-1">
          <div class="closing-totals__row">
            <span>Suma (sin caja)</span>
            <strong>{{ money(declaredTotal()) }}</strong>
          </div>
          <div class="closing-totals__row">
            <span>Caja (sistema)</span>
            <strong>{{ money(posAmount()) }}</strong>
          </div>
          <div
            class="closing-totals__row closing-totals__diff"
            [class.closing-totals__diff--ok]="difference() === 0"
            [class.closing-totals__diff--pos]="difference() > 0"
            [class.closing-totals__diff--neg]="difference() < 0"
          >
            <span>Diferencia (caja − suma)</span>
            <strong>{{ money(difference()) }}</strong>
          </div>
          @if (difference() !== 0) {
            <p class="closing-totals__hint mb-0">
              {{
                difference() > 0
                  ? 'La caja del sistema es mayor que lo declarado.'
                  : 'Lo declarado supera la caja del sistema.'
              }}
            </p>
          }
        </div>

        <mat-form-field appearance="outline" class="guy-form-grid--span" style="grid-column:1/-1">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="3" formControlName="notes"></textarea>
        </mat-form-field>
        <div class="d-flex gap-2" style="grid-column:1/-1">
          <button mat-flat-button color="primary" type="submit">Guardar</button>
          <button mat-stroked-button type="button" (click)="cancel()">Cancelar</button>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
      .closing-totals {
        display: grid;
        gap: 0.5rem;
        padding: 0.9rem 1rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, var(--guy-card, #fff));
      }
      .closing-totals__row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 1rem;
        font-size: 0.95rem;
      }
      .closing-totals__diff {
        padding-top: 0.45rem;
        border-top: 1px dashed var(--guy-border, #d7e0d9);
        font-size: 1.05rem;
      }
      .closing-totals__diff--ok strong {
        color: var(--guy-accent, #2e7d32);
      }
      .closing-totals__diff--pos strong {
        color: #c62828;
      }
      .closing-totals__diff--neg strong {
        color: #ef6c00;
      }
      .closing-totals__hint {
        font-size: 0.8rem;
        color: var(--guy-muted, #667);
      }
    `,
  ],
})
export class ClosingsFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ClosingsApiService);
  private readonly http = inject(HttpClient);
  private readonly shops = inject(ShopContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly shop = this.shops.selectedShop;
  readonly isEdit = signal(false);
  readonly shopUsers = signal<ShopUserOption[]>([]);
  private closingId: string | null = null;

  readonly form = this.fb.nonNullable.group({
    businessDate: ['', Validators.required],
    posSystemAmount: [0],
    cardAmount: [0],
    cashAmount: [0],
    mercadoPagoAmount: [0],
    deliveryAppsAmount: [0],
    transferAmount: [0],
    accountDniAmount: [0],
    unitsSold: [0 as number | null],
    coversCount: [0 as number | null],
    cashLeftInRegister: [0],
    cashWithdrawn: [0],
    cashWithdrawnByUserId: [''],
    tipsAmount: [0],
    notes: [''],
  });

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  readonly declaredTotal = computed(() => {
    const v = this.formValue();
    return (
      this.n(v.cardAmount) +
      this.n(v.cashAmount) +
      this.n(v.mercadoPagoAmount) +
      this.n(v.deliveryAppsAmount) +
      this.n(v.transferAmount) +
      this.n(v.accountDniAmount)
    );
  });

  readonly posAmount = computed(() => this.n(this.formValue().posSystemAmount));

  readonly difference = computed(() => this.posAmount() - this.declaredTotal());

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (shopId) {
      this.http
        .get<ShopUserOption[]>(`${environment.apiUrl}/shops/${shopId}/users`)
        .subscribe({
          next: (rows) => this.shopUsers.set(rows),
          error: () => this.snack.open('No se pudieron cargar los usuarios del local', 'OK', { duration: 3000 }),
        });
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new' && shopId) {
      this.isEdit.set(true);
      this.closingId = id;
      this.api.get(shopId, id).subscribe((c) => {
        this.form.patchValue({
          businessDate: c.businessDate,
          posSystemAmount: c.posSystemAmount,
          cardAmount: c.cardAmount,
          cashAmount: c.cashAmount,
          mercadoPagoAmount: c.mercadoPagoAmount,
          deliveryAppsAmount: c.deliveryAppsAmount,
          transferAmount: c.transferAmount,
          accountDniAmount: c.accountDniAmount,
          unitsSold: c.unitsSold ?? null,
          coversCount: c.coversCount ?? null,
          cashLeftInRegister: c.cashLeftInRegister,
          cashWithdrawn: c.cashWithdrawn,
          cashWithdrawnByUserId: c.cashWithdrawnByUserId ?? '',
          tipsAmount: c.tipsAmount,
          notes: c.notes ?? '',
        });
      });
    } else {
      const today = new Date().toISOString().slice(0, 10);
      this.form.patchValue({
        businessDate: today,
        cashLeftInRegister: this.shop()?.defaultChangeAmount ?? 0,
      });
    }
  }

  money(value: number): string {
    return `$ ${value.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  private n(v: unknown): number {
    const num = Number(v ?? 0);
    return Number.isFinite(num) ? num : 0;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.snack.open('Seleccioná un local', 'OK', { duration: 2500 });
      return;
    }
    const raw = this.form.getRawValue();
    const userId = raw.cashWithdrawnByUserId || null;
    const selected = this.shopUsers().find((u) => u.id === userId);
    const body = {
      ...raw,
      unitsSold: raw.unitsSold || null,
      coversCount: raw.coversCount || null,
      cashWithdrawnByUserId: userId,
      cashWithdrawnByName: selected?.fullName ?? null,
      declaredTotal: this.declaredTotal(),
    };
    const req$ =
      this.isEdit() && this.closingId
        ? this.api.update(shopId, this.closingId, body)
        : this.api.create(shopId, body);
    req$.subscribe({
      next: () => {
        this.snack.open('Cierre guardado', 'OK', { duration: 2500 });
        void this.router.navigate(['/closings']);
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  cancel(): void {
    void this.router.navigate(['/closings']);
  }
}
