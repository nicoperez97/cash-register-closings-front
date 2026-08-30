import { Component, inject, input, output } from '@angular/core';
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
    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Caja</h2>
      <p class="text-muted small mb-3">
        Moneda, cambio sugerido y turnos de caja. Los turnos parten el día en cierres y presentismo
        (elegís en qué turno cargás). No definen la entrada/salida del personal.
      </p>
      <div class="guy-form-grid guy-form-grid--2">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Etiqueta de unidades</mat-label>
          <input matInput formControlName="unitsLabel" placeholder="ej. paninos, tickets" />
          <mat-hint>Cómo se llaman las unidades vendidas</mat-hint>
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
          <mat-hint>Moneda de operación del local</mat-hint>
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
          <mat-hint>Monto sugerido al abrir un cierre</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Zona horaria</mat-label>
          <mat-select formControlName="timezone">
            @for (tz of timezoneOptions(); track tz.value) {
              <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
            }
          </mat-select>
          <mat-hint>Día calendario de reservas y pantallas públicas</mat-hint>
        </mat-form-field>
      </div>

      <div class="shop-admin__posnets-head" style="margin-top: 0.75rem">
        <p class="text-muted small mb-0">
          Turnos de caja: nombre, días, apertura y cierre. Si ese día hay un solo turno, no se pide
          elegir en el cierre ni en el presentismo. Apertura = cierre significa día completo (24 h).
        </p>
        <button mat-stroked-button type="button" (click)="addShift.emit()">
          <mat-icon>add</mat-icon>
          Agregar turno
        </button>
      </div>
      <div class="shop-admin__shifts" formArrayName="shifts">
        @for (row of shifts.controls; track row; let i = $index) {
          <div class="shop-admin__shift-row" [formGroupName]="i">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="name" placeholder="ej. Mediodía" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Apertura de turno</mat-label>
              <input matInput type="time" formControlName="opensAt" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cierre de turno</mat-label>
              <input matInput type="time" formControlName="closesAt" />
            </mat-form-field>
            <button
              mat-icon-button
              type="button"
              class="shop-admin__posnet-remove"
              aria-label="Quitar turno"
              [disabled]="shifts.length < 2"
              (click)="removeShift.emit(i)"
            >
              <mat-icon>delete</mat-icon>
            </button>
            <div class="shop-admin__shift-days" role="group" aria-label="Días del turno">
              @for (d of weekdayOptions(); track d.value) {
                <button
                  type="button"
                  class="shop-admin__weekday"
                  [class.shop-admin__weekday--on]="isShiftWeekday()(i, d.value)"
                  (click)="toggleShiftWeekday.emit({ index: i, day: d.value })"
                >
                  {{ d.label }}
                </button>
              }
            </div>
          </div>
        }
      </div>
      <div class="shop-admin__toggle-list" style="margin-top: 0.85rem">
        <div class="shop-admin__toggle">
          <div>
            <strong>Comensales</strong>
            <p class="text-muted small mb-0">Pedir cantidad de comensales en cada cierre.</p>
          </div>
          <mat-slide-toggle formControlName="coversEnabled" aria-label="Comensales habilitados" />
        </div>
      </div>
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Presentismo de servicio</h2>
      <p class="text-muted small mb-3">
        Entrada y retirada default del personal. Son independientes de los turnos de caja. Cada
        empleado puede tener las suyas en Empleados.
      </p>
      <mat-slide-toggle formControlName="serviceAttendanceWithHours">
        Presentismo con entrada y salida
      </mat-slide-toggle>
      <p class="shop-admin__op-note" style="margin-top: 0.75rem">
        Apagado: solo presente / ausente / feriado. Encendido: se cargan entrada y salida, y se
        calculan extras (salida real menos retirada).
      </p>
      @if (serviceWithHours()) {
        <div class="guy-form-grid guy-form-grid--2" style="margin-top: 0.85rem">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Entrada default del personal</mat-label>
            <input matInput type="time" formControlName="serviceDefaultCheckIn" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Retirada default del personal</mat-label>
            <input matInput type="time" formControlName="serviceDefaultCheckOut" />
            <mat-hint>Si el empleado no tiene horario propio. Extra = salida real − retirada.</mat-hint>
          </mat-form-field>
        </div>
      }
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Producción</h2>
      <p class="text-muted small mb-3">
        Horas sugeridas al marcar presente en Asistencia · Producción (no es entrada/salida).
      </p>
      <div class="guy-form-grid guy-form-grid--2">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
          <mat-hint>Al marcar presente en la grilla de producción</mat-hint>
        </mat-form-field>
        <p class="shop-admin__op-note">
          Se aplica al tocar un día. Después se puede editar manteniendo el dedo / clic derecho.
        </p>
      </div>
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Ventas POS</h2>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Sistema de ventas</mat-label>
        <mat-select formControlName="salesSystemId">
          <mat-option [value]="null">Sin sistema</mat-option>
          @for (s of salesSystems(); track s.id) {
            <mat-option [value]="s.id">{{ s.name }}</mat-option>
          }
        </mat-select>
        <mat-hint>Cómo interpretar reportes (Restosoft, WeMenu, etc.)</mat-hint>
      </mat-form-field>
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Conceptos en pagos</h2>
      <p class="text-muted small mb-3">
        Qué categorías se listan al cargar cada tipo de pago. Los conceptos en sí se gestionan en
        <a routerLink="/admin/concepts">Administración → Conceptos</a>.
      </p>
      <div class="guy-form-grid guy-form-grid--2" formGroupName="paymentConceptCategories">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Pagos a proveedores</mat-label>
          <mat-select formControlName="supplier" multiple>
            @for (opt of conceptCategoryOptions(); track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Pagos a servicios</mat-label>
          <mat-select formControlName="service" multiple>
            @for (opt of conceptCategoryOptions(); track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
          <mat-hint>Ej. Servicios y Proveedores</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Pagos a empleados</mat-label>
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

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Módulos públicos</h2>
      <p class="text-muted small mb-3">Reservas, lista de espera, presentismo y carta pública.</p>
      <div class="shop-admin__toggle-list">
        <div class="shop-admin__toggle">
          <div>
            <strong>Reservas</strong>
            <p class="text-muted small mb-0">Módulo interno y pantalla pública del local.</p>
          </div>
          <mat-slide-toggle formControlName="reservationsEnabled" aria-label="Reservas habilitadas" />
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Formulario público de reservas</strong>
            <p class="text-muted small mb-0">
              Link para que la gente pida mesa. Se puede apagar desde Reservas.
            </p>
          </div>
          <mat-slide-toggle
            formControlName="reservationSignupEnabled"
            aria-label="Formulario público de reservas"
          />
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Sector adentro</strong>
            <p class="text-muted small mb-0">Pedidos de mesa en el salón.</p>
          </div>
          <mat-slide-toggle formControlName="reservationInsideEnabled" aria-label="Sector adentro" />
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Sector afuera</strong>
            <p class="text-muted small mb-0">Pedidos de mesa en la vereda / patio.</p>
          </div>
          <mat-slide-toggle
            formControlName="reservationOutsideEnabled"
            aria-label="Sector afuera"
          />
        </div>
        <div class="shop-admin__party-rules">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Adentro hasta</mat-label>
            <input
              matInput
              type="number"
              min="1"
              max="99"
              inputmode="numeric"
              formControlName="reservationInsideMaxPartySize"
              placeholder="Ilimitado"
            />
            <mat-hint>Vacío = sin tope de personas adentro</mat-hint>
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
              placeholder="Ilimitado"
            />
            <mat-hint>Vacío = sin tope de personas afuera</mat-hint>
          </mat-form-field>
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Lista de espera</strong>
            <p class="text-muted small mb-0">Cola de espera y su pantalla pública.</p>
          </div>
          <mat-slide-toggle
            formControlName="waitingListEnabled"
            aria-label="Lista de espera habilitada"
          />
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Propinas</strong>
            <p class="text-muted small mb-0">Caja diaria de propinas y reparto por empleado.</p>
          </div>
          <mat-slide-toggle formControlName="tipsEnabled" aria-label="Propinas habilitadas" />
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Presentismo público</strong>
            <p class="text-muted small mb-0">
              El personal entra con el link y ve su mes, sin usuario de la app.
            </p>
          </div>
          <mat-slide-toggle
            formControlName="publicAttendanceEnabled"
            aria-label="Presentismo público"
          />
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Normas públicas</strong>
            <p class="text-muted small mb-0">
              Página para imprimir y pegar las normas pre y post servicio.
            </p>
          </div>
          <mat-slide-toggle
            formControlName="publicServiceRulesEnabled"
            aria-label="Normas de servicio públicas"
          />
        </div>
        <div class="shop-admin__toggle">
          <div>
            <strong>Carta pública</strong>
            <p class="text-muted small mb-0">
              Página con las cartas del local. Se cargan en Administración → Carta.
            </p>
          </div>
          <mat-slide-toggle formControlName="menuEnabled" aria-label="Carta pública" />
        </div>
      </div>
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Días de franco</h2>
      <p class="text-muted small mb-3">
        Días en que el local no abre. Se reflejan en presentismo y vacaciones.
      </p>
      <div class="shop-admin__weekdays">
        <div class="shop-admin__weekday-chips">
          @for (d of weekdayOptions(); track d.value) {
            <button
              type="button"
              class="shop-admin__weekday"
              [class.shop-admin__weekday--on]="isClosedWeekday()(d.value)"
              (click)="toggleClosedWeekday.emit(d.value)"
            >
              {{ d.label }}
            </button>
          }
        </div>
      </div>
    </section>

    @if (canManageAccounts()) {
      <section class="panel-card guy-form-section shop-admin__link-card">
        <h2 class="guy-section-title">Cuentas y depósitos</h2>
        <p class="text-muted small mb-3">
          Cuentas canal, depósitos del cierre y el resto del dinero del local se gestionan en
          Administración → Cuentas.
        </p>
        <a mat-stroked-button routerLink="/admin/accounts">
          <mat-icon>account_balance</mat-icon>
          Ir a Cuentas
        </a>
      </section>
    }
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopOperationComponent {
  private readonly parentForm = inject(FormGroupDirective);

  readonly timezoneOptions = input<readonly AdminShopTimezoneOption[]>([]);
  readonly weekdayOptions = input<readonly AdminShopWeekdayOption[]>([]);
  readonly salesSystems = input<readonly AdminShopSalesSystemOption[]>([]);
  readonly conceptCategoryOptions = input<readonly AdminShopConceptCategoryOption[]>([]);
  readonly serviceWithHours = input(true);
  readonly canManageAccounts = input(false);
  readonly isShiftWeekday = input<(index: number, day: number) => boolean>(() => false);
  readonly isClosedWeekday = input<(day: number) => boolean>(() => false);

  readonly addShift = output<void>();
  readonly removeShift = output<number>();
  readonly toggleShiftWeekday = output<{ index: number; day: number }>();
  readonly toggleClosedWeekday = output<number>();

  get shifts(): FormArray {
    return this.parentForm.form.get('shifts') as FormArray;
  }
}
