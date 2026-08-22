import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export type SalonHoursDayDialogData = {
  label: string;
  hours: string[];
  message: string;
  canManage: boolean;
};

export type SalonHoursDayDialogResult = {
  hours: string[];
  message: string;
  copyHoursToAll?: boolean;
};

@Component({
  selector: 'app-salon-hours-day-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>schedule</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.label }}</strong>
        <span>Horarios y mensaje del formulario público</span>
      </span>
    </h2>

    <mat-dialog-content>
      <div class="hours-chips">
        @for (slot of hours(); track slot) {
          <span class="hours-chip">
            {{ slot }}
            @if (data.canManage) {
              <button type="button" (click)="removeHour(slot)" aria-label="Quitar">
                <mat-icon>close</mat-icon>
              </button>
            }
          </span>
        } @empty {
          <span class="text-muted">Sin horarios este día</span>
        }
      </div>
      @if (data.canManage) {
        <div class="hours-add">
          <input type="time" [(ngModel)]="newTime" />
          <button mat-stroked-button type="button" (click)="addHour()">Agregar</button>
        </div>
      }
      <mat-form-field appearance="outline" class="hours-full">
        <mat-label>Mensaje de {{ data.label }}</mat-label>
        <textarea
          matInput
          rows="3"
          maxlength="400"
          [(ngModel)]="message"
          [disabled]="!data.canManage"
          placeholder="Opcional, solo ese día de la semana"
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancelar</button>
      @if (data.canManage) {
        <button mat-stroked-button type="button" (click)="apply(true)">
          Copiar horarios a todos
        </button>
        <button mat-flat-button color="primary" type="button" (click)="apply(false)">
          Aplicar
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .hours-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 0.75rem;
    }
    .hours-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.28rem 0.55rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 12%, #fff);
      font-weight: 700;
      font-size: 0.88rem;
    }
    .hours-chip button {
      display: inline-flex;
      border: 0;
      background: transparent;
      padding: 0;
      cursor: pointer;
      color: inherit;
    }
    .hours-chip mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }
    .hours-add {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.85rem;
    }
    .hours-add input[type='time'] {
      min-height: 2.4rem;
      padding: 0.3rem 0.55rem;
      border-radius: 10px;
      border: 1px solid var(--guy-border, #d7e0d9);
      font: inherit;
    }
    .hours-full {
      width: 100%;
    }
    .text-muted {
      color: var(--guy-muted, #5f6f76);
      font-size: 0.88rem;
    }
  `,
})
export class SalonHoursDayDialogComponent {
  readonly data = inject<SalonHoursDayDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<SalonHoursDayDialogComponent, SalonHoursDayDialogResult | undefined>);
  private readonly snack = inject(MatSnackBar);

  readonly hours = signal<string[]>([...this.data.hours]);
  message = this.data.message;
  newTime = '19:30';

  addHour(): void {
    const slot = this.normalizeTime(this.newTime);
    if (!slot) {
      this.snack.open('Ingresá una hora válida', 'OK', { duration: 2200 });
      return;
    }
    if (this.hours().includes(slot)) return;
    this.hours.set([...this.hours(), slot].sort());
  }

  removeHour(slot: string): void {
    this.hours.set(this.hours().filter((h) => h !== slot));
  }

  apply(copyHoursToAll: boolean): void {
    this.ref.close({
      hours: [...this.hours()],
      message: this.message.trim(),
      copyHoursToAll,
    });
  }

  private normalizeTime(raw: string): string | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec((raw || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
}
