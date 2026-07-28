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
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { defaultHomeRoute, isCashierOnly } from '../../core/auth/auth.models';
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
  ],
  host: {
    class: 'closing-form-page',
    '[class.closing-form-page--cashier]': 'cashierOnly()',
  },
  template: `
    <div class="closing-form-shell panel-card">
      <header class="closing-form-head">
        <div>
          <h1>{{ isEdit() ? 'Editar cierre' : 'Nuevo cierre' }}</h1>
          <p>{{ shop()?.name ?? '' }}</p>
        </div>
        <div class="closing-form-actions">
          @if (!cashierOnly()) {
            <button mat-stroked-button type="button" (click)="cancel()">Cancelar</button>
          }
          <button mat-flat-button color="primary" type="submit" form="closing-form">
            Guardar cierre
          </button>
        </div>
      </header>

      <form id="closing-form" class="closing-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="closing-form__cols">
          <section class="closing-form__section">
            <h2>Cobros del día</h2>
            <div class="closing-form__fields">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Fecha</mat-label>
                <input matInput type="date" formControlName="businessDate" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Caja (sistema)</mat-label>
                <input matInput type="number" formControlName="posSystemAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>PVS</mat-label>
                <input matInput type="number" formControlName="cardAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Efectivo</mat-label>
                <input matInput type="number" formControlName="cashAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>MercadoPago</mat-label>
                <input matInput type="number" formControlName="mercadoPagoAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>PedidosYa / delivery</mat-label>
                <input matInput type="number" formControlName="deliveryAppsAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Transferencia</mat-label>
                <input matInput type="number" formControlName="transferAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cuenta DNI</mat-label>
                <input matInput type="number" formControlName="accountDniAmount" />
              </mat-form-field>
            </div>
          </section>

          <section class="closing-form__section">
            <h2>Retiro y extras</h2>
            <div class="closing-form__fields">
              @if (shop()?.unitsLabel) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ shop()?.unitsLabel }}</mat-label>
                  <input matInput type="number" formControlName="unitsSold" />
                </mat-form-field>
              }
              @if (shop()?.coversEnabled) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Comensales</mat-label>
                  <input matInput type="number" formControlName="coversCount" />
                </mat-form-field>
              }
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cambio en caja</mat-label>
                <input matInput type="number" formControlName="cashLeftInRegister" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Efectivo retirado</mat-label>
                <input matInput type="number" formControlName="cashWithdrawn" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Quién se lo lleva</mat-label>
                <mat-select formControlName="cashWithdrawnByUserId">
                  <mat-option value="">— Sin asignar —</mat-option>
                  @for (u of shopUsers(); track u.id) {
                    <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Propinas</mat-label>
                <input matInput type="number" formControlName="tipsAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="closing-notes" subscriptSizing="dynamic">
                <mat-label>Notas</mat-label>
                <textarea matInput rows="2" formControlName="notes"></textarea>
              </mat-form-field>
            </div>
          </section>
        </div>

        <div class="closing-totals">
          <div class="closing-totals__item">
            <span>Suma cobros</span>
            <strong>{{ money(declaredTotal()) }}</strong>
          </div>
          <div class="closing-totals__item">
            <span>Caja sistema</span>
            <strong>{{ money(posAmount()) }}</strong>
          </div>
          <div
            class="closing-totals__item closing-totals__diff"
            [class.closing-totals__diff--ok]="difference() === 0"
            [class.closing-totals__diff--pos]="difference() > 0"
            [class.closing-totals__diff--neg]="difference() < 0"
          >
            <span>Diferencia</span>
            <strong>{{ money(difference()) }}</strong>
          </div>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      :host.closing-form-page--cashier {
        max-width: 920px;
        margin-inline: auto;
      }

      .closing-form-shell {
        padding: 1rem 1.15rem 1.1rem;
      }

      .closing-form-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 0.85rem;
      }

      .closing-form-head h1 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
        line-height: 1.2;
      }

      .closing-form-head p {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-form-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }

      .closing-form__cols {
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 1.15rem;
        align-items: start;
      }

      .closing-form__section {
        padding: 0.9rem 1rem 1rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 12px;
        background: color-mix(in srgb, var(--guy-card, #fff) 92%, var(--guy-surface, #f3f6f4));
      }

      .closing-form__section h2 {
        margin: 0 0 0.55rem;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-form__fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.85rem 1rem;
      }

      .closing-notes {
        grid-column: 1 / -1;
      }

      .closing-form__fields .mat-mdc-form-field {
        margin-bottom: 0 !important;
      }

      :host ::ng-deep .closing-form__fields .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }

      :host ::ng-deep .closing-form__fields .mat-mdc-form-field-infix {
        min-height: 42px !important;
        padding-top: 10px !important;
        padding-bottom: 10px !important;
      }

      .closing-totals {
        margin-top: 0.85rem;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.65rem;
        padding: 0.7rem 0.9rem;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 28%, var(--guy-border, #d7e0d9));
        background: linear-gradient(
          105deg,
          color-mix(in srgb, var(--guy-accent, #2e7d32) 10%, #fff),
          #fff 55%
        );
      }

      .closing-totals__item {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
      }

      .closing-totals__item span {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-totals__item strong {
        font-size: 1.15rem;
        line-height: 1.15;
        color: var(--guy-navy, #003366);
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

      @media (max-width: 960px) {
        .closing-form__cols {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 560px) {
        .closing-form__fields {
          grid-template-columns: 1fr;
        }
        .closing-totals {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class ClosingsFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ClosingsApiService);
  private readonly http = inject(HttpClient);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly shop = this.shops.selectedShop;
  readonly isEdit = signal(false);
  readonly shopUsers = signal<ShopUserOption[]>([]);
  readonly cashierOnly = () => isCashierOnly(this.auth.currentUser(), this.shops.selectedShopId());
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
        if (this.cashierOnly() && !this.isEdit()) {
          this.resetForNextClosing();
          return;
        }
        void this.router.navigateByUrl(
          defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
        );
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  cancel(): void {
    void this.router.navigateByUrl(
      defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
    );
  }

  private resetForNextClosing(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.form.reset({
      businessDate: today,
      posSystemAmount: 0,
      cardAmount: 0,
      cashAmount: 0,
      mercadoPagoAmount: 0,
      deliveryAppsAmount: 0,
      transferAmount: 0,
      accountDniAmount: 0,
      unitsSold: null,
      coversCount: null,
      cashLeftInRegister: this.shop()?.defaultChangeAmount ?? 0,
      cashWithdrawn: 0,
      cashWithdrawnByUserId: '',
      tipsAmount: 0,
      notes: '',
    });
  }
}
