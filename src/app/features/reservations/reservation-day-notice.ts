import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ReservationsApiService, ReservationDaySettings } from './reservations-api.service';

export type DayFormMode = 'normal' | 'closed' | 'no-inside' | 'no-outside';

@Component({
  selector: 'app-reservation-day-notice',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="floor-notice">
      <div class="floor-notice__head">
        <mat-icon>campaign</mat-icon>
        <div>
          <strong>Aviso del día</strong>
          <span class="text-muted small">Se muestra en la pantalla pública</span>
        </div>
      </div>
      @if (canManage()) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="floor-notice__field">
          <mat-label>Mensaje para la web pública</mat-label>
          <textarea
            matInput
            rows="2"
            [ngModel]="noticeDraft()"
            (ngModelChange)="noticeDraft.set($event)"
            maxlength="2000"
            placeholder="Ej: Hoy solo menú del día · Terraza cerrada por lluvia"
          ></textarea>
        </mat-form-field>
        <div class="floor-notice__actions">
          <button
            mat-stroked-button
            type="button"
            [disabled]="savingNotice() || !noticeDirty()"
            (click)="saveNotice()"
          >
            <mat-icon>save</mat-icon>
            {{ noticeDraft().trim() ? 'Guardar aviso' : 'Quitar aviso' }}
          </button>
          @if (savedNotice()) {
            <button mat-button type="button" [disabled]="savingNotice()" (click)="clearNotice()">
              Limpiar
            </button>
          }
        </div>
        <div class="floor-day-settings">
          <div class="floor-day-settings__row">
            <span class="floor-day-settings__label">Formulario web</span>
            <mat-button-toggle-group
              class="floor-form-mode-toggle"
              hideSingleSelectionIndicator
              [value]="dayFormMode()"
              [disabled]="savingDaySettings()"
              (change)="onDayFormMode($event.value)"
              aria-label="Configuración del formulario web para este día"
            >
              <mat-button-toggle value="normal">Normal</mat-button-toggle>
              <mat-button-toggle value="closed">Cerrar</mat-button-toggle>
              <mat-button-toggle value="no-inside">Sin adentro</mat-button-toggle>
              <mat-button-toggle value="no-outside">Sin afuera</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <div class="floor-day-settings__capacity">
            <span class="floor-day-settings__label">Cupo restante (personas)</span>
            <p class="floor-day-settings__hint text-muted small">
              Vacío = sin límite (queda pendiente de aceptar). Con cupo, las reservas web que
              entren se confirman solas y se descuenta el número; al llegar a 0 el sector se cierra.
            </p>
            <div class="floor-day-settings__capacity-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cupo adentro</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  max="999"
                  inputmode="numeric"
                  [ngModel]="insideCapacityDraft()"
                  (ngModelChange)="insideCapacityDraft.set($event)"
                  placeholder="Sin límite"
                />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cupo afuera</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  max="999"
                  inputmode="numeric"
                  [ngModel]="outsideCapacityDraft()"
                  (ngModelChange)="outsideCapacityDraft.set($event)"
                  placeholder="Sin límite"
                />
              </mat-form-field>
              <button
                mat-stroked-button
                type="button"
                [disabled]="savingDaySettings() || !capacityDirty()"
                (click)="saveCapacity()"
              >
                <mat-icon>event_seat</mat-icon>
                Guardar cupos
              </button>
            </div>
          </div>
        </div>
      } @else if (savedNotice()) {
        <p class="floor-notice__preview">{{ savedNotice() }}</p>
      } @else {
        <p class="floor-notice__empty text-muted small">Sin aviso para este día</p>
      }
    </div>
  `,
  styleUrl: './reservation-day-notice.scss',
})
export class ReservationDayNoticeComponent {
  private readonly api = inject(ReservationsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);

  readonly businessDate = input.required<string>();
  readonly canManage = input(false);
  readonly notice = input<string | null>(null);
  readonly daySettings = input<ReservationDaySettings | null>(null);

  readonly noticeUpdated = output<string | null>();
  readonly daySettingsUpdated = output<ReservationDaySettings | null>();

  readonly noticeDraft = signal('');
  readonly savedNotice = signal<string | null>(null);
  readonly savingNotice = signal(false);

  readonly daySignupOverride = signal<boolean | null>(null);
  readonly dayInsideOverride = signal<boolean | null>(null);
  readonly dayOutsideOverride = signal<boolean | null>(null);
  readonly insideCapacityDraft = signal<number | null>(null);
  readonly outsideCapacityDraft = signal<number | null>(null);
  readonly savedInsideCapacity = signal<number | null>(null);
  readonly savedOutsideCapacity = signal<number | null>(null);
  readonly savingDaySettings = signal(false);

  readonly dayFormMode = computed((): DayFormMode => {
    if (this.daySignupOverride() === false) return 'closed';
    if (this.dayInsideOverride() === false) return 'no-inside';
    if (this.dayOutsideOverride() === false) return 'no-outside';
    return 'normal';
  });

  readonly noticeDirty = computed(
    () => this.noticeDraft().trim() !== (this.savedNotice() ?? '').trim(),
  );

  readonly capacityDirty = computed(() => {
    return (
      this.normalizeCapacity(this.insideCapacityDraft()) !== this.savedInsideCapacity() ||
      this.normalizeCapacity(this.outsideCapacityDraft()) !== this.savedOutsideCapacity()
    );
  });

  constructor() {
    effect(() => {
      const notice = this.notice();
      const normalized = notice?.trim() || null;
      this.savedNotice.set(normalized);
      this.noticeDraft.set(normalized ?? '');
    });

    effect(() => {
      const settings = this.daySettings();
      this.daySignupOverride.set(settings?.signupEnabled ?? null);
      this.dayInsideOverride.set(settings?.insideEnabled ?? null);
      this.dayOutsideOverride.set(settings?.outsideEnabled ?? null);
      const insideCap = this.normalizeCapacity(settings?.insideCapacityRemaining ?? null);
      const outsideCap = this.normalizeCapacity(settings?.outsideCapacityRemaining ?? null);
      this.savedInsideCapacity.set(insideCap);
      this.savedOutsideCapacity.set(outsideCap);
      this.insideCapacityDraft.set(insideCap);
      this.outsideCapacityDraft.set(outsideCap);
    });
  }

  saveNotice(): void {
    if (!this.canManage() || this.savingNotice()) return;
    const shopId = this.shopId();
    if (!shopId) return;
    const message = this.noticeDraft().trim();
    this.savingNotice.set(true);
    this.api
      .upsertDayNotice(shopId, {
        businessDate: this.businessDate(),
        message,
      })
      .subscribe({
        next: (res) => {
          this.savingNotice.set(false);
          const notice = String(res.notice ?? '').trim() || null;
          this.savedNotice.set(notice);
          this.noticeDraft.set(notice ?? '');
          this.noticeUpdated.emit(notice);
          this.applySettingsFromResponse(res.daySettings ?? null);
          this.snack.open(notice ? 'Aviso guardado' : 'Aviso quitado', 'OK', {
            duration: 2200,
          });
        },
        error: (err) => {
          this.savingNotice.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar el aviso';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  clearNotice(): void {
    this.noticeDraft.set('');
    this.saveNotice();
  }

  onDayFormMode(value: string | null | undefined): void {
    const mode = this.parseDayFormMode(value);
    if (!mode || mode === this.dayFormMode()) return;
    switch (mode) {
      case 'normal':
        this.daySignupOverride.set(null);
        this.dayInsideOverride.set(null);
        this.dayOutsideOverride.set(null);
        break;
      case 'closed':
        this.daySignupOverride.set(false);
        this.dayInsideOverride.set(null);
        this.dayOutsideOverride.set(null);
        break;
      case 'no-inside':
        this.daySignupOverride.set(null);
        this.dayInsideOverride.set(false);
        this.dayOutsideOverride.set(null);
        break;
      case 'no-outside':
        this.daySignupOverride.set(null);
        this.dayInsideOverride.set(null);
        this.dayOutsideOverride.set(false);
        break;
    }
    this.saveDaySettings(true);
  }

  saveCapacity(): void {
    if (!this.canManage() || this.savingDaySettings() || !this.capacityDirty()) return;
    this.saveDaySettings(false, true);
  }

  private parseDayFormMode(value: string | null | undefined): DayFormMode | null {
    if (
      value === 'normal' ||
      value === 'closed' ||
      value === 'no-inside' ||
      value === 'no-outside'
    ) {
      return value;
    }
    return null;
  }

  private saveDaySettings(silent = false, includeCapacity = false): void {
    if (!this.canManage() || this.savingDaySettings()) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.savingDaySettings.set(true);
    const body: {
      businessDate: string;
      signupEnabled: boolean | null;
      insideEnabled: boolean | null;
      outsideEnabled: boolean | null;
      insideCapacityRemaining?: number | null;
      outsideCapacityRemaining?: number | null;
    } = {
      businessDate: this.businessDate(),
      signupEnabled: this.daySignupOverride(),
      insideEnabled: this.dayInsideOverride(),
      outsideEnabled: this.dayOutsideOverride(),
    };
    if (includeCapacity) {
      body.insideCapacityRemaining = this.normalizeCapacity(this.insideCapacityDraft());
      body.outsideCapacityRemaining = this.normalizeCapacity(this.outsideCapacityDraft());
    }
    this.api.upsertDayNotice(shopId, body).subscribe({
      next: (res) => {
        this.savingDaySettings.set(false);
        this.applySettingsFromResponse(res.daySettings ?? null);
        this.daySettingsUpdated.emit(res.daySettings ?? null);
        if (!silent) {
          this.snack.open(
            includeCapacity ? 'Cupos del día guardados' : 'Formulario del día guardado',
            'OK',
            { duration: 2200 },
          );
        }
      },
      error: (err) => {
        this.savingDaySettings.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar el formulario';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private applySettingsFromResponse(settings: ReservationDaySettings | null): void {
    this.daySignupOverride.set(settings?.signupEnabled ?? null);
    this.dayInsideOverride.set(settings?.insideEnabled ?? null);
    this.dayOutsideOverride.set(settings?.outsideEnabled ?? null);
    const insideCap = this.normalizeCapacity(settings?.insideCapacityRemaining ?? null);
    const outsideCap = this.normalizeCapacity(settings?.outsideCapacityRemaining ?? null);
    this.savedInsideCapacity.set(insideCap);
    this.savedOutsideCapacity.set(outsideCap);
    this.insideCapacityDraft.set(insideCap);
    this.outsideCapacityDraft.set(outsideCap);
  }

  private normalizeCapacity(raw: number | string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(n, 999);
  }

  private shopId(): string | null {
    return this.shops.selectedShopId();
  }
}
