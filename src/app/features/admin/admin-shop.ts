import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop, hasShopPermission, ShopPosnet } from '../../core/auth/auth.models';
import { normalizeLogoUrl, resolveShopLogoSrc, isUploadedShopLogoPath } from '../../core/utils/drive-url';
import { newId } from '../../core/utils/id';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import { ClosingsApiService, CLOSING_SOURCE_KIND_OPTIONS, closingSourceKindNeedsAccount, SalesSystemOption, ShopClosingSource } from '../closings/closings-api.service';
import { SettlementsInboxService } from '../settlements/settlements-inbox.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, startWith } from 'rxjs';
import { ShopBackupDialogComponent } from './shop-backup-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopBackupApiService } from './shop-backup-api.service';
import { AdminAccountDialogComponent, AdminAccountRow, LINKED_PAYMENT_METHOD_OPTIONS } from './admin-account-dialog';
import { AdminAccountDeleteService } from './admin-account-delete-dialog';
import { activeLabel } from '../../core/i18n/labels';
import {
  CONCEPT_CATEGORY_OPTIONS,
  DEFAULT_PAYMENT_CONCEPT_CATEGORIES,
  normalizePaymentConceptCategories,
} from '../../shared/concept-categories';
import { usePageRefresh } from '../../core/page-refresh.service';
import { takeInputFile } from '../../shared/utils/input-file';
import { normalizeLogoImageFile } from '../../shared/utils/normalize-logo-image';
import { ShopNavEditorComponent } from './shop-nav-editor';
import type { ShopNavConfig } from '../../core/layout/nav-config';

const POSNET_TYPE_OPTIONS = [
  { value: 'PVS', label: 'PVS' },
  { value: 'MERCADO_PAGO', label: 'Mercado Pago' },
  { value: 'CUENTA_DNI', label: 'Cuenta DNI' },
] as const;

const EMAIL_NOTIFICATION_TYPE_OPTIONS = [
  { value: 'PAYMENT_VALIDATE', label: 'Pagos · pendiente de validar' },
  { value: 'PAYMENT_PAY', label: 'Pagos · pendiente de abonar' },
  { value: 'PAYMENT_REJECTED', label: 'Pagos · rechazados' },
  { value: 'PAYMENT_PAID', label: 'Pagos · abonados' },
  { value: 'CLOSING_CREATED', label: 'Cierres creados' },
  { value: 'CASH_WITHDRAWAL_PICKED', label: 'Retiros de efectivo' },
  { value: 'PRODUCTION_HOURS_LOGGED', label: 'Horas de producción cargadas' },
  { value: 'STOCK_BELOW_MINIMUM', label: 'Stock alimentos · bajo el mínimo' },
  { value: 'STOCK_SHARED', label: 'Stock alimentos · compartido' },
  { value: 'BEVERAGE_STOCK_BELOW_MINIMUM', label: 'Stock bebidas · bajo el mínimo' },
  { value: 'BEVERAGE_STOCK_SHARED', label: 'Stock bebidas · compartido' },
  { value: 'SHORTAGE_CREATED', label: 'Faltantes · crítico cargado' },
  { value: 'SHORTAGE_LEVEL_LOW', label: 'Faltantes · bajó a crítico' },
  { value: 'SHORTAGE_RESOLVED', label: 'Faltantes · resuelto' },
  { value: 'RESERVATION_REQUEST', label: 'Reservas · solicitud nueva' },
  { value: 'MOVEMENT_CREATED', label: 'Movimientos y gastos rápidos' },
  { value: 'REIMBURSEMENT_CREATED', label: 'Reintegros · gasto de productor' },
] as const;

const ALL_EMAIL_NOTIFICATION_TYPES = EMAIL_NOTIFICATION_TYPE_OPTIONS.map((o) => o.value);

interface ShopUserOption {
  id: string;
  fullName: string;
  email: string;
  active?: boolean;
}

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

