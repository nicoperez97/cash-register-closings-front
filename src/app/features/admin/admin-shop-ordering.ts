import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ControlContainer,
  FormArray,
  FormGroup,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, merge } from 'rxjs';
import { ADMIN_SHOP_HOST } from './admin-shop-host';
import { copyText } from '../../shared/utils/share-text';
import type { AdminShopWeekdayOption } from './admin-shop-operation';

type HoursChannel = 'takeaway' | 'delivery';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

@Component({
  selector: 'app-admin-shop-ordering',
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="op">
      <section class="panel-card op__card">
        <header class="op__head">
          <h2 class="op__title">Pedidos online</h2>
          <p class="op__lead">
            Take away y delivery para clientes. Las mesas siguen por reservas (otro sistema).
          </p>
        </header>

        @if (orderingOn() && orderingPublicUrl()) {
          <div class="op__public">
            <a class="op__public-btn" [href]="orderingPublicUrl()" target="_blank" rel="noopener">
              <mat-icon>open_in_new</mat-icon>
              Página pública
            </a>
            <button
              type="button"
              class="op__public-btn op__public-btn--ghost"
              (click)="copyOrderingPublicUrl()"
            >
              <mat-icon>content_copy</mat-icon>
              Copiar link
            </button>
          </div>
          <p class="op__public-url">{{ orderingPublicUrl() }}</p>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__full">
          <mat-label>Tipo de local</mat-label>
          <mat-select formControlName="shopMode">
            <mat-option value="AL_PASO">Al paso (take away / delivery)</mat-option>
            <mat-option value="RESTAURANTE">Restaurante (pedido en mesa + reservas)</mat-option>
          </mat-select>
          <mat-hint>
            Al paso: /pedir sin mesas. Restaurante: el cliente elige mesa en el mapa de /pedir.
          </mat-hint>
        </mat-form-field>

        <div class="op__toggles">
          <div class="op__row-toggle">
            <div>
              <strong>Pedidos online</strong>
              <span>Página pública /pedir/…</span>
            </div>
            <mat-slide-toggle
              formControlName="onlineOrderingEnabled"
              aria-label="Pedidos online"
            />
          </div>
          @if (isRestaurant()) {
            <div class="op__row-toggle">
              <div>
                <strong>Comanda mozos</strong>
                <span>Página pública /mozo/… con PIN (además del pedido en mesa del cliente)</span>
              </div>
              <mat-slide-toggle
                formControlName="waiterOrderingEnabled"
                aria-label="Comanda mozos"
              />
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
          }
          <div class="op__row-toggle">
            <div>
              <strong>Take away</strong>
              <span>Retiro en el local</span>
            </div>
            <mat-slide-toggle formControlName="takeawayEnabled" aria-label="Take away" />
          </div>
          <div class="op__row-toggle">
            <div>
              <strong>Delivery</strong>
              <span>Envío a domicilio</span>
            </div>
            <mat-slide-toggle formControlName="deliveryEnabled" aria-label="Delivery" />
          </div>
        </div>

        <div class="guy-form-grid guy-form-grid--2" style="margin-top: 1rem">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>ETA take away</mat-label>
            <input matInput formControlName="orderingEtaTakeaway" placeholder="ej. 40 min" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>ETA delivery</mat-label>
            <input
              matInput
              formControlName="orderingEtaDelivery"
              placeholder="ej. 40 a 70 min"
            />
          </mat-form-field>
        </div>

        <h3 class="op__subtitle">Medios de pago</h3>
        <div class="op__toggles">
          <div class="op__row-toggle">
            <div><strong>Efectivo</strong></div>
            <mat-slide-toggle formControlName="payCash" aria-label="Efectivo" />
          </div>
          <div class="op__row-toggle">
            <div><strong>Transferencia</strong></div>
            <mat-slide-toggle formControlName="payTransfer" aria-label="Transferencia" />
          </div>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__full">
          <mat-label>Datos de transferencia (CBU / alias)</mat-label>
          <textarea matInput rows="2" formControlName="transferInstructions"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="op__full">
          <mat-label>WhatsApp para comprobantes</mat-label>
          <input
            matInput
            formControlName="orderingWhatsapp"
            placeholder="ej. 54911 2345 6789"
            autocomplete="tel"
          />
          <mat-hint>Si está vacío, se usa el teléfono del local</mat-hint>
        </mat-form-field>

        @if (takeawayOn()) {
          <div class="op__schedule">
            <div class="op__schedule-head">
              <h3 class="op__subtitle">Horarios take away</h3>
              <div class="op__schedule-head-actions">
                <button type="button" class="op__schedule-link" (click)="useShopShifts('takeaway')">
                  Usar turnos del local
                </button>
                <button type="button" class="op__schedule-link" (click)="toggleCustom('takeaway')">
                  {{ takeawayCustom() ? 'Misma hora todos los días' : 'Horario distinto por día' }}
                </button>
              </div>
            </div>
            <p class="op__schedule-hint">
              Se cargan los turnos de caja. Podés sumar más de un turno por día. Guardá abajo.
            </p>
            <div class="op__days" role="group" aria-label="Días take away">
              @for (d of dayIndexes; track d) {
                <button
                  type="button"
                  class="op__day"
                  [class.op__day--on]="isDayOn('takeaway', d)"
                  (click)="toggleDay('takeaway', d)"
                >
                  {{ dayLabel(d) }}
                </button>
              }
            </div>
            <div class="op__schedule-actions">
              <button type="button" mat-stroked-button (click)="applyPreset('takeaway', 'weekdays')">
                Lun–Vie
              </button>
              <button type="button" mat-stroked-button (click)="applyPreset('takeaway', 'all')">
                Todos
              </button>
              <button type="button" mat-stroked-button (click)="applyPreset('takeaway', 'none')">
                Ninguno
              </button>
            </div>
            @if (!takeawayCustom()) {
              <div class="op__windows">
                @for (w of sharedWindowIndexes('takeaway'); track w; let wi = $index) {
                  <div class="op__schedule-range">
                    <label>
                      Abre
                      <input
                        matInput
                        type="time"
                        [value]="sharedWindowValue('takeaway', wi, 'open')"
                        (change)="setSharedWindow('takeaway', wi, 'open', $event)"
                      />
                    </label>
                    <span>a</span>
                    <label>
                      Cierra
                      <input
                        matInput
                        type="time"
                        [value]="sharedWindowValue('takeaway', wi, 'close')"
                        (change)="setSharedWindow('takeaway', wi, 'close', $event)"
                      />
                    </label>
                    @if (sharedWindowIndexes('takeaway').length > 1) {
                      <button
                        type="button"
                        mat-icon-button
                        (click)="removeSharedWindow('takeaway', wi)"
                        aria-label="Quitar turno"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  </div>
                }
                <button type="button" mat-stroked-button (click)="addSharedWindow('takeaway')">
                  <mat-icon>add</mat-icon>
                  Otro turno
                </button>
              </div>
            } @else {
              <div class="op__hours" formArrayName="takeawayHours">
                @for (row of takeawayHours.controls; track $index; let i = $index) {
                  <div
                    class="op__hours-dayblock"
                    [class.op__hours-row--off]="!isDayOn('takeaway', i)"
                    [formGroupName]="i"
                  >
                    <div class="op__hours-row">
                      <span class="op__hours-day">{{ dayLabel(i) }}</span>
                      <mat-slide-toggle formControlName="enabled" aria-label="Abierto" />
                    </div>
                    <div class="op__windows" formArrayName="windows">
                      @for (w of windowsOf('takeaway', i).controls; track $index; let wi = $index) {
                        <div class="op__schedule-range" [formGroupName]="wi">
                          <input matInput type="time" formControlName="open" />
                          <span>a</span>
                          <input matInput type="time" formControlName="close" />
                          @if (windowsOf('takeaway', i).length > 1) {
                            <button
                              type="button"
                              mat-icon-button
                              (click)="removeDayWindow('takeaway', i, wi)"
                              aria-label="Quitar turno"
                            >
                              <mat-icon>delete</mat-icon>
                            </button>
                          }
                        </div>
                      }
                      <button
                        type="button"
                        class="op__schedule-link"
                        (click)="addDayWindow('takeaway', i)"
                      >
                        + Turno
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }

        @if (deliveryOn()) {
          <div class="op__schedule">
            <div class="op__schedule-head">
              <h3 class="op__subtitle">Horarios delivery</h3>
              <div class="op__schedule-head-actions">
                <button type="button" class="op__schedule-link" (click)="useShopShifts('delivery')">
                  Usar turnos del local
                </button>
                @if (takeawayOn()) {
                  <button type="button" class="op__schedule-link" (click)="copyTakeawayToDelivery()">
                    Copiar take away
                  </button>
                }
                <button type="button" class="op__schedule-link" (click)="toggleCustom('delivery')">
                  {{ deliveryCustom() ? 'Misma hora todos los días' : 'Horario distinto por día' }}
                </button>
              </div>
            </div>
            <p class="op__schedule-hint">Igual que take away: varios turnos por día si hace falta.</p>
            <div class="op__days" role="group" aria-label="Días delivery">
              @for (d of dayIndexes; track d) {
                <button
                  type="button"
                  class="op__day"
                  [class.op__day--on]="isDayOn('delivery', d)"
                  (click)="toggleDay('delivery', d)"
                >
                  {{ dayLabel(d) }}
                </button>
              }
            </div>
            <div class="op__schedule-actions">
              <button type="button" mat-stroked-button (click)="applyPreset('delivery', 'weekdays')">
                Lun–Vie
              </button>
              <button type="button" mat-stroked-button (click)="applyPreset('delivery', 'all')">
                Todos
              </button>
              <button type="button" mat-stroked-button (click)="applyPreset('delivery', 'none')">
                Ninguno
              </button>
            </div>
            @if (!deliveryCustom()) {
              <div class="op__windows">
                @for (w of sharedWindowIndexes('delivery'); track w; let wi = $index) {
                  <div class="op__schedule-range">
                    <label>
                      Abre
                      <input
                        matInput
                        type="time"
                        [value]="sharedWindowValue('delivery', wi, 'open')"
                        (change)="setSharedWindow('delivery', wi, 'open', $event)"
                      />
                    </label>
                    <span>a</span>
                    <label>
                      Cierra
                      <input
                        matInput
                        type="time"
                        [value]="sharedWindowValue('delivery', wi, 'close')"
                        (change)="setSharedWindow('delivery', wi, 'close', $event)"
                      />
                    </label>
                    @if (sharedWindowIndexes('delivery').length > 1) {
                      <button
                        type="button"
                        mat-icon-button
                        (click)="removeSharedWindow('delivery', wi)"
                        aria-label="Quitar turno"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  </div>
                }
                <button type="button" mat-stroked-button (click)="addSharedWindow('delivery')">
                  <mat-icon>add</mat-icon>
                  Otro turno
                </button>
              </div>
            } @else {
              <div class="op__hours" formArrayName="deliveryHours">
                @for (row of deliveryHours.controls; track $index; let i = $index) {
                  <div
                    class="op__hours-dayblock"
                    [class.op__hours-row--off]="!isDayOn('delivery', i)"
                    [formGroupName]="i"
                  >
                    <div class="op__hours-row">
                      <span class="op__hours-day">{{ dayLabel(i) }}</span>
                      <mat-slide-toggle formControlName="enabled" aria-label="Abierto" />
                    </div>
                    <div class="op__windows" formArrayName="windows">
                      @for (w of windowsOf('delivery', i).controls; track $index; let wi = $index) {
                        <div class="op__schedule-range" [formGroupName]="wi">
                          <input matInput type="time" formControlName="open" />
                          <span>a</span>
                          <input matInput type="time" formControlName="close" />
                          @if (windowsOf('delivery', i).length > 1) {
                            <button
                              type="button"
                              mat-icon-button
                              (click)="removeDayWindow('delivery', i, wi)"
                              aria-label="Quitar turno"
                            >
                              <mat-icon>delete</mat-icon>
                            </button>
                          }
                        </div>
                      }
                      <button
                        type="button"
                        class="op__schedule-link"
                        (click)="addDayWindow('delivery', i)"
                      >
                        + Turno
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <h3 class="op__subtitle">Zonas de delivery</h3>
          <p class="op__schedule-hint">Nombre y costo de envío. Si no hay zonas, el cliente no puede pedir delivery.</p>
          <div class="op__zones" formArrayName="deliveryZones">
            @for (z of deliveryZones.controls; track $index; let i = $index) {
              <div class="op__zone" [formGroupName]="i">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Zona</mat-label>
                  <input matInput formControlName="name" placeholder="ej. Centro" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Costo</mat-label>
                  <input matInput type="number" min="0" formControlName="fee" />
                </mat-form-field>
                <button mat-icon-button type="button" (click)="removeZone.emit(i)" aria-label="Quitar">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            } @empty {
              <p class="op__empty">Todavía no hay zonas.</p>
            }
          </div>
          <button mat-stroked-button type="button" (click)="addZone.emit()">
            <mat-icon>add</mat-icon>
            Agregar zona
          </button>
        }
      </section>
    </div>
  `,
  styleUrl: './admin-shop-operation.scss',
})
export class AdminShopOrderingComponent {
  private readonly host = inject(ADMIN_SHOP_HOST);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly weekdayOptions = input<readonly AdminShopWeekdayOption[]>([]);
  readonly addZone = output<void>();
  readonly removeZone = output<number>();

  readonly dayIndexes = [0, 1, 2, 3, 4, 5, 6] as const;
  readonly takeawayCustom = signal(false);
  readonly deliveryCustom = signal(false);

  readonly orderingOn = computed(
    () => !!this.host.formValue()?.onlineOrderingEnabled,
  );
  readonly isRestaurant = computed(
    () => this.host.formValue()?.shopMode !== 'AL_PASO',
  );
  readonly waiterOn = computed(
    () => !!this.host.formValue()?.waiterOrderingEnabled,
  );
  readonly takeawayOn = computed(() => !!this.host.formValue()?.takeawayEnabled);
  readonly deliveryOn = computed(() => !!this.host.formValue()?.deliveryEnabled);

  constructor() {
    // Tras cargar el local (o GET), si hay horarios distintos por día activar modo custom.
    merge(this.takeawayHours.valueChanges, this.deliveryHours.valueChanges)
      .pipe(debounceTime(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncCustomModesFromForm());
    queueMicrotask(() => this.syncCustomModesFromForm());
  }

  orderingPublicUrl(): string {
    const slug = String(this.host.liveSlug?.() ?? this.host.formValue()?.slug ?? '').trim();
    if (!slug) return '';
    return `${window.location.origin}/pedir/${encodeURIComponent(slug)}`;
  }

  waiterPublicUrl(): string {
    const slug = String(this.host.liveSlug?.() ?? this.host.formValue()?.slug ?? '').trim();
    if (!slug) return '';
    return `${window.location.origin}/mozo/${encodeURIComponent(slug)}`;
  }

  async copyOrderingPublicUrl(): Promise<void> {
    const url = this.orderingPublicUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de pedidos online copiado' : 'No se pudo copiar la URL', 'OK', {
      duration: 2500,
    });
  }

  async copyWaiterPublicUrl(): Promise<void> {
    const url = this.waiterPublicUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de comanda mozos copiado' : 'No se pudo copiar la URL', 'OK', {
      duration: 2500,
    });
  }

  get takeawayHours(): FormArray {
    return this.host.form.get('takeawayHours') as FormArray;
  }

  get deliveryHours(): FormArray {
    return this.host.form.get('deliveryHours') as FormArray;
  }

  get deliveryZones(): FormArray {
    return this.host.form.get('deliveryZones') as FormArray;
  }

  dayLabel(index: number): string {
    const day = Number((this.hoursOf('takeaway').at(index) as FormGroup | null)?.get('day')?.value);
    if (Number.isFinite(day) && day >= 0 && day <= 6) return DAY_LABELS[day];
    return this.weekdayOptions().find((d) => d.value === index)?.label ?? DAY_LABELS[index] ?? `Día ${index}`;
  }

  hoursOf(channel: HoursChannel): FormArray {
    return channel === 'takeaway' ? this.takeawayHours : this.deliveryHours;
  }

  windowsOf(channel: HoursChannel, dayIndex: number): FormArray {
    return (this.hoursOf(channel).at(dayIndex) as FormGroup).get('windows') as FormArray;
  }

  isDayOn(channel: HoursChannel, index: number): boolean {
    return !!(this.hoursOf(channel).at(index) as FormGroup | null)?.get('enabled')?.value;
  }

  toggleDay(channel: HoursChannel, index: number): void {
    const g = this.hoursOf(channel).at(index) as FormGroup | null;
    if (!g) return;
    const next = !g.get('enabled')?.value;
    g.patchValue({ enabled: next });
    if (next && !this.isCustom(channel)) {
      this.applySharedWindowsToAll(channel);
    }
  }

  toggleCustom(channel: HoursChannel): void {
    if (channel === 'takeaway') {
      const next = !this.takeawayCustom();
      this.takeawayCustom.set(next);
      if (!next) this.applySharedWindowsToAll('takeaway');
      return;
    }
    const next = !this.deliveryCustom();
    this.deliveryCustom.set(next);
    if (!next) this.applySharedWindowsToAll('delivery');
  }

  isCustom(channel: HoursChannel): boolean {
    return channel === 'takeaway' ? this.takeawayCustom() : this.deliveryCustom();
  }

  useShopShifts(channel: HoursChannel): void {
    this.host.applyOrderingHoursFromShifts(channel);
    if (this.hasVariedWindows(channel)) {
      if (channel === 'takeaway') this.takeawayCustom.set(true);
      else this.deliveryCustom.set(true);
    }
    this.snack.open('Horarios tomados de los turnos del local', 'OK', { duration: 2200 });
  }

  sharedWindowIndexes(channel: HoursChannel): number[] {
    const n = Math.max(1, this.windowsOf(channel, this.firstDayIndex(channel)).length);
    return Array.from({ length: n }, (_, i) => i);
  }

  sharedWindowValue(channel: HoursChannel, wi: number, field: 'open' | 'close'): string {
    const w = this.windowsOf(channel, this.firstDayIndex(channel)).at(wi) as FormGroup | null;
    return String(w?.get(field)?.value || (field === 'open' ? '12:00' : '17:00'));
  }

  setSharedWindow(channel: HoursChannel, wi: number, field: 'open' | 'close', ev: Event): void {
    const raw = String((ev.target as HTMLInputElement | null)?.value ?? '').trim();
    const value = this.host.normalizeHhMm(raw) ?? raw;
    if (!value) return;
    for (const ctrl of this.hoursOf(channel).controls) {
      const windows = (ctrl as FormGroup).get('windows') as FormArray;
      while (windows.length <= wi) {
        windows.push(this.host.buildHourWindow());
      }
      (windows.at(wi) as FormGroup).patchValue({ [field]: value });
    }
  }

  addSharedWindow(channel: HoursChannel): void {
    const times = this.firstWindowTimes(channel);
    for (const ctrl of this.hoursOf(channel).controls) {
      const windows = (ctrl as FormGroup).get('windows') as FormArray;
      windows.push(this.host.buildHourWindow(times.open, times.close));
    }
  }

  removeSharedWindow(channel: HoursChannel, wi: number): void {
    for (const ctrl of this.hoursOf(channel).controls) {
      const windows = (ctrl as FormGroup).get('windows') as FormArray;
      if (windows.length > 1 && wi < windows.length) windows.removeAt(wi);
    }
  }

  addDayWindow(channel: HoursChannel, dayIndex: number): void {
    const windows = this.windowsOf(channel, dayIndex);
    const last = windows.at(windows.length - 1) as FormGroup | null;
    windows.push(
      this.host.buildHourWindow(
        String(last?.get('open')?.value || '12:00'),
        String(last?.get('close')?.value || '17:00'),
      ),
    );
  }

  removeDayWindow(channel: HoursChannel, dayIndex: number, wi: number): void {
    const windows = this.windowsOf(channel, dayIndex);
    if (windows.length > 1) windows.removeAt(wi);
  }

  applyPreset(channel: HoursChannel, preset: 'weekdays' | 'all' | 'none'): void {
    const template = this.cloneWindows(this.windowsOf(channel, this.firstDayIndex(channel)));
    const weekdays = new Set<number>(WEEKDAYS);
    for (const ctrl of this.hoursOf(channel).controls) {
      const g = ctrl as FormGroup;
      const day = Number(g.get('day')?.value);
      const enabled =
        preset === 'all' ? true : preset === 'none' ? false : weekdays.has(day);
      g.patchValue({ enabled });
      const windows = g.get('windows') as FormArray;
      windows.clear();
      for (const w of template) windows.push(this.host.buildHourWindow(w.open, w.close));
    }
  }

  copyTakeawayToDelivery(): void {
    const src = this.takeawayHours;
    const dst = this.deliveryHours;
    for (let i = 0; i < src.length; i++) {
      const sg = src.at(i) as FormGroup;
      const dg = dst.at(i) as FormGroup;
      if (!sg || !dg) continue;
      dg.patchValue({ enabled: !!sg.get('enabled')?.value });
      const sw = sg.get('windows') as FormArray;
      const dw = dg.get('windows') as FormArray;
      dw.clear();
      for (const c of sw.controls) {
        const v = (c as FormGroup).getRawValue() as { open: string; close: string };
        dw.push(this.host.buildHourWindow(v.open, v.close));
      }
      if (!dw.length) dw.push(this.host.buildHourWindow());
    }
    this.deliveryCustom.set(this.takeawayCustom());
    this.snack.open('Horarios de take away copiados a delivery', 'OK', { duration: 2200 });
  }

  private firstDayIndex(channel: HoursChannel): number {
    const arr = this.hoursOf(channel);
    for (let i = 0; i < arr.length; i++) {
      if ((arr.at(i) as FormGroup).get('enabled')?.value) return i;
    }
    return 0;
  }

  private firstWindowTimes(channel: HoursChannel): { open: string; close: string } {
    const w = this.windowsOf(channel, this.firstDayIndex(channel)).at(0) as FormGroup | null;
    return {
      open: String(w?.get('open')?.value || '12:00'),
      close: String(w?.get('close')?.value || '17:00'),
    };
  }

  private cloneWindows(arr: FormArray): Array<{ open: string; close: string }> {
    const out = arr.controls.map((c) => {
      const v = (c as FormGroup).getRawValue() as { open: string; close: string };
      return { open: String(v.open || '12:00'), close: String(v.close || '17:00') };
    });
    return out.length ? out : [{ open: '12:00', close: '17:00' }];
  }

  private applySharedWindowsToAll(channel: HoursChannel): void {
    const template = this.cloneWindows(this.windowsOf(channel, this.firstDayIndex(channel)));
    for (const ctrl of this.hoursOf(channel).controls) {
      const windows = (ctrl as FormGroup).get('windows') as FormArray;
      windows.clear();
      for (const w of template) windows.push(this.host.buildHourWindow(w.open, w.close));
    }
  }

  private syncCustomModesFromForm(): void {
    if (this.hasVariedWindows('takeaway')) this.takeawayCustom.set(true);
    if (this.hasVariedWindows('delivery')) this.deliveryCustom.set(true);
  }

  private hasVariedWindows(channel: HoursChannel): boolean {
    const arr = this.hoursOf(channel);
    let ref: string | null = null;
    for (const ctrl of arr.controls) {
      const g = ctrl as FormGroup;
      if (!g.get('enabled')?.value) continue;
      const key = JSON.stringify(this.cloneWindows(g.get('windows') as FormArray));
      if (ref == null) ref = key;
      else if (ref !== key) return true;
    }
    return false;
  }
}
