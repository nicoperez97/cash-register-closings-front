import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import {
  ReservationPublicForm,
  ReservationsApiService,
} from '../reservations/reservations-api.service';

const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 0, label: 'Domingo' },
  { day: 1, label: 'Lunes' },
  { day: 2, label: 'Martes' },
  { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' },
  { day: 5, label: 'Viernes' },
  { day: 6, label: 'Sábado' },
];

type DayDraft = { hours: string[]; message: string; newTime: string };

@Component({
  selector: 'app-salon-hours-page',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    PageHeaderComponent,
    SpinnerComponent,
  ],
  template: `
    <app-page-header
      eyebrow="Salón"
      title="Horarios"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
    />

    <nav class="salon-tabs" aria-label="Diagrama, reglas y horarios">
      <a routerLink="/salon/diagrama" class="salon-tabs__link">
        <mat-icon>grid_view</mat-icon>
        Diagrama
      </a>
      <a routerLink="/salon/reglas" class="salon-tabs__link">
        <mat-icon>tune</mat-icon>
        Reglas
      </a>
      <a routerLink="/salon/horarios" class="salon-tabs__link salon-tabs__link--on">
        <mat-icon>schedule</mat-icon>
        Horarios
      </a>
    </nav>

    @if (loading()) {
      <div class="panel-card guy-empty guy-empty--loading" role="status">
        <app-spinner [size]="28" />
        <p>Cargando horarios…</p>
      </div>
    } @else {
      <p class="salon-lead">
        Estos horarios y textos se ven en el formulario público de reservas. El horario es
        opcional para el cliente. El aviso de un día puntual se carga en Reservas.
      </p>

      <section class="panel-card hours-general">
        <h2>Mensaje general</h2>
        <p class="text-muted">Se muestra siempre, arriba del formulario.</p>
        <mat-form-field appearance="outline" class="hours-full">
          <mat-label>Texto para todos los días</mat-label>
          <textarea
            matInput
            rows="3"
            maxlength="600"
            [(ngModel)]="generalMessage"
            [disabled]="!canManage()"
            placeholder="Ej: Se toman reservas hasta las 21 hs."
          ></textarea>
        </mat-form-field>
      </section>

      @for (wd of weekdays; track wd.day) {
        <section class="panel-card hours-day">
          <header class="hours-day__head">
            <h2>{{ wd.label }}</h2>
            @if (canManage()) {
              <button mat-stroked-button type="button" (click)="copyHoursToAll(wd.day)">
                Copiar horarios a todos
              </button>
            }
          </header>
          <div class="hours-chips">
            @for (slot of days[wd.day].hours; track slot) {
              <span class="hours-chip">
                {{ slot }}
                @if (canManage()) {
                  <button type="button" (click)="removeHour(wd.day, slot)" aria-label="Quitar">
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </span>
            } @empty {
              <span class="text-muted">Sin horarios este día</span>
            }
          </div>
          @if (canManage()) {
            <div class="hours-add">
              <input type="time" [(ngModel)]="days[wd.day].newTime" />
              <button mat-stroked-button type="button" (click)="addHour(wd.day)">Agregar</button>
            </div>
          }
          <mat-form-field appearance="outline" class="hours-full">
            <mat-label>Mensaje de {{ wd.label }}</mat-label>
            <textarea
              matInput
              rows="2"
              maxlength="400"
              [(ngModel)]="days[wd.day].message"
              [disabled]="!canManage()"
              placeholder="Opcional, solo ese día de la semana"
            ></textarea>
          </mat-form-field>
        </section>
      }

      @if (canManage()) {
        <div class="hours-save">
          <button mat-flat-button color="primary" type="button" [disabled]="saving()" (click)="save()">
            {{ saving() ? 'Guardando…' : 'Guardar horarios' }}
          </button>
        </div>
      }
    }
  `,
  styleUrl: './salon-hours-page.scss',
})
export class SalonHoursPage {
  private readonly api = inject(ReservationsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);

  readonly weekdays = WEEKDAYS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  generalMessage = '';
  days: DayDraft[] = WEEKDAYS.map(() => ({ hours: [], message: '', newTime: '19:30' }));

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      untracked(() => {
        if (shopId) this.load();
      });
    });
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reservations.manage');
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.getPublicForm(shopId).subscribe({
      next: (cfg) => {
        this.applyConfig(cfg);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.fail(err, 'No se pudieron cargar los horarios');
      },
    });
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage() || this.saving()) return;
    this.saving.set(true);
    this.api.savePublicForm(shopId, this.toPayload()).subscribe({
      next: (cfg) => {
        this.applyConfig(cfg);
        this.saving.set(false);
        this.snack.open('Horarios guardados', 'OK', { duration: 2200 });
      },
      error: (err) => {
        this.saving.set(false);
        this.fail(err, 'No se pudieron guardar los horarios');
      },
    });
  }

  addHour(day: number): void {
    const raw = (this.days[day].newTime || '').trim();
    const slot = this.normalizeTime(raw);
    if (!slot) {
      this.snack.open('Ingresá una hora válida', 'OK', { duration: 2200 });
      return;
    }
    if (this.days[day].hours.includes(slot)) return;
    this.days[day].hours = [...this.days[day].hours, slot].sort();
  }

  removeHour(day: number, slot: string): void {
    this.days[day].hours = this.days[day].hours.filter((h) => h !== slot);
  }

  copyHoursToAll(fromDay: number): void {
    const hours = [...this.days[fromDay].hours];
    for (const wd of WEEKDAYS) {
      this.days[wd.day].hours = [...hours];
    }
    this.snack.open('Horarios copiados a todos los días', 'OK', { duration: 2000 });
  }

  private applyConfig(cfg: ReservationPublicForm): void {
    this.generalMessage = cfg.generalMessage ?? '';
    for (const wd of WEEKDAYS) {
      const hours = cfg.hoursByWeekday?.[String(wd.day)] ?? [];
      this.days[wd.day] = {
        hours: [...hours],
        message: cfg.weekdayMessages?.[String(wd.day)] ?? '',
        newTime: this.days[wd.day]?.newTime || '19:30',
      };
    }
  }

  private toPayload(): ReservationPublicForm {
    const hoursByWeekday: Record<string, string[]> = {};
    const weekdayMessages: Record<string, string> = {};
    for (const wd of WEEKDAYS) {
      hoursByWeekday[String(wd.day)] = [...this.days[wd.day].hours];
      const msg = this.days[wd.day].message.trim();
      if (msg) weekdayMessages[String(wd.day)] = msg;
    }
    return {
      hoursByWeekday,
      generalMessage: this.generalMessage.trim(),
      weekdayMessages,
    };
  }

  private normalizeTime(raw: string): string | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  private fail(err: { error?: { message?: string | string[] } }, fallback: string): void {
    const raw = err?.error?.message;
    const msg = Array.isArray(raw) ? raw[0] : raw;
    this.snack.open(msg || fallback, 'OK', { duration: 3600 });
  }
}
