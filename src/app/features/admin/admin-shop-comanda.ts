import { Component, computed, inject } from '@angular/core';
import {
  ControlContainer,
  FormArray,
  FormBuilder,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ADMIN_SHOP_HOST } from './admin-shop-host';
import { copyText } from '../../shared/utils/share-text';
import { WAITER_CAP_FIELDS, type WaiterCapProfile } from './waiter-capabilities';

@Component({
  selector: 'app-admin-shop-comanda',
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  template: `
    <div [formGroup]="host.form">
      <section class="panel-card guy-form-section">
        <div class="op__head">
          <h2 class="op__title">Comandas</h2>
          <p class="op__lead">
            Operación → Comanda, link público /mozo, medios de pago de mesa y permisos.
            Independiente de Pedidos: un restaurante puede tener mesas y también take away y delivery.
          </p>
        </div>

        <div class="op__toggles">
          <div class="op__row-toggle">
            <div>
              <strong>Comanda mozos</strong>
              <span>Operación → Comanda y página /mozo/… con PIN</span>
            </div>
            <mat-slide-toggle
              formControlName="waiterOrderingEnabled"
              aria-label="Comanda mozos"
            />
          </div>
        </div>

        @if (waiterOn() && waiterPublicUrl()) {
          <div class="op__public op__public--inline">
            <a class="op__public-btn" [href]="waiterPublicUrl()" target="_blank" rel="noopener">
              <mat-icon>open_in_new</mat-icon>
              Abrir link
            </a>
            <button
              type="button"
              class="op__public-btn op__public-btn--ghost"
              (click)="copyWaiterPublicUrl()"
            >
              <mat-icon>content_copy</mat-icon>
              Copiar link
            </button>
          </div>
          <p class="op__public-url">{{ waiterPublicUrl() }}</p>
        }

        <h3 class="op__subtitle">Atajos de descuento</h3>
        <p class="op__schedule-hint">
          Botones rápidos en el ticket de mesa y en la caja rápida de Pedidos clientes. Por defecto
          viene «10%». Seguen disponibles No, % y $ para monto libre.
        </p>
        <div class="op__pays" formArrayName="discountPresets">
          @for (p of discountPresets.controls; track $index; let i = $index) {
            <div class="op__pay" [formGroupName]="i">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__pay-name">
                <mat-label>Etiqueta</mat-label>
                <input matInput formControlName="label" placeholder="ej. 10%" />
              </mat-form-field>
              <mat-form-field
                appearance="outline"
                subscriptSizing="dynamic"
                class="op__pay-account"
              >
                <mat-label>Tipo</mat-label>
                <mat-select formControlName="mode">
                  <mat-option value="percent">Porcentaje</mat-option>
                  <mat-option value="fixed">Monto fijo</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__pay-account">
                <mat-label>Valor</mat-label>
                <input matInput type="number" min="0" step="1" formControlName="value" />
              </mat-form-field>
              <button
                mat-icon-button
                type="button"
                class="op__pay-del"
                (click)="removeDiscountPreset(i)"
                aria-label="Quitar"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>
        <button mat-stroked-button type="button" class="op__pay-add" (click)="addDiscountPreset()">
          <mat-icon>add</mat-icon>
          Agregar atajo
        </button>

        @if (waiterOn()) {
          <h3 class="op__subtitle">Medios de pago de mesa</h3>
          <p class="op__schedule-hint">
            Al cerrar una mesa el mozo elige uno. Podés vincular cada medio a una cuenta del local.
          </p>
          <div class="op__pays" formArrayName="tablePaymentMethods">
            @for (m of tablePays.controls; track $index; let i = $index) {
              <div class="op__pay" [formGroupName]="i">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__pay-name">
                  <mat-label>Nombre</mat-label>
                  <input matInput formControlName="name" placeholder="ej. Efectivo" />
                </mat-form-field>
                <mat-form-field
                  appearance="outline"
                  subscriptSizing="dynamic"
                  class="op__pay-account"
                >
                  <mat-label>Cuenta</mat-label>
                  <mat-select formControlName="accountId">
                    <mat-option [value]="null">Sin vincular</mat-option>
                    @for (a of ledgerAccounts(); track a.id) {
                      <mat-option [value]="a.id">{{ a.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  class="op__pay-del"
                  (click)="removeTablePay(i)"
                  aria-label="Quitar"
                  [disabled]="tablePays.length <= 1"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
          <button mat-stroked-button type="button" class="op__pay-add" (click)="addTablePay()">
            <mat-icon>add</mat-icon>
            Agregar medio
          </button>

          <h3 class="op__subtitle">Permisos página /mozo</h3>
          <p class="op__schedule-hint">
            Qué puede hacer el mozo con PIN. Los defaults aplican al armar el envío.
          </p>
          <div class="op__toggles" formGroupName="waiterCapabilities">
            <div class="op__caps" formGroupName="public">
              @for (f of capFields; track f.key) {
                @if (!f.staffOnly && (!f.showIf || capParentOn('public', f.showIf))) {
                  <div class="op__row-toggle">
                    <div>
                      <strong>{{ f.label }}</strong>
                      @if (f.hint) {
                        <span>{{ f.hint }}</span>
                      }
                    </div>
                    <mat-slide-toggle [formControlName]="f.key" [attr.aria-label]="f.label" />
                  </div>
                }
              }
            </div>
          </div>

          <h3 class="op__subtitle">Permisos Operación → Comanda</h3>
          <p class="op__schedule-hint">
            Misma lista para la comanda del admin (sin PIN). Independiente de /mozo.
          </p>
          <div class="op__toggles" formGroupName="waiterCapabilities">
            <div class="op__caps" formGroupName="staff">
              @for (f of capFields; track f.key) {
                @if (!f.showIf || capParentOn('staff', f.showIf)) {
                  <div class="op__row-toggle">
                    <div>
                      <strong>{{ f.label }}</strong>
                      @if (f.hint) {
                        <span>{{ f.hint }}</span>
                      }
                    </div>
                    <mat-slide-toggle [formControlName]="f.key" [attr.aria-label]="f.label" />
                  </div>
                }
              }
            </div>
          </div>
        } @else {
          <p class="op__schedule-hint">
            Activá Comanda mozos para configurar medios de pago y permisos. La carta y los sectores
            de mesa se cargan en Salón → Mesas.
          </p>
        }

        <p class="op__schedule-hint" style="margin-top: 1rem">
          Pedidos online (/pedir) se configuran en
          <a routerLink="/admin/shop/pedidos">Pedidos</a>.
        </p>
      </section>
    </div>
  `,
  styleUrl: './admin-shop-operation.scss',
})
export class AdminShopComandaComponent {
  readonly host = inject(ADMIN_SHOP_HOST);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly capFields = WAITER_CAP_FIELDS;
  readonly waiterOn = computed(() => !!this.host.formValue()?.waiterOrderingEnabled);
  readonly ledgerAccounts = computed(() => this.host.allLedgerAccounts());