const TIMEZONE_OPTIONS = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { value: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
  { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { value: 'UTC', label: 'UTC' },
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
    MatCheckboxModule,
    MatSnackBarModule,
    MatIconModule,
    MatDialogModule,
    PageHeaderComponent,
    DataTableComponent,
    SelectSearchComponent,
    ShopNavEditorComponent,
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
        <nav class="guy-form-toc shop-admin__toc" aria-label="Secciones del local">
          @for (s of tocSections; track s.id) {
            <button type="button" class="guy-form-toc__chip" (click)="scrollToSection(s.id)">
              {{ s.label }}
            </button>
          }
        </nav>

        <section
          class="panel-card guy-form-section"
          id="shop-sec-identidad"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-identidad')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-identidad')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-identidad')"
          >
            <h2 class="guy-section-title">Identidad</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <p class="text-muted small mb-3">Nombre visible y URL interna del local.</p>
          <div class="guy-form-grid guy-form-grid--2">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="name" autocomplete="organization" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Slug</mat-label>
              <input matInput formControlName="slug" />
              <mat-hint>Solo minúsculas, números y guiones</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Email del local (Gmail)</mat-label>
              <input
                matInput
                type="email"
                formControlName="email"
                placeholder="local@gmail.com"
                autocomplete="email"
              />
              <mat-hint>Remitente y usuario SMTP de las notificaciones</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Instagram</mat-label>
              <span matPrefix class="shop-admin__ig-prefix">@</span>
              <input
                matInput
                formControlName="instagramHandle"
                placeholder="tuttopassa"
                autocomplete="off"
              />
              <mat-hint>Se muestra si el formulario público está cerrado</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Teléfono / WhatsApp</mat-label>
              <input
                matInput
                type="tel"
                formControlName="phone"
                placeholder="+598 99 123 456"
                autocomplete="tel"
              />
              <mat-hint>Con código de país. Lo usamos después para avisos por WhatsApp</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Contraseña de aplicación</mat-label>
              <input
                matInput
                type="password"
                formControlName="emailSmtpPassword"
                autocomplete="new-password"
                [placeholder]="emailSmtpConfigured() ? '•••••••• (dejar vacío para no cambiar)' : 'Contraseña de app de Gmail'"
              />
              <mat-hint>
                @if (emailSmtpConfigured()) {
                  Ya hay una contraseña guardada. Completá solo si querés cambiarla.
                } @else {
                  Gmail → verificación en 2 pasos → contraseña de aplicación
                }
              </mat-hint>
            </mat-form-field>
            @if (emailSmtpConfigured()) {
              <div class="shop-admin__smtp-actions">
                <button
                  mat-stroked-button
                  type="button"
                  (click)="markClearSmtpPassword()"
                >
                  <mat-icon>link_off</mat-icon>
                  Quitar contraseña SMTP
                </button>
              </div>
            }
          </div>
          </div>
        </section>

        <section
          class="panel-card guy-form-section"
          id="shop-sec-notificaciones"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-notificaciones')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-notificaciones')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-notificaciones')"
          >
            <h2 class="guy-section-title">Notificaciones por correo</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <p class="text-muted small mb-3">
            Activá el envío de mails, elegí qué avisos se mandan y a qué usuarios del local.
            Por defecto todos los tipos y todos los usuarios están chequeados.
          </p>

          <mat-slide-toggle formControlName="emailNotificationsEnabled" class="mb-3">
            Enviar notificaciones por correo
          </mat-slide-toggle>

          @if (form.controls.emailNotificationsEnabled.value) {
            <div class="shop-admin__email-grid">
              <div>
                <h3 class="shop-admin__op-title">Qué mails se envían</h3>
                <div class="shop-admin__check-list">
                  <button mat-stroked-button type="button" class="mb-2" (click)="toggleAllEmailTypes()">
                    {{ allEmailTypesSelected() ? 'Desmarcar todos' : 'Marcar todos' }}
                  </button>
                  @for (t of emailTypeOptions; track t.value) {
                    <mat-checkbox
                      [checked]="isEmailTypeSelected(t.value)"
                      (change)="toggleEmailType(t.value)"
                    >
                      {{ t.label }}
                    </mat-checkbox>
                  }
                </div>
              </div>
              <div>
                <h3 class="shop-admin__op-title">A quién</h3>
                <div class="shop-admin__check-list">
                  <button mat-stroked-button type="button" class="mb-2" (click)="toggleAllEmailUsers()">
                    {{ allEmailUsersSelected() ? 'Desmarcar todos' : 'Marcar todos' }}
                  </button>
                  @if (!shopUsers().length) {
                    <p class="text-muted small">No hay usuarios en este local.</p>
                  }
                  @for (u of shopUsers(); track u.id) {
                    <mat-checkbox
                      [checked]="isEmailUserSelected(u.id)"
                      (change)="toggleEmailUser(u.id)"
                    >
                      {{ u.fullName }}
                      <span class="text-muted small"> · {{ u.email }}</span>
                    </mat-checkbox>
                  }
                </div>
              </div>
            </div>
          }
          </div>
        </section>

        <section
          class="panel-card guy-form-section shop-admin__appearance"
          id="shop-sec-apariencia"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-apariencia')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-apariencia')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-apariencia')"
          >
            <h2 class="guy-section-title">Apariencia</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <p class="text-muted small mb-3">
            Logo y color del local en la app y en las PWAs de Reservas / Lista de espera.
          </p>

          <div class="shop-admin__logo-block">
            @if (uploadedLogoPath()) {
              <div class="shop-admin__logo-file">
                <mat-icon>image</mat-icon>
                <div>
                  <strong>Logo desde archivo</strong>
                  <p class="text-muted small mb-0">
                    Subido al servidor. Si pegás un link abajo, reemplaza este archivo al guardar.
                  </p>
                </div>
              </div>
            }
            <mat-form-field appearance="outline" class="shop-admin__logo-field" subscriptSizing="dynamic">
              <mat-label>URL del logo (opcional)</mat-label>
              <input
                matInput
                formControlName="logoUrl"
                placeholder="Pegá el vínculo de Drive o una URL directa"
              />
              <mat-hint>
                Usá <strong>una</strong> opción: subir archivo o pegar un link (Drive con “Cualquiera
                con el enlace”, o URL directa). No pongas rutas internas.
              </mat-hint>
            </mat-form-field>
            <div class="shop-admin__logo-actions">
              <input
                #logoFile
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/*"
                hidden
                (change)="onLogoFile($event)"
              />
              <button
                mat-stroked-button
                type="button"
                [disabled]="logoUploading() || !shops.selectedShopId()"
                (click)="logoFile.click()"
              >
                <mat-icon>upload</mat-icon>
                {{ logoUploading() ? 'Subiendo…' : 'Subir desde archivos' }}
              </button>
              @if (hasLogo()) {
                <button mat-stroked-button type="button" (click)="clearLogo()">
                  <mat-icon>hide_image</mat-icon>
                  Quitar logo
                </button>
              }
            </div>
          </div>

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
          </div>
        </section>

        <section
          class="panel-card guy-form-section"
          id="shop-sec-menu"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-menu')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-menu')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-menu')"
          >
            <h2 class="guy-section-title">Menú lateral</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <app-shop-nav-editor
            [value]="navConfigDraft()"
            (valueChange)="onNavConfigChange($event)"
          />
          </div>
        </section>

        <section
          class="panel-card guy-form-section"
          id="shop-sec-operacion"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-operacion')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-operacion')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-operacion')"
          >
            <h2 class="guy-section-title">Operación</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <p class="text-muted small mb-3">
            Caja, producción, POS y módulos del día a día.
          </p>

          <div
            class="shop-admin__op-block"
            [class.shop-admin__op-block--collapsed]="isSectionCollapsed('op-caja')"
          >
            <button
              type="button"
              class="shop-admin__op-toggle"
              (click)="toggleSection('op-caja')"
              [attr.aria-expanded]="!isSectionCollapsed('op-caja')"
            >
              <h3 class="shop-admin__op-title">Caja</h3>
              <mat-icon class="shop-admin__op-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="shop-admin__op-body">
            <div class="guy-form-grid guy-form-grid--2">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Etiqueta de unidades</mat-label>
                <input matInput formControlName="unitsLabel" placeholder="ej. paninos, tickets" />
                <mat-hint>Cómo se llaman las unidades vendidas</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Hora de apertura</mat-label>
                <input matInput type="time" formControlName="openingTime" />
                <mat-hint>El día del cierre corre hasta esta hora del día siguiente</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Zona horaria</mat-label>
                <mat-select formControlName="timezone">
                  @for (tz of timezoneOptions; track tz.value) {
                    <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
                  }
                </mat-select>
                <mat-hint>Día calendario de reservas y pantallas públicas</mat-hint>
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
          </div>

          <div
            class="shop-admin__op-block"
            [class.shop-admin__op-block--collapsed]="isSectionCollapsed('op-produccion')"
          >
            <button
              type="button"
              class="shop-admin__op-toggle"
              (click)="toggleSection('op-produccion')"
              [attr.aria-expanded]="!isSectionCollapsed('op-produccion')"
            >
              <h3 class="shop-admin__op-title">Producción</h3>
              <mat-icon class="shop-admin__op-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="shop-admin__op-body">
            <div class="guy-form-grid guy-form-grid--2">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
          </div>

          <div
            class="shop-admin__op-block"
            [class.shop-admin__op-block--collapsed]="isSectionCollapsed('op-servicio')"
          >
            <button
              type="button"
              class="shop-admin__op-toggle"
              (click)="toggleSection('op-servicio')"
              [attr.aria-expanded]="!isSectionCollapsed('op-servicio')"
            >
              <h3 class="shop-admin__op-title">Servicio</h3>
              <mat-icon class="shop-admin__op-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="shop-admin__op-body">
            <mat-slide-toggle formControlName="serviceAttendanceWithHours">
              Presentismo con horario
            </mat-slide-toggle>
            <p class="shop-admin__op-note">
              Apagado: solo presente / ausente / feriado, como antes. Encendido: cada persona
              tiene entrada y salida, y se calculan extras.
            </p>
            @if (form.controls.serviceAttendanceWithHours.value) {
              <div class="guy-form-grid guy-form-grid--2">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Hora de entrada default</mat-label>
                  <input matInput type="time" formControlName="serviceDefaultCheckIn" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Hora de retirada default</mat-label>
                  <input matInput type="time" formControlName="serviceDefaultCheckOut" />
                  <mat-hint>Se usa si el empleado no tiene horario propio. Extra = salida real menos retirada.</mat-hint>
                </mat-form-field>
              </div>
            }
            </div>
          </div>

          <div
            class="shop-admin__op-block"
            [class.shop-admin__op-block--collapsed]="isSectionCollapsed('op-ventas-pos')"
          >
            <button
              type="button"
              class="shop-admin__op-toggle"
              (click)="toggleSection('op-ventas-pos')"
              [attr.aria-expanded]="!isSectionCollapsed('op-ventas-pos')"
            >
              <h3 class="shop-admin__op-title">Ventas POS</h3>
              <mat-icon class="shop-admin__op-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="shop-admin__op-body">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
          </div>

          <div
            class="shop-admin__op-block"
            id="shop-sec-conceptos"
            formGroupName="paymentConceptCategories"
            [class.shop-admin__op-block--collapsed]="isSectionCollapsed('op-conceptos')"
          >
            <button
              type="button"
              class="shop-admin__op-toggle"
              (click)="toggleSection('op-conceptos')"
              [attr.aria-expanded]="!isSectionCollapsed('op-conceptos')"
            >
              <h3 class="shop-admin__op-title">Conceptos en pagos</h3>
              <mat-icon class="shop-admin__op-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="shop-admin__op-body">
            <p class="text-muted small mb-3">
              Qué categorías de concepto se listan al cargar cada tipo de pago. Un concepto puede
              tener varias categorías (Administración → Conceptos).
            </p>
            <div class="guy-form-grid guy-form-grid--2">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Pagos a proveedores</mat-label>
                <mat-select formControlName="supplier" multiple>
                  @for (opt of conceptCategoryOptions; track opt.value) {
                    <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Pagos a servicios</mat-label>
                <mat-select formControlName="service" multiple>
                  @for (opt of conceptCategoryOptions; track opt.value) {
                    <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                  }
                </mat-select>
                <mat-hint>Ej. Servicios y Proveedores</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Pagos a empleados</mat-label>
                <mat-select formControlName="employee" multiple>
                  @for (opt of conceptCategoryOptions; track opt.value) {
                    <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Movimientos</mat-label>
                <mat-select formControlName="movement" multiple>
                  @for (opt of conceptCategoryOptions; track opt.value) {
                    <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            </div>
          </div>

          <div
            class="shop-admin__op-block shop-admin__op-block--last"
            [class.shop-admin__op-block--collapsed]="isSectionCollapsed('op-modulos')"
          >
            <button
              type="button"
              class="shop-admin__op-toggle"
              (click)="toggleSection('op-modulos')"
              [attr.aria-expanded]="!isSectionCollapsed('op-modulos')"
            >
              <h3 class="shop-admin__op-title">Módulos públicos</h3>
              <mat-icon class="shop-admin__op-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="shop-admin__op-body">
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
                  <strong>Formulario público de reservas</strong>
                  <p class="text-muted small mb-0">
                    Link para que la gente pida mesa. Se puede apagar desde Reservas.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="reservationSignupEnabled"
                  aria-label="Formulario público de reservas"
                />
              </div>
              <div class="shop-admin__toggle">
                <div>
                  <strong>Sector adentro</strong>
                  <p class="text-muted small mb-0">
                    Pedidos de mesa en el salón.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="reservationInsideEnabled"
                  aria-label="Sector adentro"
                />
              </div>
              <div class="shop-admin__toggle">
                <div>
                  <strong>Sector afuera</strong>
                  <p class="text-muted small mb-0">
                    Pedidos de mesa en la vereda / patio.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="reservationOutsideEnabled"
                  aria-label="Sector afuera"
                />
              </div>
              <div class="shop-admin__party-rules">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Adentro hasta</mat-label>
                  <input
                    matInput
                    type="number"
                    min="1"
                    max="99"
                    inputmode="numeric"
                    formControlName="reservationInsideMaxPartySize"
                    placeholder="Ilimitado"
                  />
                  <mat-hint>Vacío = sin tope de personas adentro</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Afuera hasta</mat-label>
                  <input
                    matInput
                    type="number"
                    min="1"
                    max="99"
                    inputmode="numeric"
                    formControlName="reservationOutsideMinPartySize"
                    placeholder="Ilimitado"
                  />
                  <mat-hint>Vacío = sin tope de personas afuera</mat-hint>
                </mat-form-field>
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
              <div class="shop-admin__toggle">
                <div>
                  <strong>Propinas</strong>
                  <p class="text-muted small mb-0">
                    Caja diaria de propinas y reparto por empleado.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="tipsEnabled"
                  aria-label="Propinas habilitadas"
                />
              </div>
              <div class="shop-admin__toggle">
                <div>
                  <strong>Presentismo público</strong>
                  <p class="text-muted small mb-0">
                    El personal entra con el link y ve su mes, sin usuario de la app.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="publicAttendanceEnabled"
                  aria-label="Presentismo público"
                />
              </div>
              <div class="shop-admin__toggle">
                <div>
                  <strong>Normas públicas</strong>
                  <p class="text-muted small mb-0">
                    Página para imprimir y pegar las normas pre y post servicio.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="publicServiceRulesEnabled"
                  aria-label="Normas de servicio públicas"
                />
              </div>
              <div class="shop-admin__toggle">
                <div>
                  <strong>Carta pública</strong>
                  <p class="text-muted small mb-0">
                    Página con las cartas del local (menú, vinos, etc.). Se cargan en Administración → Carta.
                  </p>
                </div>
                <mat-slide-toggle
                  formControlName="menuEnabled"
                  aria-label="Carta pública"
                />
              </div>
            </div>
            </div>
          </div>
          </div>
        </section>

        <section
          class="panel-card guy-form-section"
          id="shop-sec-francos"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-francos')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-francos')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-francos')"
          >
            <h2 class="guy-section-title">Días de franco</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
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
          </div>
        </section>

        <section
          class="panel-card guy-form-section"
          id="shop-sec-posnets"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-posnets')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-posnets')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-posnets')"
          >
            <h2 class="guy-section-title">Posnets</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <div class="shop-admin__posnets-head">
            <p class="text-muted small mb-0">
              Terminales del local (PVS / Mercado Pago). Cuenta DNI se carga por transferencias en el
              cierre; el tipo Cuenta DNI queda disponible por si lo necesitás.
            </p>
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
              <p class="text-muted small mb-0">
                Sin posnets. En el cierre, PVS y Mercado Pago se cargan a mano; Cuenta DNI por
                transferencias.
              </p>
            }
          </div>
          </div>
        </section>

        <section
          class="panel-card guy-form-section"
          id="shop-sec-closing-sources"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-closing-sources')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-closing-sources')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-closing-sources')"
          >
            <h2 class="guy-section-title">Cuentas aparte</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <div class="shop-admin__posnets-head">
            <p class="text-muted small mb-0">
              Pedidos Ya, delivery propio u otras fuentes que no deben entrar al total declarado.
              Podés tener ninguna, una o varias. Si rinden después o tienen cuenta propia, se
              suman aparte en el cierre del día.
            </p>
            <div class="shop-admin__source-actions">
              <button mat-stroked-button type="button" (click)="addClosingSource()">
                <mat-icon>add</mat-icon>
                Agregar fuente
              </button>
              <button
                mat-stroked-button
                type="button"
                [disabled]="sourceSaving()"
                (click)="saveClosingSources()"
              >
                <mat-icon>save</mat-icon>
                {{ sourceSaving() ? 'Guardando…' : 'Guardar fuentes' }}
              </button>
            </div>
          </div>
          <div class="shop-admin__sources" formArrayName="closingSources">
            @for (row of closingSources.controls; track row; let i = $index) {
              <div class="shop-admin__source-row" [formGroupName]="i">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Nombre</mat-label>
                  <input matInput formControlName="name" placeholder="ej. Pedidos Ya" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Qué hacer con el monto</mat-label>
                  <mat-select formControlName="kind" (selectionChange)="onClosingSourceKindChange(i)">
                    @for (opt of closingSourceKinds; track opt.value) {
                      <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                @if (sourceNeedsAccount(i)) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Cuenta destino</mat-label>
                    <mat-select
                      formControlName="accountId"
                      panelClass="guy-select-search-panel"
                      (openedChange)="onSelectSearchOpened($event, accountSearchQuery)"
                    >
                      <mat-option disabled class="select-search-opt">
                        <app-select-search [(query)]="accountSearchQuery" placeholder="Buscar cuenta…" />
                      </mat-option>
                      <mat-option [value]="null">Elegí una cuenta</mat-option>
                      @for (a of filteredSourceAccounts(row.get('accountId')?.value); track a.id) {
                        <mat-option [value]="a.id">{{ a.name }}</mat-option>
                      }
                      @if (accountSearchQuery() && !filteredSourceAccounts(row.get('accountId')?.value).length) {
                        <mat-option disabled>Sin resultados</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                } @else {
                  <span class="shop-admin__source-spacer" aria-hidden="true"></span>
                }
                <mat-checkbox formControlName="includeInDeclared">Suma al declarado</mat-checkbox>
                <button
                  mat-icon-button
                  type="button"
                  class="shop-admin__posnet-remove"
                  aria-label="Quitar fuente"
                  (click)="removeClosingSource(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            } @empty {
              <p class="text-muted small mb-0">
                Sin fuentes extra. El cierre usa solo PVS, efectivo, MP, DNI, delivery y
                transferencia.
              </p>
            }
          </div>
          </div>
        </section>

        @if (canManageAccounts()) {
          <section
            class="panel-card guy-form-section"
            id="shop-admin-closing-deposits"
            [class.guy-form-section--collapsed]="isSectionCollapsed('shop-admin-closing-deposits')"
          >
            <button
              type="button"
              class="guy-section-toggle"
              (click)="toggleSection('shop-admin-closing-deposits')"
              [attr.aria-expanded]="!isSectionCollapsed('shop-admin-closing-deposits')"
            >
              <h2 class="guy-section-title">Depósito del cierre</h2>
              <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="guy-form-section__body">
            <div class="shop-admin__posnets-head">
              <p class="text-muted small mb-0">
                A qué cuenta canal va cada campo del cierre (PVS, Mercado Pago, efectivo…).
              </p>
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
                    <mat-select
                      [formControlName]="field.value"
                      panelClass="guy-select-search-panel"
                      (openedChange)="onSelectSearchOpened($event, accountSearchQuery)"
                    >
                      <mat-option disabled class="select-search-opt">
                        <app-select-search [(query)]="accountSearchQuery" placeholder="Buscar cuenta…" />
                      </mat-option>
                      <mat-option [value]="null">Sin vincular</mat-option>
                      @for (a of filteredDepositAccounts(depositForm.get(field.value)?.value); track a.id) {
                        <mat-option [value]="a.id">{{ a.name }}</mat-option>
                      }
                      @if (accountSearchQuery() && !filteredDepositAccounts(depositForm.get(field.value)?.value).length) {
                        <mat-option disabled>Sin resultados</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </div>
              }
            </div>
            </div>
          </section>

          <section
            class="panel-card guy-form-section"
            id="shop-admin-channel-accounts"
            [class.guy-form-section--collapsed]="isSectionCollapsed('shop-admin-channel-accounts')"
          >
            <button
              type="button"
              class="guy-section-toggle"
              (click)="toggleSection('shop-admin-channel-accounts')"
              [attr.aria-expanded]="!isSectionCollapsed('shop-admin-channel-accounts')"
            >
              <h2 class="guy-section-title">Cuentas canal</h2>
              <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="guy-form-section__body">
            <div class="shop-admin__posnets-head">
              <p class="text-muted small mb-0">
                Medios de cobro del local (PVS, efectivo, MP…). Todas las cuentas están en
                Administración → Cuentas.
              </p>
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
            </div>
          </section>
        }

        <section
          class="panel-card guy-form-section"
          id="shop-sec-estado"
          [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-estado')"
        >
          <button
            type="button"
            class="guy-section-toggle"
            (click)="toggleSection('shop-sec-estado')"
            [attr.aria-expanded]="!isSectionCollapsed('shop-sec-estado')"
          >
            <h2 class="guy-section-title">Estado</h2>
            <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
          </button>
          <div class="guy-form-section__body">
          <div class="shop-admin__toggle">
            <div>
              <strong>Local habilitado</strong>
              <p class="text-muted small mb-0">
                Si está deshabilitado no aparece en el selector de locales.
              </p>
            </div>
            <mat-slide-toggle formControlName="active" aria-label="Local habilitado" />
          </div>
          </div>
        </section>

        @if (isSuperAdmin()) {
          <section
            class="panel-card guy-form-section shop-admin__danger"
            id="shop-sec-peligro"
            [class.guy-form-section--collapsed]="isSectionCollapsed('shop-sec-peligro')"
          >
            <button
              type="button"
              class="guy-section-toggle"
              (click)="toggleSection('shop-sec-peligro')"
              [attr.aria-expanded]="!isSectionCollapsed('shop-sec-peligro')"
            >
              <h2 class="guy-section-title">Zona peligrosa</h2>
              <mat-icon class="guy-section-toggle__chevron" aria-hidden="true">expand_more</mat-icon>
            </button>
            <div class="guy-form-section__body">
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
            </div>
          </section>
        }

        <div class="shop-admin__save-spacer guy-form-save-spacer" aria-hidden="true"></div>
      </div>

      <div class="shop-admin__save-bar guy-form-save-bar" [style.--save-accent]="liveAccent()">
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
      .shop-admin__fields > .guy-form-toc {
        /* sticks under page chrome while scrolling sections */
        top: 0.15rem;
      }
      .shop-admin__fields .panel-card {
        scroll-margin-top: 4.25rem;
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
      .shop-admin__logo-block {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        margin-bottom: 0.35rem;
      }
      .shop-admin__logo-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .shop-admin__logo-file {
        display: flex;
        gap: 0.65rem;
        align-items: flex-start;
        padding: 0.7rem 0.85rem;
        border-radius: 10px;
        border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 30%, var(--guy-border, #ddd));
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, transparent);
      }
      .shop-admin__logo-file mat-icon {
        color: var(--guy-accent, #2e7d32);
        flex-shrink: 0;
      }
      .shop-admin__logo-file strong {
        display: block;
        font-size: 0.9rem;
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
      .shop-admin__party-rules {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        gap: 0.85rem 1rem;
        padding: 0.85rem 1rem 1rem;
        border-top: 1px solid var(--guy-border, #e4ebe6);
      }
      .shop-admin__party-rules mat-form-field {
        width: 100%;
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
      .guy-section-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        width: 100%;
        margin: 0 0 0.85rem;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        text-align: left;
        color: inherit;
      }
      .guy-section-toggle .guy-section-title {
        margin: 0;
      }
      .guy-section-toggle__chevron {
        flex-shrink: 0;
        transition: transform 0.22s ease;
        color: var(--guy-muted, #666);
      }
      .guy-form-section--collapsed .guy-section-toggle {
        margin-bottom: 0;
      }
      .guy-form-section--collapsed .guy-section-toggle__chevron {
        transform: rotate(-90deg);
      }
      .guy-form-section__body {
        overflow: hidden;
        max-height: 8000px;
        opacity: 1;
        transform: translateY(0);
        transition:
          max-height 0.35s ease,
          opacity 0.22s ease,
          transform 0.22s ease;
      }
      .guy-form-section--collapsed .guy-form-section__body {
        max-height: 0;
        opacity: 0;
        transform: translateY(-0.35rem);
        pointer-events: none;
      }
      .shop-admin__op-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        width: 100%;
        margin: 0 0 0.65rem;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        text-align: left;
        color: inherit;
      }
      .shop-admin__op-toggle .shop-admin__op-title {
        margin: 0;
      }
      .shop-admin__op-toggle__chevron {
        flex-shrink: 0;
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
        transition: transform 0.22s ease;
        color: var(--guy-muted, #666);
      }
      .shop-admin__op-block--collapsed .shop-admin__op-toggle {
        margin-bottom: 0;
      }
      .shop-admin__op-block--collapsed .shop-admin__op-toggle__chevron {
        transform: rotate(-90deg);
      }
      .shop-admin__op-body {
        overflow: hidden;
        max-height: 4000px;
        opacity: 1;
        transform: translateY(0);
        transition:
          max-height 0.3s ease,
          opacity 0.2s ease,
          transform 0.2s ease;
      }
      .shop-admin__op-block--collapsed .shop-admin__op-body {
        max-height: 0;
        opacity: 0;
        transform: translateY(-0.25rem);
        pointer-events: none;
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
      .shop-admin__source-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .shop-admin__sources {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .shop-admin__source-row {
        display: grid;
        grid-template-columns: 1.2fr 1.6fr minmax(10rem, 1.2fr) auto auto;
        gap: 0.6rem;
        align-items: center;
      }
      .shop-admin__source-spacer {
        display: block;
      }
      @media (max-width: 960px) {
        .shop-admin__source-row {
          grid-template-columns: 1fr;
        }
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
      @media (max-width: 960px) {
        .shop-admin__preview {
          /* compact preview on mobile so form starts sooner */
          padding: 0.85rem;
        }
      }
      .shop-admin__weekdays {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .shop-admin__email-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.25rem;
      }
      .shop-admin__smtp-actions {
        margin-top: 0.15rem;
      }
      .shop-admin__ig-prefix {
        margin-right: 0.15rem;
        font-weight: 700;
        opacity: 0.7;
      }
      @media (max-width: 800px) {
        .shop-admin__email-grid {
          grid-template-columns: 1fr;
        }
      }
      .shop-admin__check-list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
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
  private readonly settlementsInbox = inject(SettlementsInboxService);
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
  readonly allLedgerAccounts = signal<AdminAccountRow[]>([]);
  readonly shopUsers = signal<ShopUserOption[]>([]);
  readonly saving = signal(false);
  readonly depositSaving = signal(false);
  readonly sourceSaving = signal(false);
  readonly backupBusy = signal(false);
  readonly logoUploading = signal(false);
  readonly logoCacheBust = signal(Date.now());
  /** Path relativo del logo subido (`shops/{id}/logo.png`); no se muestra en el input de URL. */
  readonly uploadedLogoPath = signal<string | null>(null);
  readonly posnetTypes = POSNET_TYPE_OPTIONS;
  readonly emailTypeOptions = EMAIL_NOTIFICATION_TYPE_OPTIONS;
  readonly emailSmtpConfigured = signal(false);
  readonly clearSmtpPasswordOnSave = signal(false);
  readonly navConfigDraft = signal<ShopNavConfig | null>(null);
  readonly closingDepositFields = CLOSING_DEPOSIT_FIELDS;
  readonly closingSourceKinds = CLOSING_SOURCE_KIND_OPTIONS;
  private removedClosingSourceIds: string[] = [];

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

  private toPartyRule(raw: number | string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(99, n);
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
    email: [''],
    instagramHandle: [''],
    phone: [''],
    emailSmtpPassword: [''],
    emailNotificationsEnabled: [true],
    emailNotificationTypes: this.fb.nonNullable.control<string[]>([...ALL_EMAIL_NOTIFICATION_TYPES]),
    emailNotificationUserIds: this.fb.nonNullable.control<string[]>([]),
    logoUrl: [''],
    accentColor: ['#2E7D32'],
    accentSecondary: ['#F9A825'],
    unitsLabel: [''],
    currency: ['ARS'],
    defaultChangeAmount: [0],
    openingTime: ['10:00'],
    timezone: ['America/Argentina/Buenos_Aires'],
    productionDefaultHours: [8],
    serviceDefaultCheckIn: ['18:00'],
    serviceDefaultCheckOut: ['00:00'],
    serviceAttendanceWithHours: [true],
    closedWeekdays: this.fb.nonNullable.control<number[]>([]),
    coversEnabled: [false],
    reservationsEnabled: [true],
    reservationSignupEnabled: [true],
    reservationInsideEnabled: [true],
    reservationOutsideEnabled: [true],
    reservationInsideMaxPartySize: this.fb.control<number | null>(null),
    reservationOutsideMinPartySize: this.fb.control<number | null>(null),
    waitingListEnabled: [true],
    tipsEnabled: [false],
    publicAttendanceEnabled: [false],
    publicServiceRulesEnabled: [false],
    menuEnabled: [false],
    active: [true],
    salesSystemId: this.fb.control<string | null>(null),
    paymentConceptCategories: this.fb.nonNullable.group({
      supplier: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.supplier,
      ]),
      service: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.service,
      ]),
      employee: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.employee,
      ]),
      movement: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.movement,
      ]),
    }),
    posnets: this.fb.array([]),
    closingSources: this.fb.array([]),
  });

  readonly weekdayOptions = WEEKDAY_OPTIONS;
  readonly timezoneOptions = TIMEZONE_OPTIONS;
  readonly conceptCategoryOptions = CONCEPT_CATEGORY_OPTIONS;

  readonly tocSections = [
    { id: 'shop-sec-identidad', label: 'Identidad' },
    { id: 'shop-sec-notificaciones', label: 'Mails' },
    { id: 'shop-sec-apariencia', label: 'Apariencia' },
    { id: 'shop-sec-menu', label: 'Menú' },
    { id: 'shop-sec-operacion', label: 'Operación' },
    { id: 'shop-sec-conceptos', label: 'Conceptos' },
    { id: 'shop-sec-francos', label: 'Francos' },
    { id: 'shop-sec-posnets', label: 'Posnets' },
    { id: 'shop-sec-closing-sources', label: 'Cuentas aparte' },
    { id: 'shop-admin-closing-deposits', label: 'Depósitos' },
    { id: 'shop-admin-channel-accounts', label: 'Cuentas' },
    { id: 'shop-sec-estado', label: 'Estado' },
  ] as const;

  scrollToSection(id: string): void {
    this.collapsedSections.update((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Conceptos vive dentro de Operación.
    if (id === 'shop-sec-conceptos') {
      this.collapsedSections.update((prev) => {
        if (!prev.has('shop-sec-operacion') && !prev.has('op-conceptos')) return prev;
        const next = new Set(prev);
        next.delete('shop-sec-operacion');
        next.delete('op-conceptos');
        return next;
      });
    }
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  readonly collapsedSections = signal<ReadonlySet<string>>(new Set());

  isSectionCollapsed(id: string): boolean {
    return this.collapsedSections().has(id);
  }

  toggleSection(id: string): void {
    this.collapsedSections.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  get posnets(): FormArray {
    return this.form.get('posnets') as FormArray;
  }

  get closingSources(): FormArray {
    return this.form.get('closingSources') as FormArray;
  }

  readonly sourceAccountOptions = computed(() =>
    this.allLedgerAccounts().filter((a) => a.active && a.type !== 'SYSTEM'),
  );

  readonly accountSearchQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;

  filteredSourceAccounts(keepId?: string | null) {
    return filterBySelectQuery(
      this.sourceAccountOptions(),
      this.accountSearchQuery(),
      (a) => a.name,
      keepId,
    );
  }

  filteredDepositAccounts(keepId?: string | null) {
    return filterBySelectQuery(this.accounts(), this.accountSearchQuery(), (a) => a.name, keepId);
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
  readonly hasLogo = computed(
    () => !!(this.uploadedLogoPath() || (this.formValue()?.logoUrl ?? '').trim()),
  );

  readonly previewUrl = computed(() => {
    const raw = this.effectiveLogoRaw();
    return (
      resolveShopLogoSrc(raw, this.shops.selectedShopId(), this.logoCacheBust()) ||
      normalizeLogoUrl(raw) ||
      ''
    );
  });

  /** Link pegado gana sobre archivo subido; si no hay link, usa el path subido. */
  private effectiveLogoRaw(): string {
    const link = (this.formValue()?.logoUrl ?? '').trim();
    if (link && !isUploadedShopLogoPath(link)) return link;
    return this.uploadedLogoPath() ?? '';
  }

  private applyLogoFromShop(logoUrl?: string | null): void {
    const raw = (logoUrl ?? '').trim();
    if (isUploadedShopLogoPath(raw)) {
      this.uploadedLogoPath.set(raw);
      this.form.patchValue({ logoUrl: '' });
    } else {
      this.uploadedLogoPath.set(null);
      this.form.patchValue({ logoUrl: raw });
    }
    this.logoCacheBust.set(Date.now());
  }

  constructor() {
    usePageRefresh(() => this.reloadAccounts());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.accounts.set([]);
        this.allLedgerAccounts.set([]);
        this.closingSources.clear();
        return;
      }
      if (!this.canManageAccounts()) {
        this.accounts.set([]);
        this.allLedgerAccounts.set([]);
      } else {
        this.reloadAccounts();
      }
      this.reloadClosingSources();
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
      email: shop.email ?? '',
      instagramHandle: shop.instagramHandle ?? '',
      phone: shop.phone ?? '',
      emailSmtpPassword: '',
      emailNotificationsEnabled: shop.emailNotificationsEnabled !== false,
      accentColor: shop.accentColor ?? '#2E7D32',
      accentSecondary: shop.accentSecondary ?? '#F9A825',
      unitsLabel: shop.unitsLabel ?? '',
      currency: shop.currency ?? 'ARS',
      defaultChangeAmount: shop.defaultChangeAmount ?? 0,
      openingTime: shop.openingTime ?? '10:00',
      timezone: shop.timezone ?? 'America/Argentina/Buenos_Aires',
      productionDefaultHours: shop.productionDefaultHours ?? 8,
      serviceDefaultCheckIn: shop.serviceDefaultCheckIn || '18:00',
      serviceDefaultCheckOut: shop.serviceDefaultCheckOut || '00:00',
      serviceAttendanceWithHours: shop.serviceAttendanceWithHours !== false,
      closedWeekdays: Array.isArray(shop.closedWeekdays) ? [...shop.closedWeekdays] : [],
      coversEnabled: !!shop.coversEnabled,
      reservationsEnabled: !!shop.reservationsEnabled,
      reservationSignupEnabled: shop.reservationSignupEnabled !== false,
      reservationInsideEnabled: shop.reservationInsideEnabled !== false,
      reservationOutsideEnabled: shop.reservationOutsideEnabled !== false,
      reservationInsideMaxPartySize: shop.reservationInsideMaxPartySize ?? null,
      reservationOutsideMinPartySize: shop.reservationOutsideMinPartySize ?? null,
      waitingListEnabled: !!shop.waitingListEnabled,
      tipsEnabled: !!shop.tipsEnabled,
      publicAttendanceEnabled: !!shop.publicAttendanceEnabled,
      publicServiceRulesEnabled: !!shop.publicServiceRulesEnabled,
      menuEnabled: !!shop.menuEnabled,
      active: shop.active ?? true,
      salesSystemId: shop.salesSystemId ?? null,
    });
    this.applyPaymentConceptCategories(shop.paymentConceptCategories);
    this.navConfigDraft.set(shop.navConfig ?? null);
    this.applyLogoFromShop(shop.logoUrl);
    this.applyEmailLists(shop.emailNotificationTypes, shop.emailNotificationUserIds);
    this.setPosnets(shop.posnets ?? []);
    this.emailSmtpConfigured.set(!!shop.emailSmtpConfigured);
    this.clearSmtpPasswordOnSave.set(false);
    if (shopId) {
      this.loadShopUsers(shopId, shop.emailNotificationUserIds ?? null);
      this.http.get<any>(`${environment.apiUrl}/shops/${shopId}`).subscribe({
        next: (s) => {
          this.form.patchValue({
            salesSystemId: s.salesSystemId ?? null,
            name: s.name,
            slug: s.slug,
            email: s.email ?? '',
            instagramHandle: s.instagramHandle ?? '',
            phone: s.phone ?? '',
            emailSmtpPassword: '',
            emailNotificationsEnabled: s.emailNotificationsEnabled !== false,
            accentColor: s.accentColor ?? '#2E7D32',
            accentSecondary: s.accentSecondary ?? '#F9A825',
            unitsLabel: s.unitsLabel ?? '',
            currency: s.currency ?? 'ARS',
            defaultChangeAmount: s.defaultChangeAmount ?? 0,
            openingTime: s.openingTime ?? '10:00',
            timezone: s.timezone ?? 'America/Argentina/Buenos_Aires',
            productionDefaultHours: s.productionDefaultHours ?? 8,
            closedWeekdays: Array.isArray(s.closedWeekdays) ? [...s.closedWeekdays] : [],
            coversEnabled: !!s.coversEnabled,
            reservationsEnabled: !!s.reservationsEnabled,
            reservationSignupEnabled: s.reservationSignupEnabled !== false,
            reservationInsideEnabled: s.reservationInsideEnabled !== false,
            reservationOutsideEnabled: s.reservationOutsideEnabled !== false,
            reservationInsideMaxPartySize: s.reservationInsideMaxPartySize ?? null,
            reservationOutsideMinPartySize: s.reservationOutsideMinPartySize ?? null,
            waitingListEnabled: !!s.waitingListEnabled,
            tipsEnabled: !!s.tipsEnabled,
            publicAttendanceEnabled: !!s.publicAttendanceEnabled,
            publicServiceRulesEnabled: !!s.publicServiceRulesEnabled,
            serviceDefaultCheckIn: s.serviceDefaultCheckIn || '18:00',
            serviceDefaultCheckOut: s.serviceDefaultCheckOut || '00:00',
            serviceAttendanceWithHours: s.serviceAttendanceWithHours !== false,
            menuEnabled: !!s.menuEnabled,
            active: !!s.active,
          });
          this.applyLogoFromShop(s.logoUrl);
          this.emailSmtpConfigured.set(!!s.emailSmtpConfigured);
          this.clearSmtpPasswordOnSave.set(false);
          this.applyEmailLists(s.emailNotificationTypes, s.emailNotificationUserIds);
          this.setPosnets(s.posnets ?? []);
          this.applyPaymentConceptCategories(s.paymentConceptCategories);
          this.navConfigDraft.set(s.navConfig ?? null);
          this.shops.upsertShop(s);
          this.loadShopUsers(shopId, s.emailNotificationUserIds ?? null);
        },
      });
    }
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

  private applyEmailLists(
    types: string[] | null | undefined,
    userIds: string[] | null | undefined,
  ): void {
    this.form.controls.emailNotificationTypes.setValue(
      Array.isArray(types)
        ? types.filter((t) =>
            ALL_EMAIL_NOTIFICATION_TYPES.includes(
              t as (typeof ALL_EMAIL_NOTIFICATION_TYPES)[number],
            ),
          )
        : [...ALL_EMAIL_NOTIFICATION_TYPES],
    );
    if (Array.isArray(userIds)) {
      this.form.controls.emailNotificationUserIds.setValue([...userIds]);
    }
  }

  private loadShopUsers(shopId: string, savedUserIds: string[] | null): void {
    this.http.get<ShopUserOption[]>(`${environment.apiUrl}/users`, { params: { shopId } }).subscribe({
      next: (users) => {
        const active = (users ?? []).filter((u) => u.active !== false);
        this.shopUsers.set(active);
        // null = todos chequeados por defecto; [] = ninguno
        if (savedUserIds === null || savedUserIds === undefined) {
          this.form.controls.emailNotificationUserIds.setValue(active.map((u) => u.id));
        } else {
          const ids = new Set(active.map((u) => u.id));
          this.form.controls.emailNotificationUserIds.setValue(
            savedUserIds.filter((id) => ids.has(id)),
          );
        }
      },
      error: () => this.shopUsers.set([]),
    });
  }

  isEmailTypeSelected(type: string): boolean {
    return this.form.controls.emailNotificationTypes.value.includes(type);
  }

  toggleEmailType(type: string): void {
    const cur = this.form.controls.emailNotificationTypes.value;
    const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
    this.form.controls.emailNotificationTypes.setValue(next);
  }

  allEmailTypesSelected(): boolean {
    return ALL_EMAIL_NOTIFICATION_TYPES.every((t) =>
      this.form.controls.emailNotificationTypes.value.includes(t),
    );
  }

  toggleAllEmailTypes(): void {
    this.form.controls.emailNotificationTypes.setValue(
      this.allEmailTypesSelected() ? [] : [...ALL_EMAIL_NOTIFICATION_TYPES],
    );
  }

  isEmailUserSelected(userId: string): boolean {
    return this.form.controls.emailNotificationUserIds.value.includes(userId);
  }

  toggleEmailUser(userId: string): void {
    const cur = this.form.controls.emailNotificationUserIds.value;
    const next = cur.includes(userId) ? cur.filter((id) => id !== userId) : [...cur, userId];
    this.form.controls.emailNotificationUserIds.setValue(next);
  }

  allEmailUsersSelected(): boolean {
    const users = this.shopUsers();
    if (!users.length) return true;
    return users.every((u) => this.form.controls.emailNotificationUserIds.value.includes(u.id));
  }

  toggleAllEmailUsers(): void {
    this.form.controls.emailNotificationUserIds.setValue(
      this.allEmailUsersSelected() ? [] : this.shopUsers().map((u) => u.id),
    );
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

  private applyPaymentConceptCategories(raw?: unknown): void {
    const next = normalizePaymentConceptCategories(raw);
    this.form.controls.paymentConceptCategories.patchValue(next, { emitEvent: false });
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

  reloadClosingSources(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.listClosingSources(shopId).subscribe({
      next: (rows) => this.setClosingSources(rows),
      error: () => {
        this.setClosingSources([]);
        this.snack.open('No se pudieron cargar las fuentes extra', 'OK', { duration: 3000 });
      },
    });
  }

  addClosingSource(): void {
    this.closingSources.push(
      this.buildClosingSourceGroup({
        id: '',
        shopId: this.shops.selectedShopId() ?? '',
        name: '',
        includeInDeclared: false,
        kind: 'RECORD_ONLY',
        accountId: null,
        sortOrder: this.closingSources.length + 1,
        active: true,
      }),
    );
  }

  removeClosingSource(index: number): void {
    const id = String(this.closingSources.at(index)?.get('id')?.value ?? '');
    if (id) this.removedClosingSourceIds.push(id);
    this.closingSources.removeAt(index);
  }

  sourceNeedsAccount(index: number): boolean {
    return closingSourceKindNeedsAccount(String(this.closingSources.at(index)?.get('kind')?.value ?? ''));
  }

  onClosingSourceKindChange(index: number): void {
    if (this.sourceNeedsAccount(index)) return;
    this.closingSources.at(index)?.patchValue({ accountId: null });
  }

  async saveClosingSources(): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    for (let i = 0; i < this.closingSources.length; i++) {
      const row = this.closingSources.at(i)?.getRawValue() as ShopClosingSource;
      const name = String(row?.name ?? '').trim();
      if (!name) {
        this.snack.open('Cada fuente necesita un nombre', 'OK', { duration: 3000 });
        return;
      }
      if (closingSourceKindNeedsAccount(row.kind) && !row.accountId) {
        this.snack.open(`Elegí la cuenta destino de «${name}»`, 'OK', { duration: 3500 });
        return;
      }
    }
    this.sourceSaving.set(true);
    try {
      for (const id of this.removedClosingSourceIds) {
        await firstValueFrom(this.api.removeClosingSource(shopId, id));
      }
      this.removedClosingSourceIds = [];
      for (let i = 0; i < this.closingSources.length; i++) {
        const row = this.closingSources.at(i);
        const raw = row?.getRawValue() as ShopClosingSource;
        const body = {
          name: String(raw.name ?? '').trim(),
          includeInDeclared: !!raw.includeInDeclared,
          kind: raw.kind,
          accountId: raw.accountId || null,
          sortOrder: i + 1,
          active: true,
        };
        if (raw.id) {
          const updated = await firstValueFrom(this.api.updateClosingSource(shopId, raw.id, body));
          row?.patchValue({ id: updated.id, accountId: updated.accountId ?? null }, { emitEvent: false });
        } else {
          const created = await firstValueFrom(this.api.createClosingSource(shopId, body));
          row?.patchValue({ id: created.id, accountId: created.accountId ?? null }, { emitEvent: false });
        }
      }
      this.snack.open('Fuentes extra actualizadas', 'OK', { duration: 2500 });
      this.reloadClosingSources();
      await this.auth.refreshMe();
      this.settlementsInbox.refresh();
    } catch (err) {
      const msg = (err as { error?: { message?: string | string[] } })?.error?.message ?? 'No se pudieron guardar las fuentes';
      this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
    } finally {
      this.sourceSaving.set(false);
    }
  }

  private setClosingSources(rows: ShopClosingSource[]): void {
    this.removedClosingSourceIds = [];
    this.closingSources.clear();
    for (const row of rows) {
      this.closingSources.push(this.buildClosingSourceGroup(row));
    }
  }

  private buildClosingSourceGroup(value: ShopClosingSource) {
    return this.fb.group({
      id: [value.id || ''],
      name: [value.name || ''],
      includeInDeclared: [!!value.includeInDeclared],
      kind: [value.kind || 'RECORD_ONLY'],
      accountId: [value.accountId ?? null],
      sortOrder: [value.sortOrder ?? 0],
    });
  }

  reloadAccounts(after?: () => void): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManageAccounts()) return;
    this.http
      .get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`)
      .subscribe({
        next: (rows) => {
          this.allLedgerAccounts.set(rows);
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

  markClearSmtpPassword(): void {
    this.clearSmtpPasswordOnSave.set(true);
    this.form.controls.emailSmtpPassword.setValue('');
    this.snack.open('Se quitará la contraseña al guardar', 'OK', { duration: 2500 });
  }

  onNavConfigChange(cfg: ShopNavConfig | null): void {
    this.navConfigDraft.set(cfg);
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.form.invalid || this.saving()) return;
    const raw = this.form.getRawValue();
    this.saving.set(true);
    const body: Record<string, unknown> = {
      name: raw.name,
      slug: raw.slug,
      email: raw.email.trim() || null,
      instagramHandle: raw.instagramHandle.trim().replace(/^@+/, '') || null,
      phone: raw.phone.trim() || null,
      emailNotificationsEnabled: !!raw.emailNotificationsEnabled,
      emailNotificationTypes: this.allEmailTypesSelected()
        ? null
        : [...raw.emailNotificationTypes],
      emailNotificationUserIds: this.allEmailUsersSelected()
        ? null
        : [...raw.emailNotificationUserIds],
      logoUrl: this.effectiveLogoRaw(),
      accentColor: raw.accentColor.trim() || null,
      accentSecondary: raw.accentSecondary.trim() || null,
      unitsLabel: raw.unitsLabel.trim() || null,
      currency: raw.currency || 'ARS',
      defaultChangeAmount: raw.defaultChangeAmount,
      openingTime: raw.openingTime || '10:00',
      timezone: raw.timezone || 'America/Argentina/Buenos_Aires',
      productionDefaultHours: raw.productionDefaultHours ?? 8,
      serviceDefaultCheckIn: raw.serviceDefaultCheckIn || '18:00',
      serviceDefaultCheckOut: raw.serviceDefaultCheckOut || '00:00',
      serviceAttendanceWithHours: raw.serviceAttendanceWithHours,
      closedWeekdays: [...raw.closedWeekdays].sort((a, b) => a - b),
      coversEnabled: raw.coversEnabled,
      reservationsEnabled: raw.reservationsEnabled,
      reservationSignupEnabled: raw.reservationSignupEnabled,
      reservationInsideEnabled: raw.reservationInsideEnabled,
      reservationOutsideEnabled: raw.reservationOutsideEnabled,
      reservationInsideMaxPartySize: this.toPartyRule(raw.reservationInsideMaxPartySize),
      reservationOutsideMinPartySize: this.toPartyRule(raw.reservationOutsideMinPartySize),
      waitingListEnabled: raw.waitingListEnabled,
      tipsEnabled: raw.tipsEnabled,
      publicAttendanceEnabled: raw.publicAttendanceEnabled,
      publicServiceRulesEnabled: raw.publicServiceRulesEnabled,
      menuEnabled: raw.menuEnabled,
      active: raw.active,
      salesSystemId: raw.salesSystemId || null,
      paymentConceptCategories: { ...raw.paymentConceptCategories },
      navConfig: this.navConfigDraft(),
      posnets: (raw.posnets as ShopPosnet[])
        .map((p) => ({
          id: p.id,
          name: String(p.name ?? '').trim(),
          type: p.type,
        }))
        .filter((p) => !!p.name),
    };
    const smtpPass = String(raw.emailSmtpPassword ?? '').trim();
    if (this.clearSmtpPasswordOnSave()) {
      body['emailSmtpPassword'] = null;
    } else if (smtpPass) {
      body['emailSmtpPassword'] = smtpPass;
    }
    this.http.patch<any>(`${environment.apiUrl}/shops/${shopId}`, body).subscribe({
      next: (shop) => {
        const scrollY = window.scrollY;
        this.saving.set(false);
        this.emailSmtpConfigured.set(!!shop.emailSmtpConfigured);
        this.clearSmtpPasswordOnSave.set(false);
        this.form.controls.emailSmtpPassword.setValue('');
        this.applyLogoFromShop(shop.logoUrl);
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

  clearLogo(): void {
    const shopId = this.shops.selectedShopId();
    this.uploadedLogoPath.set(null);
    this.form.patchValue({ logoUrl: '' });
    this.logoCacheBust.set(Date.now());
    if (!shopId) return;
    this.http.patch<any>(`${environment.apiUrl}/shops/${shopId}`, { logoUrl: '' }).subscribe({
      next: (s) => {
        this.shops.upsertShop(s, { bustLogo: true });
        this.snack.open('Logo quitado', 'OK', { duration: 2000 });
      },
      error: () => {
        // El campo ya quedó vacío; se persistirá al guardar el formulario.
      },
    });
  }

  async onLogoFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const picked = await takeInputFile(input);
    const shopId = this.shops.selectedShopId();
    if (!picked || !shopId) return;
    if (!picked.type.startsWith('image/')) {
      this.snack.open('Elegí una imagen (PNG, JPG, WEBP…)', 'OK', { duration: 3000 });
      return;
    }
    if (picked.size > 5 * 1024 * 1024) {
      this.snack.open('La imagen no puede superar 5 MB', 'OK', { duration: 3000 });
      return;
    }
    let file = picked;
    try {
      file = await normalizeLogoImageFile(picked);
    } catch {
      // Si falla la conversión, subimos el original.
    }
    const body = new FormData();
    body.append('file', file);
    this.logoUploading.set(true);
    this.http.post<any>(`${environment.apiUrl}/shops/${shopId}/logo`, body).subscribe({
      next: (s) => {
        this.logoUploading.set(false);
        this.applyLogoFromShop(s.logoUrl);
        this.shops.upsertShop(s, { bustLogo: true });
        this.snack.open('Logo subido', 'OK', { duration: 2200 });
      },
      error: (err) => {
        this.logoUploading.set(false);
        const msg = err?.error?.message ?? 'No se pudo subir el logo';
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

  async onRestoreFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = await takeInputFile(input);
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
