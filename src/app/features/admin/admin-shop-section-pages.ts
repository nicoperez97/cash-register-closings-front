import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopNavEditorComponent } from './shop-nav-editor';
import { ShopToolbarEditorComponent } from './shop-toolbar-editor';
import { AdminShopIdentityComponent } from './admin-shop-identity';
import { AdminShopOperationComponent } from './admin-shop-operation';
import { AdminShopDevicesComponent } from './admin-shop-devices';
import { AdminShopAdvancedComponent } from './admin-shop-advanced';
import { AdminShopSubnavComponent } from './admin-shop-subnav';
import { ADMIN_SHOP_HOST } from './admin-shop-host';
import { adminShopSectionByPath } from './admin-shop-sections';

@Component({
  selector: 'app-admin-shop-identidad-page',
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    PageHeaderComponent,
    AdminShopSubnavComponent,
    AdminShopIdentityComponent,
  ],
  template: `
    <app-page-header [title]="section.label" [subtitle]="section.subtitle" />
    <app-admin-shop-subnav activeId="identidad" />
    <div
      class="shop-admin__tab-panel shop-admin__tab-panel--identity"
      [formGroup]="host.form"
    >
      <aside class="shop-admin__preview panel-card">
        <p class="shop-admin__preview-label">Vista previa</p>
        <div
          class="shop-admin__brand"
          [style.--preview-accent]="host.liveAccent()"
          [style.--preview-accent-secondary]="host.liveAccentSecondary()"
        >
          <div class="shop-admin__logo-wrap">
            @if (host.previewUrl()) {
              <img
                [src]="host.previewUrl()"
                alt="Logo del local"
                referrerpolicy="no-referrer"
                class="shop-admin__logo"
              />
            } @else {
              <mat-icon class="shop-admin__logo-fallback">storefront</mat-icon>
            }
          </div>
          <div class="shop-admin__brand-text">
            <strong>{{ host.liveName() || 'Nombre del local' }}</strong>
            <span>{{ host.liveSlug() || 'slug-del-local' }}</span>
          </div>
        </div>
        <div class="shop-admin__swatch-row">
          <span class="shop-admin__swatch" [style.background]="host.liveAccent()"></span>
          <span class="shop-admin__swatch" [style.background]="host.liveAccentSecondary()"></span>
          <span class="text-muted small">
            {{ host.liveAccent() }} · {{ host.liveAccentSecondary() }}
          </span>
        </div>
        <p class="text-muted small mb-0">
          Así se ve en el menú lateral y en botones del local. El slug es la URL interna (solo
          minúsculas, números y guiones).
        </p>
      </aside>
      <div class="shop-admin__fields">
        <app-admin-shop-identity
          [shopId]="host.shops.selectedShopId()"
          [shopUsers]="host.shopUsers()"
          [emailTypeOptions]="host.emailTypeOptions"
          [emailSmtpConfigured]="host.emailSmtpConfigured()"
          [emailNotificationsOn]="!!host.formValue()?.emailNotificationsEnabled"
          [allEmailTypesSelected]="host.allEmailTypesSelected()"
          [allEmailUsersSelected]="host.allEmailUsersSelected()"
          [isEmailTypeSelected]="host.isEmailTypeSelectedBound"
          [isEmailUserSelected]="host.isEmailUserSelectedBound"
          [uploadedLogoPath]="host.uploadedLogoPath()"
          [logoUploading]="host.logoUploading()"
          [hasLogo]="host.hasLogo()"
          [accentPicker]="host.colorPickerValue()"
          [accentSecondaryPicker]="host.colorSecondaryPickerValue()"
          [liveAccent]="host.liveAccent()"
          [liveAccentSecondary]="host.liveAccentSecondary()"
          (clearSmtp)="host.markClearSmtpPassword()"
          (toggleEmailType)="host.toggleEmailType($event)"
          (toggleAllEmailTypes)="host.toggleAllEmailTypes()"
          (toggleEmailUser)="host.toggleEmailUser($event)"
          (toggleAllEmailUsers)="host.toggleAllEmailUsers()"
          (logoFileSelected)="host.onLogoFile($event)"
          (clearLogo)="host.clearLogo()"
          (accentPickerChange)="host.onAccentPicker($event)"
          (accentSecondaryPickerChange)="host.onAccentSecondaryPicker($event)"
        />
      </div>
    </div>
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopIdentidadPage {
  readonly host = inject(ADMIN_SHOP_HOST);
  readonly section = adminShopSectionByPath('identidad')!;
}

@Component({
  selector: 'app-admin-shop-operacion-page',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AdminShopSubnavComponent,
    AdminShopOperationComponent,
  ],
  template: `
    <app-page-header [title]="section.label" [subtitle]="section.subtitle" />
    <app-admin-shop-subnav activeId="operacion" />
    <div class="shop-admin__tab-panel" [formGroup]="host.form">
      <app-admin-shop-operation
        [timezoneOptions]="host.timezoneOptions"
        [weekdayOptions]="host.weekdayOptions"
        [salesSystems]="host.salesSystems()"
        [conceptCategoryOptions]="host.conceptCategoryOptions"
        [serviceWithHours]="!!host.formValue()?.serviceAttendanceWithHours"
        [canManageAccounts]="host.canManageAccounts()"
        [isShiftWeekday]="host.isShiftWeekdayBound"
        [isClosedWeekday]="host.isClosedWeekdayBound"
        (addShift)="host.addShift()"
        (removeShift)="host.removeShift($event)"
        (toggleShiftWeekday)="host.toggleShiftWeekday($event.index, $event.day)"
        (toggleClosedWeekday)="host.toggleClosedWeekday($event)"
      />
    </div>
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopOperacionPage {
  readonly host = inject(ADMIN_SHOP_HOST);
  readonly section = adminShopSectionByPath('operacion')!;
}

@Component({
  selector: 'app-admin-shop-dispositivos-page',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AdminShopSubnavComponent,
    AdminShopDevicesComponent,
  ],
  template: `
    <app-page-header [title]="section.label" [subtitle]="section.subtitle" />
    <app-admin-shop-subnav activeId="dispositivos" />
    <div class="shop-admin__tab-panel" [formGroup]="host.form">
      <app-admin-shop-devices
        [posnetTypes]="host.posnetTypes"
        [closingSourceKinds]="host.closingSourceKinds"
        [sourceSaving]="host.sourceSaving()"
        [(accountSearchQuery)]="host.accountSearchQuery"
        [sourceNeedsAccount]="host.sourceNeedsAccountBound"
        [filteredSourceAccounts]="host.filteredSourceAccountsBound"
        (addPosnet)="host.addPosnet()"
        (removePosnet)="host.removePosnet($event)"
        (addClosingSource)="host.addClosingSource()"
        (removeClosingSource)="host.removeClosingSource($event)"
        (closingSourceKindChange)="host.onClosingSourceKindChange($event)"
        (saveClosingSources)="host.saveClosingSources()"
        (selectOpened)="host.onSelectSearchOpened($event, host.accountSearchQuery)"
      />
    </div>
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopDispositivosPage {
  readonly host = inject(ADMIN_SHOP_HOST);
  readonly section = adminShopSectionByPath('dispositivos')!;
}

@Component({
  selector: 'app-admin-shop-menu-page',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AdminShopSubnavComponent,
    ShopNavEditorComponent,
    ShopToolbarEditorComponent,
  ],
  template: `
    <app-page-header [title]="section.label" [subtitle]="section.subtitle" />
    <app-admin-shop-subnav activeId="menu" />
    <div class="shop-admin__tab-panel">
      <section class="panel-card guy-form-section">
        <h2 class="guy-section-title">Menú lateral</h2>
        <p class="text-muted small mb-3">
          Creá grupos, reordená con las flechas y con ⋮ renombrá, mové de grupo u ocultá módulos.
          Tocá <strong>Guardar cambios</strong> abajo para aplicar.
        </p>
        <app-shop-nav-editor
          [value]="host.navConfigDraft()"
          [filterByUserPermissions]="false"
          (valueChange)="host.onNavConfigChange($event)"
        />
      </section>
      <section class="panel-card guy-form-section">
        <h2 class="guy-section-title">Accesos rápidos</h2>
        <p class="text-muted small mb-3">
          Atajos de la barra superior: arrastrá para ordenar, ocultá o sumá módulos con
          <strong>Agregar atajo</strong>. El perfil puede personalizarlos encima de este default.
          Tocá <strong>Guardar cambios</strong> abajo.
        </p>
        <app-shop-toolbar-editor
          [value]="host.toolbarConfigDraft()"
          [filterByUserPermissions]="false"
          (valueChange)="host.onToolbarConfigChange($event)"
        />
      </section>
    </div>
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopMenuPage {
  readonly host = inject(ADMIN_SHOP_HOST);
  readonly section = adminShopSectionByPath('menu')!;
}

@Component({
  selector: 'app-admin-shop-avanzado-page',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AdminShopSubnavComponent,
    AdminShopAdvancedComponent,
  ],
  template: `
    <app-page-header [title]="section.label" [subtitle]="section.subtitle" />
    <app-admin-shop-subnav activeId="avanzado" />
    <div class="shop-admin__tab-panel" [formGroup]="host.form">
      <app-admin-shop-advanced
        [isSuperAdmin]="host.isSuperAdmin()"
        (openBackup)="host.openBackupTools()"
      />
    </div>
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopAvanzadoPage {
  readonly host = inject(ADMIN_SHOP_HOST);
  readonly section = adminShopSectionByPath('avanzado')!;
}
