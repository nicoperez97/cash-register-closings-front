import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop } from '../../core/auth/auth.models';
import { normalizeLogoUrl } from '../../core/utils/drive-url';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import { ClosingsApiService, SalesSystemOption } from '../closings/closings-api.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

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
    MatIconModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Administrar local"
      [subtitle]="shops.selectedShop()?.name ?? 'Configuración del local activo'"
      actionLabel="Guardar"
      actionIcon="save"
      [actionDisabled]="form.invalid || saving()"
      (action)="save()"
    />

    <form class="shop-admin" [formGroup]="form" (ngSubmit)="save()">
      <aside class="shop-admin__preview panel-card">
        <p class="shop-admin__preview-label">Vista previa</p>
        <div
          class="shop-admin__brand"
          [style.--preview-accent]="liveAccent()"
        >
          <div class="shop-admin__logo-wrap">
            @if (previewUrl()) {
              <img
                [src]="previewUrl()"
                alt="Logo del local"
                referrerpolicy="no-referrer"
                class="shop-admin__logo"
              />
            } @else {
              <mat-icon class="shop-admin__logo-fallback">storefront</mat-icon>
            }
          </div>
          <div class="shop-admin__brand-text">
            <strong>{{ liveName() || 'Nombre del local' }}</strong>
            <span>{{ liveSlug() || 'slug-del-local' }}</span>
          </div>
        </div>
        <div class="shop-admin__swatch-row">
          <span class="shop-admin__swatch" [style.background]="liveAccent()"></span>
          <span class="text-muted small">{{ liveAccent() }} · color de énfasis</span>
        </div>
        <p class="text-muted small mb-0">
          Así se ve en el menú lateral y en botones del local.
        </p>
      </aside>

      <div class="shop-admin__fields">
        <section class="panel-card">
          <h2 class="guy-section-title">Identidad</h2>
          <p class="text-muted small mb-3">Nombre visible y URL interna del local.</p>
          <div class="guy-form-grid guy-form-grid--2">
            <mat-form-field appearance="outline">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="name" autocomplete="organization" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Slug</mat-label>
              <input matInput formControlName="slug" />
              <mat-hint>Solo minúsculas, números y guiones</mat-hint>
            </mat-form-field>
          </div>
        </section>

        <section class="panel-card">
          <h2 class="guy-section-title">Apariencia</h2>
          <p class="text-muted small mb-3">Logo y color que identifican al local en la app.</p>
          <div class="guy-form-grid guy-form-grid--2">
            <mat-form-field appearance="outline" class="shop-admin__full">
              <mat-label>URL del logo</mat-label>
              <input
                matInput
                formControlName="logoUrl"
                placeholder="Pegá el vínculo de Drive (Copiar vínculo)"
              />
              <mat-hint>
                Google Drive con permiso “Cualquiera con el enlace”, o una URL directa de imagen.
              </mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Color de énfasis</mat-label>
              <input matInput formControlName="accentColor" placeholder="#007A14" />
              <mat-hint>Hex (#RRGGBB) para botones y menú activo</mat-hint>
            </mat-form-field>
            <div class="shop-admin__color-picker">
              <label class="shop-admin__color-label" for="accentPicker">Elegir color</label>
              <input
                id="accentPicker"
                type="color"
                [value]="colorPickerValue()"
                (input)="onAccentPicker($event)"
              />
              <span
                class="shop-admin__swatch shop-admin__swatch--lg"
                [style.background]="liveAccent()"
                aria-hidden="true"
              ></span>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <h2 class="guy-section-title">Operación</h2>
          <p class="text-muted small mb-3">Defaults de cierres e integración POS.</p>
          <div class="guy-form-grid guy-form-grid--2">
            <mat-form-field appearance="outline">
              <mat-label>Etiqueta de unidades</mat-label>
              <input matInput formControlName="unitsLabel" placeholder="ej. paninos, tickets" />
              <mat-hint>Cómo se llaman las unidades vendidas en este local</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Cambio por defecto</mat-label>
              <input matInput type="number" formControlName="defaultChangeAmount" min="0" step="1" />
              <mat-hint>Monto sugerido de cambio al abrir un cierre</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="shop-admin__full">
              <mat-label>Sistema de ventas</mat-label>
              <mat-select formControlName="salesSystemId">
                <mat-option [value]="null">Sin sistema</mat-option>
                @for (s of salesSystems(); track s.id) {
                  <mat-option [value]="s.id">{{ s.name }}</mat-option>
                }
              </mat-select>
              <mat-hint>Define cómo interpretar reportes POS (Restosoft, WeMenu, etc.)</mat-hint>
            </mat-form-field>
            <div class="shop-admin__toggle shop-admin__full">
              <div>
                <strong>Comensales</strong>
                <p class="text-muted small mb-0">
                  Mostrar y pedir cantidad de comensales en los cierres.
                </p>
              </div>
              <mat-slide-toggle formControlName="coversEnabled" aria-label="Comensales habilitados" />
            </div>
          </div>
        </section>

        <section class="panel-card">
          <h2 class="guy-section-title">Estado</h2>
          <div class="shop-admin__toggle">
            <div>
              <strong>Local habilitado</strong>
              <p class="text-muted small mb-0">
                Si está deshabilitado no aparece en el selector de locales.
              </p>
            </div>
            <mat-slide-toggle formControlName="active" aria-label="Local habilitado" />
          </div>
        </section>

        <div class="shop-admin__actions">
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="form.invalid || saving()"
          >
            <mat-icon>save</mat-icon>
            {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>
      </div>
    </form>
  `,
  styles: [
    `
      .shop-admin {
        display: grid;
        gap: 1rem;
        align-items: start;
      }
      @media (min-width: 960px) {
        .shop-admin {
          grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
          gap: 1.25rem;
        }
      }
      .shop-admin__preview {
        position: sticky;
        top: 0.75rem;
      }
      .shop-admin__preview-label {
        margin: 0 0 0.75rem;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }
      .shop-admin__brand {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.85rem;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--preview-accent, #2e7d32) 35%, var(--guy-border, #ddd));
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--preview-accent, #2e7d32) 12%, var(--guy-card, #fff)),
          var(--guy-card, #fff)
        );
        margin-bottom: 0.85rem;
      }
      .shop-admin__logo-wrap {
        width: 52px;
        height: 52px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: var(--guy-card, #fff);
        border: 1px solid var(--guy-border, #ddd);
        overflow: hidden;
        flex-shrink: 0;
      }
      .shop-admin__logo {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .shop-admin__logo-fallback {
        color: var(--preview-accent, #2e7d32);
        font-size: 28px;
        width: 28px;
        height: 28px;
      }
      .shop-admin__brand-text {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .shop-admin__brand-text strong {
        font-size: 1rem;
        color: var(--guy-navy, #003366);
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .shop-admin__brand-text span {
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .shop-admin__swatch-row {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        margin-bottom: 0.65rem;
      }
      .shop-admin__swatch {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 1px solid var(--guy-border, #ddd);
        flex-shrink: 0;
      }
      .shop-admin__swatch--lg {
        width: 36px;
        height: 36px;
        border-radius: 8px;
      }
      .shop-admin__fields {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
      }
      .shop-admin__full {
        grid-column: 1 / -1;
      }
      .shop-admin__color-picker {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 56px;
        padding-bottom: 1.25rem;
      }
      .shop-admin__color-label {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
        margin: 0;
      }
      input[type='color'] {
        width: 48px;
        height: 40px;
        padding: 0;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
      }
      .shop-admin__toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.85rem 1rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #ddd);
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, var(--guy-card, #fff));
      }
      .shop-admin__toggle strong {
        display: block;
        font-size: 0.95rem;
        color: var(--guy-navy, #003366);
        margin-bottom: 0.15rem;
      }
      .shop-admin__actions {
        display: flex;
        justify-content: flex-end;
        padding-bottom: 0.5rem;
      }
      .shop-admin__actions button mat-icon {
        margin-right: 0.15rem;
      }
      @media (max-width: 959px) {
        .shop-admin__preview {
          position: static;
        }
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
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    logoUrl: [''],
    accentColor: ['#2E7D32'],
    unitsLabel: [''],
    defaultChangeAmount: [0],
    coversEnabled: [false],
    active: [true],
    salesSystemId: this.fb.control<string | null>(null),
  });

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  readonly liveName = computed(() => this.formValue()?.name?.trim() ?? '');
  readonly liveSlug = computed(() => this.formValue()?.slug?.trim() ?? '');
  readonly liveAccent = computed(() => {
    const v = this.formValue()?.accentColor?.trim() || '#2E7D32';
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : '#2E7D32';
  });
  readonly previewUrl = computed(
    () => normalizeLogoUrl(this.formValue()?.logoUrl ?? '') ?? '',
  );

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
      active: shop.active ?? true,
      salesSystemId: shop.salesSystemId ?? null,
    });
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
          active: !!s.active,
        });
        this.shops.upsertShop(s);
      },
    });
  }

  colorPickerValue(): string {
    return this.liveAccent();
  }

  onAccentPicker(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.form.controls.accentColor.setValue(value.toUpperCase());
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.form.invalid || this.saving()) return;
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.http
      .patch<any>(`${environment.apiUrl}/shops/${shopId}`, {
        name: raw.name,
        slug: raw.slug,
        logoUrl: raw.logoUrl.trim() || '',
        accentColor: raw.accentColor.trim() || null,
        unitsLabel: raw.unitsLabel.trim() || null,
        defaultChangeAmount: raw.defaultChangeAmount,
        coversEnabled: raw.coversEnabled,
        active: raw.active,
        salesSystemId: raw.salesSystemId || null,
      })
      .subscribe({
        next: (shop) => {
          this.saving.set(false);
          if (shop.active === false) {
            this.shops.setShops(this.shops.shops().filter((s) => s.id !== shop.id));
          } else {
            this.shops.upsertShop(shop);
          }
          void this.auth.refreshMe();
          this.snack.open('Local actualizado', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