  capParentOn(profile: 'public' | 'staff', key?: keyof WaiterCapProfile): boolean {
    if (!key) return true;
    return !!this.host.form.get(['waiterCapabilities', profile, key])?.value;
  }

  waiterPublicUrl(): string {
    const slug = String(this.host.liveSlug?.() ?? this.host.formValue()?.slug ?? '').trim();
    if (!slug) return '';
    return `${window.location.origin}/mozo/${encodeURIComponent(slug)}`;
  }

  async copyWaiterPublicUrl(): Promise<void> {
    const url = this.waiterPublicUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de comanda mozos copiado' : 'No se pudo copiar la URL', 'OK', {
      duration: 2500,
    });
  }

  get tablePays(): FormArray {
    return this.host.form.get('tablePaymentMethods') as FormArray;
  }

  get discountPresets(): FormArray {
    return this.host.form.get('discountPresets') as FormArray;
  }

  addDiscountPreset(): void {
    this.host.addDiscountPreset();
  }

  removeDiscountPreset(index: number): void {
    this.host.removeDiscountPreset(index);
  }

  addTablePay(): void {
    this.tablePays.push(
      this.fb.nonNullable.group({
        id: [''],
        name: [''],
        accountId: this.fb.control<string | null>(null),
        active: [true],
      }),
    );
  }

  removeTablePay(index: number): void {
    if (this.tablePays.length <= 1) return;
    this.tablePays.removeAt(index);
  }
}
