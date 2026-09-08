import { Component, computed, inject, input, output, signal } from '@angular/core';
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
            <mat-option value="AL_PASO">Al paso (sin mesas)</mat-option>
            <mat-option value="RESTAURANTE">Restaurante (mesas por reserva)</mat-option>
          </mat-select>
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
              <button
                type="button"
                class="op__schedule-link"
                (click)="toggleCustom('takeaway')"
              >
                {{ takeawayCustom() ? 'Misma hora todos los días' : 'Horario distinto por día' }}
              </button>
            </div>
            <p class="op__schedule-hint">Tocá los días abiertos y la franja. Guardá abajo.</p>
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
              <div class="op__schedule-range">
                <label>
                  Abre
                  <input
                    matInput
                    type="time"
                    [value]="sharedOpen('takeaway')"
                    (change)="setSharedTime('takeaway', 'open', $event)"
                  />
                </label>
                <span>a</span>
                <label>
                  Cierra
                  <input
                    matInput
                    type="time"
                    [value]="sharedClose('takeaway')"
                    (change)="setSharedTime('takeaway', 'close', $event)"
                  />
                </label>
              </div>
            } @else {
              <div class="op__hours" formArrayName="takeawayHours">
                @for (row of takeawayHours.controls; track $index; let i = $index) {
                  <div
                    class="op__hours-row"
                    [class.op__hours-row--off]="!isDayOn('takeaway', i)"
                    [formGroupName]="i"
                  >
                    <span class="op__hours-day">{{ dayLabel(i) }}</span>
                    <mat-slide-toggle formControlName="enabled" aria-label="Abierto" />
                    <input matInput type="time" formControlName="open" />
                    <span>a</span>
                    <input matInput type="time" formControlName="close" />
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
                @if (takeawayOn()) {
                  <button type="button" class="op__schedule-link" (click)="copyTakeawayToDelivery()">
                    Copiar take away
                  </button>
                }
                <button
                  type="button"
                  class="op__schedule-link"
                  (click)="toggleCustom('delivery')"
                >
                  {{ deliveryCustom() ? 'Misma hora todos los días' : 'Horario distinto por día' }}
                </button>
              </div>
            </div>
            <p class="op__schedule-hint">Igual que take away: días + franja, o personalizá por día.</p>
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
              <div class="op__schedule-range">
                <label>
                  Abre
                  <input
                    matInput
                    type="time"
                    [value]="sharedOpen('delivery')"
                    (change)="setSharedTime('delivery', 'open', $event)"
                  />
                </label>
                <span>a</span>
                <label>
                  Cierra
                  <input
                    matInput
                    type="time"
                    [value]="sharedClose('delivery')"
                    (change)="setSharedTime('delivery', 'close', $event)"
                  />
                </label>
              </div>
            } @else {
              <div class="op__hours" formArrayName="deliveryHours">
                @for (row of deliveryHours.controls; track $index; let i = $index) {
                  <div
                    class="op__hours-row"
                    [class.op__hours-row--off]="!isDayOn('delivery', i)"
                    [formGroupName]="i"
                  >
                    <span class="op__hours-day">{{ dayLabel(i) }}</span>
                    <mat-slide-toggle formControlName="enabled" aria-label="Abierto" />
                    <input matInput type="time" formControlName="open" />
                    <span>a</span>
                    <input matInput type="time" formControlName="close" />
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

  readonly weekdayOptions = input<readonly AdminShopWeekdayOption[]>([]);
  readonly addZone = output<void>();
  readonly removeZone = output<number>();

  readonly dayIndexes = [0, 1, 2, 3, 4, 5, 6] as const;
  readonly takeawayCustom = signal(false);
  readonly deliveryCustom = signal(false);

  readonly orderingOn = computed(
    () => !!this.host.formValue()?.onlineOrderingEnabled,
  );
  readonly takeawayOn = computed(() => !!this.host.formValue()?.takeawayEnabled);
  readonly deliveryOn = computed(() => !!this.host.formValue()?.deliveryEnabled);

  orderingPublicUrl(): string {
    const slug = String(this.host.liveSlug?.() ?? this.host.formValue()?.slug ?? '').trim();
    if (!slug) return '';
    return `${window.location.origin}/pedir/${encodeURIComponent(slug)}`;
  }

  async copyOrderingPublicUrl(): Promise<void> {
    const url = this.orderingPublicUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de pedidos online copiado' : 'No se pudo copiar la URL', 'OK', {
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

  isDayOn(channel: HoursChannel, index: number): boolean {
    return !!(this.hoursOf(channel).at(index) as FormGroup | null)?.get('enabled')?.value;
  }

  toggleDay(channel: HoursChannel, index: number): void {
    const g = this.hoursOf(channel).at(index) as FormGroup | null;
    if (!g) return;
    const next = !g.get('enabled')?.value;
    g.patchValue({ enabled: next });
    if (next && !this.isCustom(channel)) {
      this.applySharedToEnabled(channel);
    }
  }

  toggleCustom(channel: HoursChannel): void {
    if (channel === 'takeaway') {
      const next = !this.takeawayCustom();
      this.takeawayCustom.set(next);
      if (!next) this.applySharedToEnabled('takeaway');
      return;
    }
    const next = !this.deliveryCustom();
    this.deliveryCustom.set(next);
    if (!next) this.applySharedToEnabled('delivery');
  }

  isCustom(channel: HoursChannel): boolean {
    return channel === 'takeaway' ? this.takeawayCustom() : this.deliveryCustom();
  }

  sharedOpen(channel: HoursChannel): string {
    return this.firstEnabledTimes(channel).open;
  }

  sharedClose(channel: HoursChannel): string {
    return this.firstEnabledTimes(channel).close;
  }

  setSharedTime(channel: HoursChannel, field: 'open' | 'close', ev: Event): void {
    const value = String((ev.target as HTMLInputElement | null)?.value ?? '').trim();
    if (!value) return;
    for (const ctrl of this.hoursOf(channel).controls) {
      (ctrl as FormGroup).patchValue({ [field]: value });
    }
  }

  applyPreset(channel: HoursChannel, preset: 'weekdays' | 'all' | 'none'): void {
    const times = this.firstEnabledTimes(channel);
    const weekdays = new Set<number>(WEEKDAYS);
    for (const ctrl of this.hoursOf(channel).controls) {
      const g = ctrl as FormGroup;
      const day = Number(g.get('day')?.value);
      const enabled =
        preset === 'all' ? true : preset === 'none' ? false : weekdays.has(day);
      g.patchValue({
        enabled,
        open: times.open,
        close: times.close,
      });
    }
  }

  copyTakeawayToDelivery(): void {
    const src = this.takeawayHours;
    const dst = this.deliveryHours;
    for (let i = 0; i < src.length; i++) {
      const s = (src.at(i) as FormGroup).getRawValue() as {
        enabled: boolean;
        open: string;
        close: string;
      };
      (dst.at(i) as FormGroup)?.patchValue({
        enabled: s.enabled,
        open: s.open,
        close: s.close,
      });
    }
    this.deliveryCustom.set(this.takeawayCustom());
    this.snack.open('Horarios de take away copiados a delivery', 'OK', { duration: 2200 });
  }

  private firstEnabledTimes(channel: HoursChannel): { open: string; close: string } {
    for (const ctrl of this.hoursOf(channel).controls) {
      const g = ctrl as FormGroup;
      if (!g.get('enabled')?.value) continue;
      return {
        open: String(g.get('open')?.value || '12:00'),
        close: String(g.get('close')?.value || '17:00'),
      };
    }
    const first = this.hoursOf(channel).at(0) as FormGroup | null;
    return {
      open: String(first?.get('open')?.value || '12:00'),
      close: String(first?.get('close')?.value || '17:00'),
    };
  }

  private applySharedToEnabled(channel: HoursChannel): void {
    const times = this.firstEnabledTimes(channel);
    for (const ctrl of this.hoursOf(channel).controls) {
      const g = ctrl as FormGroup;
      g.patchValue({ open: times.open, close: times.close }, { emitEvent: false });
    }
  }
}
