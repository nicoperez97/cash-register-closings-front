import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { environment } from '../../../environments/environment';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export interface AdminShopRow {
  id: string;
  name: string;
  slug: string;
  currency?: string;
  unitsLabel?: string | null;
  coversEnabled?: boolean;
  reservationsEnabled?: boolean;
  waitingListEnabled?: boolean;
  defaultChangeAmount?: number;
  openingTime?: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  accentSecondary?: string | null;
  active: boolean;
}

export type AdminShopDialogData =
  | { mode: 'create' }
  | { mode: 'edit'; shop: AdminShopRow };

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Component({
  selector: 'app-admin-shop-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
    MatSelectModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'add_business' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar local' : 'Nuevo local' }}</strong>
        <span>Administración de locales</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>storefront</mat-icon>
          <input matInput formControlName="name" placeholder="Tutto Passa" (blur)="suggestSlug()" />
          @if (form.controls.name.touched && form.controls.name.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Slug</mat-label>
          <mat-icon matPrefix>link</mat-icon>
          <input matInput formControlName="slug" placeholder="tutto-passa" />
          <mat-hint>Identificador único en URL (sin espacios)</mat-hint>
          @if (form.controls.slug.touched && form.controls.slug.hasError('required')) {
            <mat-error>Ingresá un slug</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Etiqueta unidades</mat-label>
          <mat-icon matPrefix>inventory_2</mat-icon>
          <input matInput formControlName="unitsLabel" placeholder="paninos" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Moneda</mat-label>
          <mat-icon matPrefix>payments</mat-icon>
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
          <mat-icon matPrefix>payments</mat-icon>
          <input matInput type="number" inputmode="decimal" formControlName="defaultChangeAmount" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Hora de apertura</mat-label>
          <mat-icon matPrefix>schedule</mat-icon>
          <input matInput type="time" formControlName="openingTime" />
          <mat-hint>Día laboral hasta esta hora del día siguiente</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Color principal</mat-label>
          <mat-icon matPrefix>palette</mat-icon>
          <input matInput formControlName="accentColor" placeholder="#2E7D32" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Color de énfasis</mat-label>
          <mat-icon matPrefix>colorize</mat-icon>
          <input matInput formControlName="accentSecondary" placeholder="#F9A825" />
        </mat-form-field>

        <mat-slide-toggle formControlName="coversEnabled">Comensales habilitados</mat-slide-toggle>
        <mat-slide-toggle formControlName="reservationsEnabled">Reservas habilitadas</mat-slide-toggle>
        <mat-slide-toggle formControlName="waitingListEnabled">Lista de espera habilitada</mat-slide-toggle>

        @if (isEdit) {
          <mat-slide-toggle formControlName="active">Local habilitado</mat-slide-toggle>
          <p class="hint">
            Si está deshabilitado no aparece en el selector ni se puede operar sobre él.
          </p>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || busy()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .hint {
        margin: 0;
        font-size: 0.8rem;
        color: var(--guy-muted, #666);
      }
    `,
  ],
})
export class AdminShopDialogComponent {
  readonly data = inject<AdminShopDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminShopDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  private readonly shop = this.data.mode === 'edit' ? this.data.shop : null;
  private slugTouchedManually = this.isEdit;

  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: [this.shop?.name ?? '', Validators.required],
    slug: [this.shop?.slug ?? '', Validators.required],
    unitsLabel: [this.shop?.unitsLabel ?? ''],
    currency: [this.shop?.currency ?? 'ARS'],
    defaultChangeAmount: [this.shop?.defaultChangeAmount ?? 0],
    openingTime: [this.shop?.openingTime ?? '10:00'],
    accentColor: [this.shop?.accentColor ?? '#2E7D32'],
    accentSecondary: [this.shop?.accentSecondary ?? '#F9A825'],
    coversEnabled: [this.shop?.coversEnabled ?? false],
    reservationsEnabled: [this.shop ? !!this.shop.reservationsEnabled : true],
    waitingListEnabled: [this.shop ? !!this.shop.waitingListEnabled : true],
    active: [this.shop?.active ?? true],
  });

  suggestSlug(): void {
    if (this.slugTouchedManually) return;
    const s = slugify(this.form.controls.name.value);
    if (s) this.form.controls.slug.setValue(s);
  }

  constructor() {
    this.form.controls.slug.valueChanges.subscribe(() => {
      if (this.isEdit || this.form.controls.slug.dirty) this.slugTouchedManually = true;
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body: Record<string, unknown> = {
      name: raw.name.trim(),
      slug: slugify(raw.slug) || raw.slug.trim(),
      unitsLabel: raw.unitsLabel.trim() || null,
      currency: raw.currency || 'ARS',
      defaultChangeAmount: Number(raw.defaultChangeAmount) || 0,
      openingTime: raw.openingTime || '10:00',
      accentColor: raw.accentColor.trim() || null,
      accentSecondary: raw.accentSecondary.trim() || null,
      coversEnabled: raw.coversEnabled,
      reservationsEnabled: raw.reservationsEnabled,
      waitingListEnabled: raw.waitingListEnabled,
    };
    this.busy.set(true);

    if (this.isEdit && this.shop) {
      body['active'] = raw.active;
      this.http.patch(`${environment.apiUrl}/shops/${this.shop.id}`, body).subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Local actualizado', 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => this.fail(err),
      });
      return;
    }

    this.http.post(`${environment.apiUrl}/shops`, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open('Local creado', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err) => this.fail(err),
    });
  }

  private fail(err: { error?: { message?: string | string[] } }): void {
    this.busy.set(false);
    const msg = err?.error?.message ?? 'No se pudo guardar';
    this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
  }
}
