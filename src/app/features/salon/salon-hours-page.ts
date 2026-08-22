import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import {
  ReservationPublicForm,
  ReservationsApiService,
} from '../reservations/reservations-api.service';
import { SalonHoursDayDialogComponent } from './salon-hours-day-dialog';

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
    MatDialogModule,
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

      <section class="panel-card hours-days">
        <h2>Días</h2>
        <p class="text-muted">Tocá un día para ver o editar horarios y el mensaje.</p>
        <ul class="hours-days__list">
          @for (wd of weekdays; track wd.day) {
            <li>
              <button
                type="button"
                class="hours-days__row"
                (click)="openDay(wd.day)"
              >
                <span class="hours-days__name">{{ wd.label }}</span>
                <span class="hours-days__meta">
                  <span>{{ hoursLabel(wd.day) }}</span>
                  @if (days[wd.day].message.trim()) {
                    <span class="hours-days__note">{{ days[wd.day].message }}</span>
                  }
                </span>
                <mat-icon>{{ canManage() ? 'edit' : 'chevron_right' }}</mat-icon>
              </button>
            </li>
          }
        </ul>
      </section>

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
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
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

  hoursLabel(day: number): string {
    const hours = this.days[day].hours;
    return hours.length ? hours.join(' · ') : 'Sin horarios';
  }

  openDay(day: number): void {
    const wd = WEEKDAYS.find((w) => w.day === day);
    if (!wd) return;
    const draft = this.days[day];
    const ref = this.dialog.open(SalonHoursDayDialogComponent, {
      width: 'min(28rem, 96vw)',
      autoFocus: 'first-tabbable',
      data: {
        label: wd.label,
        hours: [...draft.hours],
        message: draft.message,
        canManage: this.canManage(),
      },
    });
    this.dialogTitle.track(ref, wd.label);
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.days[day] = {
        hours: [...result.hours],
        message: result.message,
        newTime: this.days[day].newTime || '19:30',
      };
      if (result.copyHoursToAll) {
        for (const other of WEEKDAYS) {
          this.days[other.day].hours = [...result.hours];
        }
        this.snack.open('Horarios copiados a todos los días', 'OK', { duration: 2000 });
      }
    });
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

  private fail(err: { error?: { message?: string | string[] } }, fallback: string): void {
    const raw = err?.error?.message;
    const msg = Array.isArray(raw) ? raw[0] : raw;
    this.snack.open(msg || fallback, 'OK', { duration: 3600 });
  }
}
