import { Component, computed, inject, input, output } from '@angular/core';
import {
  ControlContainer,
  FormArray,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { ADMIN_SHOP_HOST } from './admin-shop-host';

export interface AdminShopTimezoneOption {
  value: string;
  label: string;
}

export interface AdminShopWeekdayOption {
  value: number;
  label: string;
}

export interface AdminShopSalesSystemOption {
  id: string;
  name: string;
}

export interface AdminShopConceptCategoryOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-admin-shop-operation',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <div class="op">
      <section class="panel-card op__card">
        <header class="op__head">
          <h2 class="op__title">Caja</h2>
          <p class="op__lead">Moneda, cambio y comensales del cierre.</p>
        </header>
        <div class="guy-form-grid guy-form-grid--2">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Etiqueta de unidades</mat-label>
            <input matInput formControlName="unitsLabel" placeholder="ej. paninos, tickets" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Moneda</mat-label>
            <mat-select formControlName="currency">
              <mat-option value="ARS">ARS · Peso argentino</mat-option>
              <mat-option value="UYU">UYU · Peso uruguayo</mat-option>
              <mat-option value="USD">USD · Dólar</mat-option>
              <mat-option value="EUR">EUR · Euro</mat-option>
              <mat-option value="BRL">BRL · Real</mat-option>
              <mat-option value="CLP">CLP · Peso chileno</mat-option>
              <mat-option value="PYG">PYG · Guaraní</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Cambio por defecto</mat-label>
            <input
              matInput
              type="number"
              formControlName="defaultChangeAmount"
              min="0"
              step="1"
              inputmode="decimal"
            />
            <mat-hint>Al abrir un cierre</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Zona horaria</mat-label>
            <mat-select formControlName="timezone">
              @for (tz of timezoneOptions(); track tz.value) {
                <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="op__row-toggle">
          <div>
            <strong>Comensales</strong>
            <span>Pedir cantidad en cada cierre</span>
          </div>
          <mat-slide-toggle formControlName="coversEnabled" aria-label="Comensales habilitados" />
        </div>
      </section>

      <section class="panel-card op__card">
        <header class="op__head op__head--row">
          <div>
            <h2 class="op__title">Turnos de caja</h2>
            <p class="op__lead">
              Parten el día en cierres y presentismo. Abre/cierra también es la entrada/retirada
              default del personal (salvo override en Empleados).
            </p>
          </div>
          <button mat-flat-button color="primary" type="button" class="op__add" (click)="addShift.emit()">
            <mat-icon>add</mat-icon>
            Agregar
          </button>
        </header>
        <p class="op__tip">
          Un solo turno ese día = no se pide elegir. Apertura = cierre → día completo (24 h).
        </p>
        <div class="op__shifts" formArrayName="shifts">
          @for (row of shifts.controls; track row; let i = $index) {
            <article class="op__shift" [formGroupName]="i">
              <div class="op__shift-top">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__shift-name">
                  <mat-label>Nombre</mat-label>
                  <input matInput formControlName="name" placeholder="ej. Noche" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Abre</mat-label>
                  <input matInput type="time" formControlName="opensAt" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Cierra</mat-label>
                  <input matInput type="time" formControlName="closesAt" />
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  class="op__shift-del"
                  aria-label="Quitar turno"
                  [disabled]="shifts.length < 2"
                  (click)="removeShift.emit(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
              <div class="op__days" role="group" [attr.aria-label]="'Días de ' + (row.get('name')?.value || 'turno')">
                @for (d of weekdayOptions(); track d.value) {
                  <button
                    type="button"
                    class="op__day"
                    [class.op__day--on]="isShiftWeekday()(i, d.value)"
                    (click)="toggleShiftWeekday.emit({ index: i, day: d.value })"
                  >
                    {{ d.label }}
                  </button>
                }
              </div>
            </article>
          }
        </div>
      </section>

      <section class="panel-card op__card">
        <header class="op__head">
          <h2 class="op__title">Presentismo</h2>
          <p class="op__lead">
            Entrada y retirada salen del turno de caja o del override en Empleados.
          </p>
        </header>
        <div class="op__row-toggle op__row-toggle--accent">
          <div>
            <strong>Con entrada y salida</strong>
            <span>Apagado: solo presente / ausente / feriado</span>
          </div>
          <mat-slide-toggle
            formControlName="serviceAttendanceWithHours"
            aria-label="Presentismo con entrada y salida"
          />
        </div>
        <div class="guy-form-grid guy-form-grid--2 op__after-toggle">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Multiplicador feriado (liquidación)</mat-label>
            <input
              matInput
              type="number"
              min="0.01"
              step="0.01"
              inputmode="decimal"
              formControlName="holidayPayMultiplier"
            />
            <mat-hint>Default 1 (mismo precio hora). ×2 = el feriado cuenta doble. Cada empleado puede override en Sueldos.</mat-hint>
          </mat-form-field>
        </div>
      </section>

      <div class="op__pair">
        <section class="panel-card op__card">
          <header class="op__head">
            <h2 class="op__title">Producción</h2>
            <p class="op__lead">Horas al marcar en Asistencia · Producción.</p>
          </header>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__field-full">
            <mat-label>Horas por defecto</mat-label>
            <input
              matInput
              type="number"
              formControlName="productionDefaultHours"
              min="0"
              max="24"
              step="0.5"
              inputmode="decimal"
            />
            <mat-hint>Se puede editar después en la grilla</mat-hint>
          </mat-form-field>
        </section>

        <section class="panel-card op__card">
          <header class="op__head">
            <h2 class="op__title">Ventas POS</h2>
            <p class="op__lead">Cómo leer reportes de caja.</p>
          </header>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__field-full">
            <mat-label>Sistema de ventas</mat-label>
            <mat-select formControlName="salesSystemId">
              <mat-option [value]="null">Sin sistema</mat-option>
              @for (s of salesSystems(); track s.id) {
                <mat-option [value]="s.id">{{ s.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </section>
      </div>

      <section class="panel-card op__card">
        <header class="op__head">
          <h2 class="op__title">Conceptos en pagos</h2>
          <p class="op__lead">
            Categorías al cargar cada tipo de pago.
            <a routerLink="/admin/concepts">Administrar conceptos</a>
          </p>
        </header>
        <div class="guy-form-grid guy-form-grid--2" formGroupName="paymentConceptCategories">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Proveedores</mat-label>
            <mat-select formControlName="supplier" multiple>
              @for (opt of conceptCategoryOptions(); track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Servicios</mat-label>
            <mat-select formControlName="service" multiple>
              @for (opt of conceptCategoryOptions(); track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Empleados</mat-label>
            <mat-select formControlName="employee" multiple>
              @for (opt of conceptCategoryOptions(); track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Movimientos</mat-label>
            <mat-select formControlName="movement" multiple>
              @for (opt of conceptCategoryOptions(); track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
      </section>

      <section class="panel-card op__card">
        <header class="op__head">
          <h2 class="op__title">Módulos</h2>
          <p class="op__lead">Qué está activo en el local y en pantallas públicas.</p>
        </header>

        <h3 class="op__subtitle">Reservas</h3>
        <div class="op__toggles">
          <div class="op__row-toggle">
            <div>
              <strong>Reservas</strong>
              <span>Módulo interno y pantalla pública</span>
            </div>
            <mat-slide-toggle formControlName="reservationsEnabled" aria-label="Reservas" />
          </div>
          @if (reservationsOn()) {
            <div class="op__row-toggle">
              <div>
                <strong>Formulario público</strong>
                <span>Link para pedir mesa</span>
              </div>
              <mat-slide-toggle
                formControlName="reservationSignupEnabled"
                aria-label="Formulario público de reservas"
              />
            </div>
            <div class="op__row-toggle">
              <div>
                <strong>Sector adentro</strong>
                <span>Mesas en el salón</span>
              </div>
              <mat-slide-toggle formControlName="reservationInsideEnabled" aria-label="Sector adentro" />
            </div>
            <div class="op__row-toggle">
              <div>
                <strong>Sector afuera</strong>
                <span>Vereda / patio</span>
              </div>
              <mat-slide-toggle
                formControlName="reservationOutsideEnabled"
                aria-label="Sector afuera"
              />
            </div>
            <div class="guy-form-grid guy-form-grid--2 op__party">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Adentro hasta</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  max="99"
                  inputmode="numeric"
                  formControlName="reservationInsideMaxPartySize"
                  placeholder="Sin tope"
                />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Afuera hasta</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  max="99"
                  inputmode="numeric"
                  formControlName="reservationOutsideMinPartySize"
                  placeholder="Sin tope"
                />
              </mat-form-field>
            </div>
          } @else {
            <p class="op__tip">Reservas apagadas: el local no ofrece mesas por este módulo.</p>
          }
        </div>

        <h3 class="op__subtitle">Otros</h3>
        <div class="op__toggles">
          <div class="op__row-toggle">
            <div>
              <strong>Lista de espera</strong>
              <span>Cola y pantalla pública</span>
            </div>
            <mat-slide-toggle formControlName="waitingListEnabled" aria-label="Lista de espera" />
          </div>
          <div class="op__row-toggle">
            <div>
              <strong>Propinas</strong>
              <span>Caja diaria y reparto</span>
            </div>
            <mat-slide-toggle formControlName="tipsEnabled" aria-label="Propinas" />
          </div>
          <div class="op__row-toggle">
            <div>
              <strong>Presentismo público</strong>
              <span>El personal ve su mes con el link</span>
            </div>
            <mat-slide-toggle
              formControlName="publicAttendanceEnabled"
              aria-label="Presentismo público"
            />
          </div>
          <div class="op__row-toggle">
            <div>
              <strong>Normas públicas</strong>
              <span>Página para imprimir</span>
            </div>
            <mat-slide-toggle
              formControlName="publicServiceRulesEnabled"
              aria-label="Normas públicas"
            />
          </div>
          <div class="op__row-toggle">
            <div>
              <strong>Carta pública</strong>
              <span>Se carga en Administración → Carta</span>
            </div>
            <mat-slide-toggle formControlName="menuEnabled" aria-label="Carta pública" />
          </div>
        </div>
      </section>

      <section class="panel-card op__card">
        <header class="op__head">
          <h2 class="op__title">Días de franco</h2>
          <p class="op__lead">Días sin apertura. Impacta presentismo y vacaciones.</p>
        </header>
        <div class="op__days op__days--franco" role="group" aria-label="Días de franco">
          @for (d of weekdayOptions(); track d.value) {
            <button
              type="button"
              class="op__day"
              [class.op__day--on]="isClosedWeekday()(d.value)"
              (click)="toggleClosedWeekday.emit(d.value)"
            >
              {{ d.label }}
            </button>
          }
        </div>
      </section>

      @if (canManageAccounts()) {
        <aside class="op__accounts panel-card">
          <div class="op__accounts-copy">
            <mat-icon aria-hidden="true">account_balance</mat-icon>
            <div>
              <strong>Cuentas y depósitos</strong>
              <p>Canal, depósitos del cierre y el resto del dinero.</p>
            </div>
          </div>
          <a mat-stroked-button routerLink="/admin/accounts" class="op__accounts-btn">
            Ir a Cuentas
            <mat-icon>arrow_forward</mat-icon>
          </a>
        </aside>
      }
    </div>
  `,
  styleUrl: './admin-shop-operation.scss',
})
export class AdminShopOperationComponent {
  private readonly host = inject(ADMIN_SHOP_HOST);

  readonly timezoneOptions = input<readonly AdminShopTimezoneOption[]>([]);
  readonly weekdayOptions = input<readonly AdminShopWeekdayOption[]>([]);
  readonly salesSystems = input<readonly AdminShopSalesSystemOption[]>([]);
  readonly conceptCategoryOptions = input<readonly AdminShopConceptCategoryOption[]>([]);
  readonly canManageAccounts = input(false);
  readonly isShiftWeekday = input<(index: number, day: number) => boolean>(() => false);
  readonly isClosedWeekday = input<(day: number) => boolean>(() => false);

  readonly addShift = output<void>();
  readonly removeShift = output<number>();
  readonly toggleShiftWeekday = output<{ index: number; day: number }>();
  readonly toggleClosedWeekday = output<number>();

  readonly reservationsOn = computed(
    () => !!this.host.formValue()?.reservationsEnabled,
  );

  get shifts(): FormArray {
    return this.host.form.get('shifts') as FormArray;
  }
}
