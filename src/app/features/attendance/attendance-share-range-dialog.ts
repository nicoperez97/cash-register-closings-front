import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';

export type AttendanceShareRangeDialogData = {
  fromIso: string;
  toIso: string;
};

export type AttendanceShareRangeResult = {
  fromIso: string;
  toIso: string;
};

const MAX_DAYS = 31;

@Component({
  selector: 'app-attendance-share-range-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>share</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Compartir presentismo</strong>
        <span>Elegí un día o un rango</span>
      </span>
    </h2>

    <mat-dialog-content>
      <div class="presets">
        <button mat-stroked-button type="button" (click)="presetDay()">Este día</button>
        <button mat-stroked-button type="button" (click)="presetWeek()">Esta semana</button>
        <button mat-stroked-button type="button" (click)="presetMonth()">Este mes</button>
      </div>

      <div class="dates">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Desde</mat-label>
          <input
            matInput
            [matDatepicker]="fromPicker"
            [value]="fromDate"
            (dateChange)="onFrom($event.value)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
          <mat-datepicker #fromPicker touchUi />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Hasta</mat-label>
          <input
            matInput
            [matDatepicker]="toPicker"
            [value]="toDate"
            (dateChange)="onTo($event.value)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="toPicker" />
          <mat-datepicker #toPicker touchUi />
        </mat-form-field>
      </div>

      @if (error) {
        <p class="err">{{ error }}</p>
      } @else {
        <p class="hint">{{ hint }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!!error" (click)="confirm()">
        <mat-icon>share</mat-icon>
        Compartir
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .presets {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 0.15rem 0 0.85rem;
      }
      .dates {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
      }
      .hint,
      .err {
        margin: 0.35rem 0 0;
        font-size: 0.85rem;
      }
      .hint {
        color: var(--guy-muted, #5f6f76);
      }
      .err {
        color: #c62828;
      }
      @media (max-width: 560px) {
        .dates {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AttendanceShareRangeDialogComponent {
  private readonly data = inject<AttendanceShareRangeDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<AttendanceShareRangeDialogComponent, AttendanceShareRangeResult | undefined>,
  );

  fromDate = isoToLocalDate(this.data.fromIso);
  toDate = isoToLocalDate(this.data.toIso);

  get error(): string | null {
    const from = localDateToIso(this.fromDate);
    const to = localDateToIso(this.toDate);
    if (!from || !to) return 'Elegí ambas fechas.';
    if (from > to) return 'Desde no puede ser posterior a Hasta.';
    const days = countDays(from, to);
    if (days > MAX_DAYS) return `Máximo ${MAX_DAYS} días.`;
    return null;
  }

  get hint(): string {
    const from = localDateToIso(this.fromDate);
    const to = localDateToIso(this.toDate);
    if (!from || !to || from > to) return '';
    const n = countDays(from, to);
    return n === 1 ? 'Se comparte un solo día.' : `Se comparten ${n} días.`;
  }

  onFrom(value: Date | null): void {
    if (!value) return;
    this.fromDate = value;
    if (localDateToIso(this.fromDate) > localDateToIso(this.toDate)) {
      this.toDate = value;
    }
  }

  onTo(value: Date | null): void {
    if (!value) return;
    this.toDate = value;
    if (localDateToIso(this.toDate) < localDateToIso(this.fromDate)) {
      this.fromDate = value;
    }
  }

  presetDay(): void {
    const iso = this.data.fromIso;
    this.fromDate = isoToLocalDate(iso);
    this.toDate = isoToLocalDate(iso);
  }

  presetWeek(): void {
    const start = startOfWeek(this.data.fromIso);
    this.fromDate = isoToLocalDate(start);
    this.toDate = isoToLocalDate(addDays(start, 6));
  }

  presetMonth(): void {
    const [y, m] = this.data.fromIso.split('-').map(Number);
    this.fromDate = new Date(y, m - 1, 1, 12, 0, 0);
    this.toDate = new Date(y, m, 0, 12, 0, 0);
  }

  confirm(): void {
    if (this.error) return;
    this.ref.close({
      fromIso: localDateToIso(this.fromDate),
      toIso: localDateToIso(this.toDate),
    });
  }
}

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function localDateToIso(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, delta: number): string {
  const d = isoToLocalDate(iso);
  d.setDate(d.getDate() + delta);
  return localDateToIso(d);
}

function startOfWeek(iso: string): string {
  const d = isoToLocalDate(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateToIso(d);
}

function countDays(from: string, to: string): number {
  const a = isoToLocalDate(from).getTime();
  const b = isoToLocalDate(to).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}
