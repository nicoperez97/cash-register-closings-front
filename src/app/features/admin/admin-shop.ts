import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop } from '../../core/auth/auth.models';
import { normalizeLogoUrl } from '../../core/utils/drive-url';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import { ClosingsApiService, SalesSystemOption } from '../closings/closings-api.service';

@Component({
  selector: 'app-admin-shop',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Administrar local"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    <div class="panel-card">
      <form class="guy-form-grid guy-form-grid--2" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Slug</mat-label>
          <input matInput formControlName="slug" />
        </mat-form-field>
        <mat-form-field appearance="outline" style="grid-column:1/-1">
          <mat-label>URL del logo</mat-label>
          <input
            matInput
            formControlName="logoUrl"
            placeholder="Pegá el vínculo de Drive (Copiar vínculo)"
          />
          <mat-hint>
            Podés pegar el link de Google Drive (“Copiar vínculo”). El archivo tiene que estar
            compartido como “Cualquiera con el enlace”.
          </mat-hint>
        </mat-form-field>
        @if (previewUrl()) {
          <div style="grid-column:1/-1" class="mb-2 d-flex align-items-center gap-3">
            <img [src]="previewUrl()" alt="Preview logo" referrerpolicy="no-referrer" style="max-height:48px;object-fit:contain" />
            <span
              class="shop-accent-swatch"
              [style.background]="form.controls.accentColor.value || '#ccc'"
              title="Color de énfasis"
            ></span>
          </div>
        }
        <mat-form-field appearance="outline">
          <mat-label>Color de énfasis</mat-label>
          <input matInput formControlName="accentColor" placeholder="#E65100" />
          <mat-hint>Hex del local (botones, menú activo, etc.)</mat-hint>
        </mat-form-field>
        <div class="d-flex align-items-center gap-2">
          <label class="text-muted small mb-0" for="accentPicker">Elegir</label>
          <input
            id="accentPicker"
            type="color"
            [value]="colorPickerValue()"
            (input)="onAccentPicker($event)"
          />
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Etiqueta unidades (ej. paninos)</mat-label>
          <input matInput formControlName="unitsLabel" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Cambio por defecto</mat-label>
          <input matInput type="number" formControlName="defaultChangeAmount" />
        </mat-form-field>
        <mat-form-field appearance="outline" style="grid-column:1/-1">
          <mat-label>Sistema de ventas</mat-label>
          <mat-select formControlName="salesSystemId">
            <mat-option [value]="null">Sin sistema</mat-option>
            @for (s of salesSystems(); track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>Define cómo interpretar reportes POS (ej. Restosoft)</mat-hint>
        </mat-form-field>
        <div style="grid-column:1/-1" class="d-flex align-items-center gap-2 mb-2">
          <mat-slide-toggle formControlName="coversEnabled">Comensales habilitados</mat-slide-toggle>
        </div>
        <div class="d-flex gap-2" style="grid-column:1/-1">
          <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">
            Guardar
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
      .shop-accent-swatch {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 1px solid var(--guy-border, #ddd);
        flex-shrink: 0;
      }
      input[type='color'] {
        width: 42px;
        height: 36px;
        padding: 0;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
      }
    `,
  ],
})
export class AdminShopPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly shops = inject(ShopContextService);

  readonly salesSystems = signal<SalesSystemOption[]>([]);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    logoUrl: [''],
    accentColor: ['#2E7D32'],
    unitsLabel: [''],
    defaultChangeAmount: [0],
    coversEnabled: [false],
    salesSystemId: this.fb.control<string | null>(null),
  });

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageShop(this.auth.currentUser(), shopId)) {
      void this.router.navigate(['/']);
      return;
    }
    this.api.listSalesSystems().subscribe({
      next: (rows) => this.salesSystems.set(rows),
      error: () => this.salesSystems.set([]),
    });
    const shop = this.shops.selectedShop();
    if (!shop) return;
    this.form.patchValue({
      name: shop.name,
      slug: shop.slug,
      logoUrl: shop.logoUrl ?? '',
      accentColor: shop.accentColor ?? '#2E7D32',
      unitsLabel: shop.unitsLabel ?? '',
      defaultChangeAmount: shop.defaultChangeAmount ?? 0,
      coversEnabled: !!shop.coversEnabled,
      salesSystemId: shop.salesSystemId ?? null,
    });
    // Reload shop from API to get salesSystemId if missing in cached me
    this.http.get<any>(`${environment.apiUrl}/shops/${shopId}`).subscribe({
      next: (s) => {
        this.form.patchValue({
          salesSystemId: s.salesSystemId ?? null,
          name: s.name,
          slug: s.slug,
          logoUrl: s.logoUrl ?? '',
          accentColor: s.accentColor ?? '#2E7D32',
          unitsLabel: s.unitsLabel ?? '',
          defaultChangeAmount: s.defaultChangeAmount ?? 0,
          coversEnabled: !!s.coversEnabled,
        });
        this.shops.upsertShop(s);
      },
    });
  }

  previewUrl(): string {
    return normalizeLogoUrl(this.form.controls.logoUrl.value) ?? '';
  }

  colorPickerValue(): string {
    const v = this.form.controls.accentColor.value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#2E7D32';
  }

  onAccentPicker(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.form.controls.accentColor.setValue(value.toUpperCase());
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.form.invalid) return;
    const raw = this.form.getRawValue();
    this.http
      .patch<any>(`${environment.apiUrl}/shops/${shopId}`, {
        name: raw.name,
        slug: raw.slug,
        logoUrl: raw.logoUrl.trim() || '',
        accentColor: raw.accentColor.trim() || null,
        unitsLabel: raw.unitsLabel.trim() || null,
        defaultChangeAmount: raw.defaultChangeAmount,
        coversEnabled: raw.coversEnabled,
        salesSystemId: raw.salesSystemId || null,
      })
      .subscribe({
        next: (shop) => {
          this.shops.upsertShop(shop);
          void this.auth.refreshMe();
          this.snack.open('Local actualizado', 'OK', { duration: 2500 });
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
