import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop, hasShopPermission, ShopPosnet } from '../../core/auth/auth.models';
import { normalizeLogoUrl } from '../../core/utils/drive-url';
import { newId } from '../../core/utils/id';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import { ClosingsApiService, SalesSystemOption } from '../closings/closings-api.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { ShopBackupDialogComponent } from './shop-backup-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopBackupApiService } from './shop-backup-api.service';
import { AdminAccountDialogComponent, AdminAccountRow, LINKED_PAYMENT_METHOD_OPTIONS } from './admin-account-dialog';
import { AdminAccountDeleteService } from './admin-account-delete-dialog';
import { activeLabel } from '../../core/i18n/labels';
import { usePageRefresh } from '../../core/page-refresh.service';

const POSNET_TYPE_OPTIONS = [
  { value: 'PVS', label: 'PVS' },
  { value: 'MERCADO_PAGO', label: 'Mercado Pago' },
  { value: 'CUENTA_DNI', label: 'Cuenta DNI' },
] as const;

/** Campos del cierre → medio vinculado a cuenta canal. */
const CLOSING_DEPOSIT_FIELDS = [
  { value: 'card', label: 'PVS / Tarjeta' },
  { value: 'mercadoPago', label: 'Mercado Pago' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'accountDni', label: 'Cuenta DNI' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otros' },
] as const;

/** 0=domingo … 6=sábado (Date.getDay()). */
const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
] as const;

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
    MatDialogModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Administrar local"
      [subtitle]="shops.selectedShop()?.name ?? 'Configuración del local activo'"
    />

    <form
      class="shop-admin"
      [formGroup]="form"
      (ngSubmit)="save()"
      [style.--guy-primary]="liveAccentSecondary()"
      [style.--guy-navy]="liveAccentSecondary()"
      [style.--guy-blue]="liveAccentSecondary()"
    >
      <aside class="shop-admin__preview panel-card">
        <p class="shop-admin__preview-label">Vista previa</p>
        <div
          class="shop-admin__brand"
          [style.--preview-accent]="liveAccent()"
          [style.--preview-accent-secondary]="liveAccentSecondary()"
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
          <span class="shop-admin__swatch" [style.background]="liveAccentSecondary()"></span>
          <span class="text-muted small">
            {{ liveAccent() }} · {{ liveAccentSecondary() }}
          </span>
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

        <section class="panel-card shop-admin__appearance">
          <h2 class="guy-section-title">Apariencia</h2>
          <p class="text-muted small mb-3">
            Logo y color del local en la app y en las PWAs de Reservas / Lista de espera.
          </p>

          <mat-form-field appearance="outline" class="shop-admin__logo-field" subscriptSizing="dynamic">
            <mat-label>URL del logo</mat-label>
            <input
              matInput
              formControlName="logoUrl"
              placeholder="Pegá el vínculo de Drive (Copiar vínculo)"
            />
            <mat-hint>
              Google Drive con permiso “Cualquiera con el enlace”, o una URL directa. Se muestra en
              el tablero; la instalación PWA usa los íconos del sitio (Chrome exige PNG 192 y 512
              same-origin).
            </mat-hint>
          </mat-form-field>

          <div class="shop-admin__colors">
            <div class="shop-admin__color-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Color principal</mat-label>
                <input matInput formControlName="accentColor" placeholder="#007A14" />
                <mat-hint>Hex (#RRGGBB) · menú activo y botones</mat-hint>
              </mat-form-field>
              <div class="shop-admin__color-picker">
                <label class="shop-admin__color-label" for="accentPicker">Principal</label>
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

            <div class="shop-admin__color-row">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Color de énfasis</mat-label>
                <input matInput formControlName="accentSecondary" placeholder="#F9A825" />
                <mat-hint>Hex (#RRGGBB) · títulos y detalles (reemplaza el negro)</mat-hint>
              </mat-form-field>
              <div class="shop-admin__color-picker">
                <label class="shop-admin__color-label" for="accentSecondaryPicker">Énfasis</label>
                <input
                  id="accentSecondaryPicker"
                  type="color"
                  [value]="colorSecondaryPickerValue()"
                  (input)="onAccentSecondaryPicker($event)"
                />
                <span
                  class="shop-admin__swatch shop-admin__swatch--lg"
                  [style.background]="liveAccentSecondary()"
                  aria-hidden="true"
                ></span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <h2 class="guy-section-title">Operación</h2>
          <p class="text-muted small mb-3">
            Caja, producción, POS y módulos del día a día.
          </p>

          <div class="shop-admin__op-block">
            <h3 class="shop-admin__op-title">Caja</h3>
            <div class="guy-form-grid guy-form-grid--2">
              <mat-form-field appearance="outline">
                <mat-label>Etiqueta de unidades</mat-label>
                <input matInput formControlName="unitsLabel" placeholder="ej. paninos, tickets" />
                <mat-hint>Cómo se llaman las unidades vendidas</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Moneda</mat-label>
                <mat-select formControlName="currency">
                  <mat-option value="ARS">ARS · Peso argentino</mat-option>
                  <mat-option value="UYU">UYU · Peso uruguayo</mat-option>
                  <mat-option value="USD">USD · Dólar</mat-option>
                  <mat-option value="EUR">EUR · Euro</mat-option>
                  <mat-option value="BRL">BRL · Real</mat-option>
                  <mat-option value="CLP">CLP · Peso chileno</mat-option>
                  <mat-option value="PYG">PYG · Guaraní</mat-option>
                </mat-select>
                <mat-hint>Moneda de operación del local</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Cambio por defecto</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="defaultChangeAmount"
                  min="0"
                  step="1"
                  inputmode="decimal"
                />
                <mat-hint>Monto sugerido al abrir un cierre</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Hora de apertura</mat-label>
                <input matInput type="time" formControlName="openingTime" />
                <mat-hint>El día del cierre corre hasta esta hora del día siguiente</mat-hint>
              </mat-form-field>
            </div>
            <div class="shop-admin__toggle-list">
              <div class="shop-admin__toggle">
                <div>
                  <strong>Comensales</strong>
                  <p class="text-muted small mb-0">
                    Pedir cantidad de comensales en cada cierre.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="coversEnabled"
                  aria-label="Comensales habilitados"
                />
              </div>
            </div>
          </div>

          <div class="shop-admin__op-block">
            <h3 class="shop-admin__op-title">Producción</h3>
            <div class="guy-form-grid guy-form-grid--2">
              <mat-form-field appearance="outline">
                <mat-label>Horas por defecto</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="productionDefaultHours"
                  min="0"
                  max="24"
                  step="0.5"
                  inputmode="decimal"
                />
                <mat-hint>Al marcar presente en Asistencia · Producción</mat-hint>
              </mat-form-field>
              <p class="shop-admin__op-note">
                Se aplica al tocar un día en la grilla de producción. Se puede editar después
                manteniendo el dedo / clic derecho.
              </p>
            </div>
          </div>

          <div class="shop-admin__op-block">
            <h3 class="shop-admin__op-title">Ventas POS</h3>
            <mat-form-field appearance="outline">
              <mat-label>Sistema de ventas</mat-label>
              <mat-select formControlName="salesSystemId">
                <mat-option [value]="null">Sin sistema</mat-option>
                @for (s of salesSystems(); track s.id) {
                  <mat-option [value]="s.id">{{ s.name }}</mat-option>
                }
              </mat-select>
              <mat-hint>Cómo interpretar reportes (Restosoft, WeMenu, etc.)</mat-hint>
            </mat-form-field>
          </div>

          <div class="shop-admin__op-block shop-admin__op-block--last">
            <h3 class="shop-admin__op-title">Módulos públicos</h3>
            <div class="shop-admin__toggle-list">
              <div class="shop-admin__toggle">
                <div>
                  <strong>Reservas</strong>
                  <p class="text-muted small mb-0">
                    Módulo interno y pantalla pública del local.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="reservationsEnabled"
                  aria-label="Reservas habilitadas"
                />
              </div>
              <div class="shop-admin__toggle">
                <div>
                  <strong>Lista de espera</strong>
                  <p class="text-muted small mb-0">
                    Cola de espera y su pantalla pública.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="waitingListEnabled"
                  aria-label="Lista de espera habilitada"
                />
              </div>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <h2 class="guy-section-title">Días de franco</h2>
          <p class="text-muted small mb-3">
            Marcá los días en que el local no abre. Se reflejan en presentismo.
          </p>
          <div class="shop-admin__weekdays">
            <div class="shop-admin__weekday-chips">
              @for (d of weekdayOptions; track d.value) {
                <button
                  type="button"
                  class="shop-admin__weekday"
                  [class.shop-admin__weekday--on]="isClosedWeekday(d.value)"
                  (click)="toggleClosedWeekday(d.value)"
                >
                  {{ d.label }}
                </button>
              }
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="shop-admin__posnets-head">
            <div>
              <h2 class="guy-section-title">Posnets</h2>
              <p class="text-muted small mb-0">
                Terminales del local. En el cierre se pide un monto por cada uno y se suma por tipo
                (PVS, Mercado Pago, Cuenta DNI).
              </p>
            </div>
            <button mat-stroked-button type="button" (click)="addPosnet()">
              <mat-icon>add</mat-icon>
              Agregar posnet
            </button>
          </div>
          <div class="shop-admin__posnets" formArrayName="posnets">
            @for (row of posnets.controls; track row; let i = $index) {
              <div class="shop-admin__posnet-row" [formGroupName]="i">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Nombre</mat-label>
                  <input matInput formControlName="name" placeholder="ej. Caja 1" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Tipo</mat-label>
                  <mat-select formControlName="type">
                    @for (opt of posnetTypes; track opt.value) {
                      <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  class="shop-admin__posnet-remove"
                  aria-label="Quitar posnet"
                  (click)="removePosnet(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            } @empty {
              <p class="text-muted small mb-0">Sin posnets. Los montos PVS / MP / DNI se cargan a mano.</p>
            }
          </div>
        </section>

        @if (canManageAccounts()) {
          <section class="panel-card" id="shop-admin-closing-deposits">
            <div class="shop-admin__posnets-head">
              <div>
                <h2 class="guy-section-title">Depósito del cierre</h2>
                <p class="text-muted small mb-0">
                  A qué cuenta canal va cada campo del cierre (PVS, Mercado Pago, efectivo…).
                </p>
              </div>
              <button
                mat-stroked-button
                type="button"
                [disabled]="depositSaving()"
                (click)="savePaymentDeposits()"
              >
                <mat-icon>save</mat-icon>
                {{ depositSaving() ? 'Guardando…' : 'Guardar depósitos' }}
              </button>
            </div>
            <div class="shop-admin__deposits" [formGroup]="depositForm">
              @for (field of closingDepositFields; track field.value) {
                <div class="shop-admin__deposit-row">
                  <span class="shop-admin__deposit-label">{{ field.label }}</span>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Cuenta destino</mat-label>
                    <mat-select [formControlName]="field.value">
                      <mat-option [value]="null">Sin vincular</mat-option>
                      @for (a of accounts(); track a.id) {
                        <mat-option [value]="a.id">{{ a.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </div>
              }
            </div>
          </section>

          <section class="panel-card" id="shop-admin-channel-accounts">
            <div class="shop-admin__posnets-head">
              <div>
                <h2 class="guy-section-title">Cuentas canal</h2>
                <p class="text-muted small mb-0">
                  Medios de cobro del local (PVS, efectivo, MP…). Todas las cuentas están en
                  Administración → Cuentas.
                </p>
              </div>
              <button mat-stroked-button type="button" (click)="openCreateAccount()">
                <mat-icon>add</mat-icon>
                Nueva cuenta
              </button>
            </div>
            <app-data-table
              [columns]="accountColumns"
              [rows]="accounts()"
              [sortable]="true"
              [canRemove]="canRemoveAccount"
              (edit)="openEditAccount($event)"
              (remove)="onRemoveAccount($event)"
            />
          </section>
        }

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

        @if (isSuperAdmin()) {
          <section class="panel-card shop-admin__danger">
            <h2 class="guy-section-title">Zona peligrosa</h2>
            <p class="text-muted small mb-3">
              Solo super admin. Conserva configuración y usuarios; vacía cierres, movimientos, POS,
              personal, nómina, <strong>cuentas</strong> y <strong>conceptos</strong> (sin recrear
              defaults).
            </p>
            <div class="shop-admin__danger-actions">
              <button mat-stroked-button type="button" [disabled]="backupBusy()" (click)="downloadBackup()">
                <mat-icon>download</mat-icon>
                Descargar backup
              </button>
              <input
                #backupFile
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                (change)="onRestoreFile($event)"
              />
              <button
                mat-stroked-button
                type="button"
                [disabled]="backupBusy()"
                (click)="backupFile.click()"
              >
                <mat-icon>upload_file</mat-icon>
                Cargar backup
              </button>
              <button mat-flat-button color="warn" type="button" [disabled]="backupBusy()" (click)="openBackupTools()">
                <mat-icon>delete_forever</mat-icon>
                Resetear…
              </button>
            </div>
          </section>
        }

        <div class="shop-admin__save-spacer" aria-hidden="true"></div>
      </div>

      <div class="shop-admin__save-bar" [style.--save-accent]="liveAccent()">
        <button
          mat-flat-button
          type="submit"
          class="shop-admin__save-btn"
          [disabled]="form.invalid || saving()"
        >
          <mat-icon>save</mat-icon>
          {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
        </button>
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
          color-mix(in srgb, var(--preview-accent, #2e7d32) 14%, var(--guy-card, #fff)),
          color-mix(in srgb, var(--preview-accent-secondary, #f9a825) 10%, var(--guy-card, #fff))
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
        color: var(--preview-accent-secondary, var(--guy-navy, #003366));
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
      .shop-admin__appearance {
        display: flex;
        flex-direction: column;
      }
      .shop-admin__logo-field {
        width: 100%;
        margin-bottom: 0.35rem;
      }
      .shop-admin__colors {
        display: flex;
        flex-direction: column;
        gap: 1.15rem;
        margin-top: 0.85rem;
      }
      .shop-admin__color-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.85rem;
        align-items: start;
      }
      .shop-admin__color-row > mat-form-field {
        width: 100%;
        min-width: 0;
      }
      .shop-admin__color-picker {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        min-height: 56px;
        padding-top: 0.35rem;
      }
      .shop-admin__color-label {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
        margin: 0;
        white-space: nowrap;
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
      @media (max-width: 560px) {
        .shop-admin__color-row {
          grid-template-columns: 1fr;
        }
        .shop-admin__color-picker {
          padding-top: 0;
          min-height: 0;
        }
      }
      .shop-admin__op-block {
        padding: 1rem 0 1.15rem;
        border-bottom: 1px solid var(--guy-border, #e4ebe6);
      }
      .shop-admin__op-block--last {
        border-bottom: 0;
        padding-bottom: 0;
      }
      .shop-admin__op-title {
        margin: 0 0 0.75rem;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }
      .shop-admin__op-note {
        margin: 0;
        align-self: start;
        padding: 0.85rem 1rem;
        border-radius: 12px;
        border: 1px dashed var(--guy-border, #d7e0d9);
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 55%, transparent);
        font-size: 0.85rem;
        line-height: 1.45;
        color: var(--guy-muted, #5f6f76);
      }
      .shop-admin__toggle-list {
        display: flex;
        flex-direction: column;
        margin-top: 0.35rem;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 12px;
        overflow: hidden;
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 55%, var(--guy-card, #fff));
      }
      .shop-admin__toggle-list .shop-admin__toggle {
        border: 0;
        border-radius: 0;
        background: transparent;
      }
      .shop-admin__toggle-list .shop-admin__toggle + .shop-admin__toggle {
        border-top: 1px solid var(--guy-border, #e4ebe6);
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
      .shop-admin__save-spacer {
        height: 5.25rem;
      }
      .shop-admin__save-bar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: calc(
          0.85rem + var(--guy-bottom-nav-height, 0px) + env(safe-area-inset-bottom, 0px)
        );
        z-index: 40;
        display: flex;
        justify-content: center;
        pointer-events: none;
        padding: 0 1rem;
      }
      .shop-admin__save-btn {
        pointer-events: auto;
        min-width: 12.5rem;
        height: 3rem !important;
        padding: 0 1.35rem !important;
        border-radius: 999px !important;
        font-weight: 700 !important;
        letter-spacing: 0.01em;
        color: #fff !important;
        background: var(--save-accent, var(--guy-primary, #1d65a0)) !important;
        box-shadow:
          0 10px 28px color-mix(in srgb, var(--save-accent, #1d65a0) 38%, transparent),
          0 2px 8px rgba(8, 20, 30, 0.16) !important;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          filter 0.15s ease;
      }
      .shop-admin__save-btn:not(:disabled):hover {
        filter: brightness(1.06);
        transform: translateY(-1px);
        box-shadow:
          0 14px 32px color-mix(in srgb, var(--save-accent, #1d65a0) 42%, transparent),
          0 4px 12px rgba(8, 20, 30, 0.18) !important;
      }
      .shop-admin__save-btn:not(:disabled):active {
        transform: translateY(1px);
        box-shadow:
          0 6px 16px color-mix(in srgb, var(--save-accent, #1d65a0) 30%, transparent),
          0 1px 4px rgba(8, 20, 30, 0.14) !important;
      }
      .shop-admin__save-btn:disabled {
        opacity: 0.55;
        box-shadow: 0 4px 12px rgba(8, 20, 30, 0.1) !important;
      }
      .shop-admin__save-btn mat-icon {
        margin-right: 0.35rem;
        font-size: 1.2rem;
        width: 1.2rem;
        height: 1.2rem;
      }
      .shop-admin__danger {
        border-color: color-mix(in srgb, #c62828 28%, var(--guy-border, #ddd));
      }
      .shop-admin__danger-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .shop-admin__posnets-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 0.85rem;
      }
      .shop-admin__posnets-head .guy-section-title {
        margin-bottom: 0.25rem;
      }
      .shop-admin__posnets {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .shop-admin__posnet-row {
        display: grid;
        grid-template-columns: 1.4fr 1fr auto;
        gap: 0.6rem;
        align-items: center;
      }
      .shop-admin__posnet-remove {
        color: #c62828;
      }
      @media (max-width: 640px) {
        .shop-admin__posnet-row {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 959px) {
        .shop-admin__preview {
          position: static;
        }
      }
      .shop-admin__weekdays {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .shop-admin__weekday-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .shop-admin__weekday {
        min-width: 2.75rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: #fff;
        border-radius: 999px;
        padding: 0.4rem 0.7rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
        cursor: pointer;
      }
      .shop-admin__weekday--on {
        background: color-mix(in srgb, var(--guy-navy, #003366) 12%, transparent);
        border-color: var(--guy-navy, #003366);
      }
      .shop-admin__deposits {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .shop-admin__deposit-row {
        display: grid;
        grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
        gap: 0.75rem;
        align-items: center;
      }
      .shop-admin__deposit-label {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
      }
      @media (max-width: 600px) {
        .shop-admin__deposit-row {
          grid-template-columns: 1fr;
          gap: 0.25rem;
        }
      }
    `,
  ],
})
export class AdminShopPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly api = inject(ClosingsApiService);
  private readonly backupApi = inject(ShopBackupApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly accountDelete = inject(AdminAccountDeleteService);
  readonly shops = inject(ShopContextService);

  readonly salesSystems = signal<SalesSystemOption[]>([]);
  readonly accounts = signal<AdminAccountRow[]>([]);
  readonly saving = signal(false);
  readonly depositSaving = signal(false);
  readonly backupBusy = signal(false);
  readonly posnetTypes = POSNET_TYPE_OPTIONS;
  readonly closingDepositFields = CLOSING_DEPOSIT_FIELDS;

  readonly depositForm = this.fb.nonNullable.group({
    card: this.fb.control<string | null>(null),
    mercadoPago: this.fb.control<string | null>(null),
    cash: this.fb.control<string | null>(null),
    accountDni: this.fb.control<string | null>(null),
    delivery: this.fb.control<string | null>(null),
    transfer: this.fb.control<string | null>(null),
    other: this.fb.control<string | null>(null),
  });

  readonly accountColumns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'code', label: 'Código' },
    {
      key: 'linkedPaymentMethod',
      label: 'Depósito',
      format: (r) => this.paymentMethodLabel(String(r['linkedPaymentMethod'] ?? '')),
    },
    {
      key: 'hideFromCashWithdraw',
      label: 'Retiro',
      format: (r) => (r['hideFromCashWithdraw'] ? 'Oculta' : 'Visible'),
    },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

  readonly canRemoveAccount = (row: AdminAccountRow) => row.type !== 'SYSTEM';

  paymentMethodLabel(value: string): string {
    if (!value) return '—';
    return LINKED_PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }

  isSuperAdmin(): boolean {
    return this.auth.isSuperAdmin();
  }

  canManageAccounts(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'accounts.manage');
  }

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    logoUrl: [''],
    accentColor: ['#2E7D32'],
    accentSecondary: ['#F9A825'],
    unitsLabel: [''],
    currency: ['ARS'],
    defaultChangeAmount: [0],
    openingTime: ['10:00'],
    productionDefaultHours: [8],
    closedWeekdays: this.fb.nonNullable.control<number[]>([]),
    coversEnabled: [false],
    reservationsEnabled: [true],
    waitingListEnabled: [true],
    active: [true],
    salesSystemId: this.fb.control<string | null>(null),
    posnets: this.fb.array([]),
  });

  readonly weekdayOptions = WEEKDAY_OPTIONS;

  get posnets(): FormArray {
    return this.form.get('posnets') as FormArray;
  }

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
  readonly liveAccentSecondary = computed(() => {
    const v = this.formValue()?.accentSecondary?.trim() || this.liveAccent();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : this.liveAccent();
  });
  readonly previewUrl = computed(
    () => normalizeLogoUrl(this.formValue()?.logoUrl ?? '') ?? '',
  );

  constructor() {
    usePageRefresh(() => this.reloadAccounts());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId || !this.canManageAccounts()) {
        this.accounts.set([]);
        return;
      }
      this.reloadAccounts();
    });
  }

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
      accentSecondary: shop.accentSecondary ?? '#F9A825',
      unitsLabel: shop.unitsLabel ?? '',
      currency: shop.currency ?? 'ARS',
      defaultChangeAmount: shop.defaultChangeAmount ?? 0,
      openingTime: shop.openingTime ?? '10:00',
      productionDefaultHours: shop.productionDefaultHours ?? 8,
      closedWeekdays: Array.isArray(shop.closedWeekdays) ? [...shop.closedWeekdays] : [],
      coversEnabled: !!shop.coversEnabled,
      reservationsEnabled: !!shop.reservationsEnabled,
      waitingListEnabled: !!shop.waitingListEnabled,
      active: shop.active ?? true,
      salesSystemId: shop.salesSystemId ?? null,
    });
    this.setPosnets(shop.posnets ?? []);
    this.http.get<any>(`${environment.apiUrl}/shops/${shopId}`).subscribe({
      next: (s) => {
        this.form.patchValue({
          salesSystemId: s.salesSystemId ?? null,
          name: s.name,
          slug: s.slug,
          logoUrl: s.logoUrl ?? '',
          accentColor: s.accentColor ?? '#2E7D32',
          accentSecondary: s.accentSecondary ?? '#F9A825',
          unitsLabel: s.unitsLabel ?? '',
          currency: s.currency ?? 'ARS',
          defaultChangeAmount: s.defaultChangeAmount ?? 0,
          openingTime: s.openingTime ?? '10:00',
          productionDefaultHours: s.productionDefaultHours ?? 8,
          closedWeekdays: Array.isArray(s.closedWeekdays) ? [...s.closedWeekdays] : [],
          coversEnabled: !!s.coversEnabled,
          reservationsEnabled: !!s.reservationsEnabled,
          waitingListEnabled: !!s.waitingListEnabled,
          active: !!s.active,
        });
        this.setPosnets(s.posnets ?? []);
        this.shops.upsertShop(s);
      },
    });
  }

  colorPickerValue(): string {
    return this.liveAccent();
  }

  colorSecondaryPickerValue(): string {
    return this.liveAccentSecondary();
  }

  onAccentPicker(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.form.controls.accentColor.setValue(value.toUpperCase());
  }

  onAccentSecondaryPicker(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.form.controls.accentSecondary.setValue(value.toUpperCase());
  }

  isClosedWeekday(day: number): boolean {
    return this.form.controls.closedWeekdays.value.includes(day);
  }

  toggleClosedWeekday(day: number): void {
    const cur = this.form.controls.closedWeekdays.value;
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
    this.form.controls.closedWeekdays.setValue(next.sort((a, b) => a - b));
  }

  addPosnet(): void {
    this.posnets.push(
      this.buildPosnetGroup({
        id: newId(),
        name: '',
        type: 'PVS',
      }),
    );
  }

  removePosnet(index: number): void {
    this.posnets.removeAt(index);
  }

  private setPosnets(rows: ShopPosnet[]): void {
    this.posnets.clear();
    for (const row of rows) {
      this.posnets.push(this.buildPosnetGroup(row));
    }
  }

  private buildPosnetGroup(value: ShopPosnet) {
    return this.fb.nonNullable.group({
      id: [value.id || newId()],
      name: [value.name, Validators.required],
      type: [value.type || 'PVS', Validators.required],
    });
  }

  reloadAccounts(after?: () => void): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManageAccounts()) return;
    this.http
      .get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`)
      .subscribe({
        next: (rows) => {
          const channels = rows.filter((r) => r.type === 'CHANNEL');
          this.accounts.set(channels);
          this.syncDepositForm(channels);
          after?.();
        },
        error: () => this.snack.open('No se pudieron cargar las cuentas', 'OK', { duration: 3000 }),
      });
  }

  private syncDepositForm(channels: AdminAccountRow[]): void {
    const next: Record<string, string | null> = {
      card: null,
      mercadoPago: null,
      cash: null,
      accountDni: null,
      delivery: null,
      transfer: null,
      other: null,
    };
    for (const a of channels) {
      const method = a.linkedPaymentMethod;
      if (method && method in next) {
        next[method] = a.id;
      }
    }
    this.depositForm.patchValue(next, { emitEvent: false });
  }

  savePaymentDeposits(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.depositForm.getRawValue();
    const used = Object.values(raw).filter((id): id is string => !!id);
    if (new Set(used).size !== used.length) {
      this.snack.open('Cada cuenta solo puede recibir un medio del cierre', 'OK', {
        duration: 3500,
      });
      return;
    }
    this.depositSaving.set(true);
    this.http
      .put<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts/payment-deposits`, raw)
      .subscribe({
        next: (rows) => {
          this.depositSaving.set(false);
          const channels = rows.filter((r) => r.type === 'CHANNEL');
          this.accounts.set(channels);
          this.syncDepositForm(channels);
          this.snack.open('Depósitos del cierre actualizados', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.depositSaving.set(false);
          const msg = err?.error?.message ?? 'No se pudieron guardar los depósitos';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  openCreateAccount(): void {
    this.openAccountDialog({ mode: 'create' });
  }

  openEditAccount(row: AdminAccountRow): void {
    this.openAccountDialog({ mode: 'edit', account: row });
  }

  async onRemoveAccount(row: AdminAccountRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const deleted = await this.accountDelete.remove(shopId, row);
    if (deleted) {
      this.reloadAccounts(() => this.scrollToChannelAccounts());
    }
  }

  private scrollToChannelAccounts(fallbackY?: number): void {
    const go = () => {
      const el = document.getElementById('shop-admin-channel-accounts');
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'auto' });
        return;
      }
      if (fallbackY != null) {
        window.scrollTo({ top: fallbackY, left: 0, behavior: 'auto' });
      }
    };
    requestAnimationFrame(() => {
      go();
      requestAnimationFrame(go);
    });
  }

  private openAccountDialog(
    mode: { mode: 'create' } | { mode: 'edit'; account: AdminAccountRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const scrollY = window.scrollY;
    this.dialogTitle
      .track(
        this.dialog.open(AdminAccountDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            ...mode,
            shopId,
            ...(mode.mode === 'create' ? { defaultType: 'CHANNEL' as const } : {}),
          },
        }),
        mode.mode === 'edit' ? 'Editar cuenta' : 'Nueva cuenta',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.reloadAccounts(() => this.scrollToChannelAccounts(scrollY));
        } else {
          this.scrollToChannelAccounts(scrollY);
        }
      });
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
        accentSecondary: raw.accentSecondary.trim() || null,
        unitsLabel: raw.unitsLabel.trim() || null,
        currency: raw.currency || 'ARS',
        defaultChangeAmount: raw.defaultChangeAmount,
        openingTime: raw.openingTime || '10:00',
        productionDefaultHours: raw.productionDefaultHours ?? 8,
        closedWeekdays: [...raw.closedWeekdays].sort((a, b) => a - b),
        coversEnabled: raw.coversEnabled,
        reservationsEnabled: raw.reservationsEnabled,
        waitingListEnabled: raw.waitingListEnabled,
        active: raw.active,
        salesSystemId: raw.salesSystemId || null,
        posnets: (raw.posnets as ShopPosnet[])
          .map((p) => ({
            id: p.id,
            name: String(p.name ?? '').trim(),
            type: p.type,
          }))
          .filter((p) => !!p.name),
      })
      .subscribe({
        next: (shop) => {
          const scrollY = window.scrollY;
          this.saving.set(false);
          if (shop.active === false) {
            this.shops.setShops(this.shops.shops().filter((s) => s.id !== shop.id));
          } else {
            this.shops.upsertShop(shop);
          }
          void this.auth.refreshMe().finally(() => {
            requestAnimationFrame(() => {
              window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' as ScrollBehavior });
            });
          });
          this.snack.open('Local actualizado', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  downloadBackup(): void {
    const shop = this.shops.selectedShop();
    if (!shop) return;
    this.backupBusy.set(true);
    this.backupApi.downloadBackup(shop.id).subscribe({
      next: (blob) => {
        this.backupBusy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-${shop.slug || 'local'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.snack.open('Backup descargado', 'OK', { duration: 2500 });
      },
      error: (err) => {
        this.backupBusy.set(false);
        const msg = err?.error?.message ?? 'No se pudo descargar el backup';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  onRestoreFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const shop = this.shops.selectedShop();
    if (!file || !shop) return;
    if (
      !window.confirm(
        `¿Restaurar backup en “${shop.name}”? Se borrarán los datos actuales del local.`,
      )
    ) {
      return;
    }
    this.backupBusy.set(true);
    this.backupApi.restoreBackup(shop.id, file).subscribe({
      next: () => {
        this.backupBusy.set(false);
        this.snack.open('Backup restaurado', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.backupBusy.set(false);
        const msg = err?.error?.message ?? 'No se pudo restaurar el backup';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  openBackupTools(): void {
    const shop = this.shops.selectedShop();
    if (!shop) return;
    this.dialogTitle
      .track(
        this.dialog.open(ShopBackupDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId: shop.id, shopName: shop.name, shopSlug: shop.slug },
        }),
        'Backup y reset',
      )
      .afterClosed()
      .subscribe();
  }
}
