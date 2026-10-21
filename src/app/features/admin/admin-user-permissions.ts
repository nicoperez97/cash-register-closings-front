import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { environment } from '../../../environments/environment';
import {
  ACCOUNT_TYPE_OPTIONS,
  MODULE_DEFS,
  MODULE_GROUPS,
  MODULE_PRESETS,
  ModuleKey,
  canManageShopUsers,
  emptyModuleLevels,
  migrateModuleLevels,
} from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  buildNavPreview,
  buildSyntheticAuthUser,
} from '../../core/layout/nav-preview';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  USER_VISIBILITY_OPTIONS,
  normalizeUserVisibility,
} from '../../shared/user-visibility';
import {
  USER_ADMIN_FLAG_OPTIONS,
  USER_EDIT_FLAG_OPTIONS,
} from '../../shared/user-admin-flags';
import {
  ORDERING_CONFIG_LEVELS,
  ORDERING_CONFIG_VISIBILITY_OPTIONS,
  OrderingConfigLevel,
  OrderingConfigVisibilityKey,
  normalizeOrderingConfigVisibility,
} from '../../shared/ordering-config-visibility';
import {
  SHOP_CONFIG_LEVELS,
  SHOP_CONFIG_VISIBILITY_OPTIONS,
  ShopConfigLevel,
  ShopConfigVisibilityKey,
  normalizeShopConfigVisibility,
} from '../../shared/shop-config-visibility';
import {
  REPORTS_PRODUCTS_AMOUNT_MODE_OPTIONS,
  REPORTS_PRODUCTS_VISIBILITY_FLAGS,
  ReportsProductsAmountMode,
  defaultReportsProductsVisibility,
  normalizeReportsProductsVisibility,
} from '../../shared/reports-products-visibility';
import {
  REPORT_AMOUNT_MODE_OPTIONS,
  REPORT_VISIBILITY_UI,
  ReportAmountMode,
  ReportKey,
  ReportVisibilityUi,
  defaultReportVisibility,
  normalizeReportsVisibility,
} from '../../shared/reports-visibility';
import { AdminUserRow } from './admin-user-dialog';
import type { ShopProfilePreferences } from '../profile/profile-api.service';

import { apiErrorMessage } from '../../core/http/api-error-message';
function isAdminRole(role?: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

function accountTypeFromRole(role?: string): string {
  if (role === 'OWNER') return 'SUPER_ADMIN';
  if (role === 'ADMIN') return 'ADMIN';
  return 'EMPLOYEE';
}

function levelsFromUser(user: AdminUserRow | null): Record<ModuleKey, string> {
  if (!user || isAdminRole(user.globalRole)) return migrateModuleLevels(null);
  return migrateModuleLevels(user.modulePermissions ?? {});
}

@Component({
  selector: 'app-admin-user-permissions',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    BusyLabelComponent,
  ],
  template: `
    <app-page-header
      [title]="'Permisos · ' + (user()?.fullName ?? 'Usuario')"
      [subtitle]="shopName()"
      actionLabel="Volver a usuarios"
      actionIcon="arrow_back"
      (action)="goBack()"
    />

    @if (loading()) {
      <div class="panel-card" role="status" aria-busy="true" aria-label="Cargando permisos">
        <div class="guy-skeleton-line guy-skeleton-line--title"></div>
        <div class="guy-skeleton-line"></div>
        <div class="guy-skeleton-line guy-skeleton-line--short"></div>
        <div class="guy-skeleton-line"></div>
        <div class="guy-skeleton-line guy-skeleton-line--short"></div>
      </div>
    } @else if (!user()) {
      <div class="panel-card">
        <p class="muted">No se encontró el usuario.</p>
        <a mat-button routerLink="/admin/users">Volver</a>
      </div>
    } @else {
      <form class="layout" [formGroup]="form" (ngSubmit)="save()">
        <div class="editor panel-card">
          <div class="section">
            <p class="section__title">Tipo de cuenta</p>
            <div class="type-grid">
              @for (opt of accountTypeOptions; track opt.value) {
                <button
                  type="button"
                  class="type-card"
                  [class.type-card--active]="form.controls.accountType.value === opt.value"
                  (click)="form.controls.accountType.setValue(opt.value); onAccountTypeChange()"
                >
                  <span class="type-card__icon"><mat-icon>{{ opt.icon }}</mat-icon></span>
                  <span class="type-card__body">
                    <span class="type-card__title">{{ opt.label }}</span>
                    <span class="type-card__desc">{{ opt.description }}</span>
                  </span>
                </button>
              }
            </div>
          </div>

          @if (form.controls.accountType.value !== 'EMPLOYEE') {
            <div class="admin-banner">
              <mat-icon>verified_user</mat-icon>
              <div>
                @if (form.controls.accountType.value === 'SUPER_ADMIN') {
                  <strong>Super admin.</strong>
                  Ve todos los locales y tiene acceso total.
                } @else {
                  <strong>Acceso total</strong> a los módulos del local. No hace falta configurar uno por uno.
                }
              </div>
            </div>
          } @else {
            <div class="section">
              <p class="section__title">Accesos rápidos</p>
              <div class="preset-grid">
                @for (p of presets; track p.id) {
                  <button
                    type="button"
                    class="preset-card"
                    [class.preset-card--active]="activePreset() === p.id"
                    (click)="applyPreset(p.id)"
                  >
                    <mat-icon class="preset-card__icon">{{ p.icon }}</mat-icon>
                    <span>
                      <div class="preset-card__title">{{ p.label }}</div>
                      <div class="preset-card__desc">{{ p.description }}</div>
                    </span>
                  </button>
                }
              </div>
            </div>

            @for (g of moduleGroups; track g.id) {
              <div class="section">
                <p class="section__title">{{ g.label }}</p>
                <div class="module-group" formGroupName="modules">
                  @for (mod of modulesOf(g.id); track mod.key) {
                    <div
                      class="module-row"
                      [class.module-row--on]="moduleLevel(mod.key) !== 'none'"
                    >
                      <div class="module-row__main">
                        <div class="module-row__info">
                          <span class="module-row__icon"><mat-icon>{{ mod.icon }}</mat-icon></span>
                          <div class="module-row__text">
                            <div class="module-row__name">{{ mod.label }}</div>
                            @if (mod.hint) {
                              <div class="module-row__hint">{{ mod.hint }}</div>
                            }
                          </div>
                        </div>
                        <div class="level-pills" role="group" [attr.aria-label]="'Nivel de ' + mod.label">
                          @for (lvl of mod.levels; track lvl.value) {
                            <button
                              type="button"
                              class="level-pill"
                              [class.level-pill--active]="moduleLevel(mod.key) === lvl.value"
                              [class.level-pill--off]="lvl.value === 'none'"
                              [matTooltip]="lvl.label"
                              (click)="setModuleLevel(mod.key, lvl.value)"
                            >
                              {{ lvl.short ?? lvl.label }}
                            </button>
                          }
                        </div>
                      </div>
                      @if (mod.key === 'reportsProducts' && moduleLevel('reportsProducts') !== 'none') {
                        <div class="module-row__extra">
                          <button
                            type="button"
                            mat-stroked-button
                            class="config-btn"
                            (click)="reportsProductsConfigOpen.set(!reportsProductsConfigOpen())"
                          >
                            <mat-icon>tune</mat-icon>
                            Configurar
                          </button>
                          @if (reportsProductsConfigOpen()) {
                            <div class="rp-config" [formGroup]="form.controls.reportsProductsVisibility">
                              <p class="section__hint">Qué ve en Ventas POS.</p>
                              <div class="rp-flags">
                                @for (opt of reportsProductsFlags; track opt.key) {
                                  <mat-checkbox [formControlName]="opt.key">{{ opt.label }}</mat-checkbox>
                                }
                              </div>
                              <p class="section__hint">Datos numéricos</p>
                              <div class="level-pills">
                                @for (opt of reportsProductsAmountModes; track opt.value) {
                                  <button
                                    type="button"
                                    class="level-pill"
                                    [class.level-pill--active]="reportsProductsAmountMode() === opt.value"
                                    [class.level-pill--off]="opt.value === 'none'"
                                    (click)="setReportsProductsAmountMode(opt.value)"
                                  >
                                    {{ opt.label }}
                                  </button>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      }
                      @if (reportConfig(mod.key); as cfg) {
                        @if (moduleLevel(mod.key) !== 'none') {
                          <div class="module-row__extra">
                            <button
                              type="button"
                              mat-stroked-button
                              class="config-btn"
                              (click)="toggleReportConfig(mod.key)"
                            >
                              <mat-icon>tune</mat-icon>
                              Configurar
                            </button>
                            @if (isReportConfigOpen(mod.key)) {
                              <div class="rp-config" [formGroup]="reportGroup(cfg.report)">
                                <p class="section__hint">{{ cfg.hint }}</p>
                                <div class="rp-flags">
                                  @for (opt of cfg.flags; track opt.key) {
                                    <mat-checkbox [formControlName]="opt.key">{{ opt.label }}</mat-checkbox>
                                  }
                                </div>
                                @if (cfg.amountMode) {
                                  <p class="section__hint">Datos numéricos</p>
                                  <div class="level-pills">
                                    @for (opt of reportAmountModes; track opt.value) {
                                      <button
                                        type="button"
                                        class="level-pill"
                                        [class.level-pill--active]="reportAmountMode(cfg.report) === opt.value"
                                        [class.level-pill--off]="opt.value === 'none'"
                                        (click)="setReportAmountMode(cfg.report, opt.value)"
                                      >
                                        {{ opt.label }}
                                      </button>
                                    }
                                  </div>
                                }
                              </div>
                            }
                          </div>
                        }
                      }
                    </div>
                  }
                </div>
              </div>
            }

            @if (showOrderingConfigVisibility()) {
              <div class="section" formGroupName="orderingConfigVisibility">
                <p class="section__title">Pestaña Configurar (Pedidos)</p>
                <p class="section__hint">
                  Off = oculta · Ver = solo consulta · Todo = editar.
                </p>
                <div class="module-group">
                  @for (opt of orderingConfigOptions; track opt.key) {
                    <div
                      class="module-row"
                      [class.module-row--on]="orderingConfigLevel(opt.key) !== 'none'"
                    >
                      <div class="module-row__main">
                        <div class="module-row__info">
                          <span class="module-row__icon"><mat-icon>{{ opt.icon }}</mat-icon></span>
                          <div class="module-row__text">
                            <div class="module-row__name">{{ opt.label }}</div>
                            <div class="module-row__hint">{{ opt.hint }}</div>
                          </div>
                        </div>
                        <div class="level-pills">
                          @for (lvl of orderingConfigLevels; track lvl.value) {
                            <button
                              type="button"
                              class="level-pill"
                              [class.level-pill--active]="orderingConfigLevel(opt.key) === lvl.value"
                              [class.level-pill--off]="lvl.value === 'none'"
                              [matTooltip]="lvl.label"
                              (click)="setOrderingConfigLevel(opt.key, lvl.value)"
                            >
                              {{ lvl.short }}
                            </button>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            @if (showShopConfigVisibility()) {
              <div class="section" formGroupName="shopConfigVisibility">
                <p class="section__title">Secciones · Configuración del local</p>
                <p class="section__hint">
                  Con Configuración del local en Ver o Todo. Off = oculta · Ver = consulta · Todo = editar.
                </p>
                <div class="module-group">
                  @for (opt of shopConfigOptions; track opt.key) {
                    <div
                      class="module-row"
                      [class.module-row--on]="shopConfigLevel(opt.key) !== 'none'"
                    >
                      <div class="module-row__main">
                        <div class="module-row__info">
                          <span class="module-row__icon"><mat-icon>{{ opt.icon }}</mat-icon></span>
                          <div class="module-row__text">
                            <div class="module-row__name">{{ opt.label }}</div>
                            <div class="module-row__hint">{{ opt.hint }}</div>
                          </div>
                        </div>
                        <div class="level-pills">
                          @for (lvl of shopConfigLevels; track lvl.value) {
                            <button
                              type="button"
                              class="level-pill"
                              [class.level-pill--active]="shopConfigLevel(opt.key) === lvl.value"
                              [class.level-pill--off]="lvl.value === 'none'"
                              [matTooltip]="lvl.label"
                              (click)="setShopConfigLevel(opt.key, lvl.value)"
                            >
                              {{ lvl.short }}
                            </button>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          }

          <div class="divider"></div>
          <div class="section" formGroupName="visibility">
            <p class="section__title">Se muestra en</p>
            <p class="section__hint">Activado = aparece en ese lugar de este local.</p>
            <div class="flag-list">
              @for (opt of visibilityOptions; track opt.key) {
                <div
                  class="flag-card"
                  [class.flag-card--on]="!!form.controls.visibility.controls[opt.key].value"
                  (click)="toggleBoolControl(form.controls.visibility.controls[opt.key])"
                >
                  <span class="flag-card__icon" aria-hidden="true">
                    <mat-icon>{{ opt.icon }}</mat-icon>
                  </span>
                  <span class="flag-card__copy">
                    <strong>{{ opt.label }}</strong>
                    <span>{{ opt.hint }}</span>
                  </span>
                  <mat-slide-toggle
                    [formControlName]="opt.key"
                    (click)="$event.stopPropagation()"
                  />
                </div>
              }
            </div>
          </div>

          <div class="section">
            <p class="section__title">Avisos de administrador</p>
            <p class="section__hint">Campana, push y mail cuando pasa algo en ese módulo.</p>
            <div class="flag-list">
              @for (opt of adminFlagOptions; track opt.key) {
                <div
                  class="flag-card"
                  [class.flag-card--on]="!!form.get(opt.key)?.value"
                  (click)="toggleBoolControl(form.get(opt.key))"
                >
                  <span class="flag-card__icon" aria-hidden="true">
                    <mat-icon>{{ opt.icon }}</mat-icon>
                  </span>
                  <span class="flag-card__copy">
                    <strong>{{ opt.label }}</strong>
                    <span>{{ opt.hint }}</span>
                  </span>
                  <mat-slide-toggle
                    [formControlName]="opt.key"
                    (click)="$event.stopPropagation()"
                  />
                </div>
              }
              <div
                class="flag-card"
                [class.flag-card--on]="!!form.controls.salonFloorMonitorEnabled.value"
                (click)="toggleBoolControl(form.controls.salonFloorMonitorEnabled)"
              >
                <span class="flag-card__icon" aria-hidden="true">
                  <mat-icon>storefront</mat-icon>
                </span>
                <span class="flag-card__copy">
                  <strong>Monitor de salón</strong>
                  <span
                    >Chip flotante de reservas y lista de espera (con sonido). No hace falta
                    permiso de Reservas.</span
                  >
                </span>
                <mat-slide-toggle
                  formControlName="salonFloorMonitorEnabled"
                  (click)="$event.stopPropagation()"
                />
              </div>
            </div>
          </div>

          @if (canAssignSuperAdmin) {
            <div class="section">
              <p class="section__title">Edición avanzada</p>
              <p class="section__hint">Solo super admin puede otorgar estos permisos.</p>
              <div class="flag-list">
                @for (opt of editFlagOptions; track opt.key) {
                  <div
                    class="flag-card"
                    [class.flag-card--on]="!!form.get(opt.key)?.value"
                    (click)="toggleBoolControl(form.get(opt.key))"
                  >
                    <span class="flag-card__icon" aria-hidden="true">
                      <mat-icon>{{ opt.icon }}</mat-icon>
                    </span>
                    <span class="flag-card__copy">
                      <strong>{{ opt.label }}</strong>
                      <span>{{ opt.hint }}</span>
                    </span>
                    <mat-slide-toggle
                      [formControlName]="opt.key"
                      (click)="$event.stopPropagation()"
                    />
                  </div>
                }
              </div>
            </div>
          }

          <div class="actions">
            <button mat-stroked-button type="button" routerLink="/admin/users">Cancelar</button>
            <button mat-flat-button color="primary" type="submit" [disabled]="busy()">
              <app-busy-label [busy]="busy()" busyLabel="Guardando…">
                <mat-icon>shield</mat-icon>
                Guardar permisos
              </app-busy-label>
            </button>
          </div>
        </div>

        <aside class="preview panel-card" [class.preview--open]="previewOpen()">
          <button
            type="button"
            class="preview__toggle"
            (click)="previewOpen.set(!previewOpen())"
            [attr.aria-expanded]="previewOpen()"
          >
            <span>
              <strong class="preview__title">Así lo va a ver</strong>
              <span class="preview__hint">Menú según lo que elegís a la izquierda</span>
            </span>
            <mat-icon>{{ previewOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
          @if (previewOpen()) {
            @if (navPreview().length === 0) {
              <p class="muted">Sin ítems de menú con estos permisos.</p>
            } @else {
              <div class="preview-nav">
                @for (g of navPreview(); track g.id) {
                  <div class="preview-group">
                    <div class="preview-group__title">
                      <mat-icon>{{ g.icon }}</mat-icon>
                      {{ g.label }}
                    </div>
                    <ul class="preview-list">
                      @for (c of g.children; track c.id) {
                        <li>
                          <mat-icon>{{ c.icon }}</mat-icon>
                          <span>{{ c.label }}</span>
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>
            }
          }
        </aside>
      </form>
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.75fr);
      gap: 1rem;
      align-items: start;
    }
    @media (max-width: 960px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .preview {
        order: 2;
        position: static;
        max-height: none;
      }
      .editor {
        order: 1;
      }
    }
    .panel-card {
      padding: 1rem 1.1rem 1.15rem;
    }
    .section {
      margin: 0.35rem 0 1rem;
    }
    .section__title {
      margin: 0 0 0.35rem;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
    .section__hint {
      margin: 0 0 0.75rem;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }
    .muted {
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .type-grid,
    .preset-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
    }
    @media (max-width: 560px) {
      .type-grid,
      .preset-grid {
        grid-template-columns: 1fr;
      }
    }
    .type-card,
    .preset-card {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      text-align: left;
      padding: 0.7rem 0.75rem;
      border-radius: 12px;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }
    .type-card--active,
    .preset-card--active {
      border-color: var(--guy-accent, #2e7d32);
      background: color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, #fff);
    }
    .type-card__icon,
    .preset-card__icon {
      color: var(--guy-accent, #2e7d32);
    }
    .type-card__title,
    .preset-card__title {
      font-weight: 700;
      font-size: 0.85rem;
    }
    .type-card__desc,
    .preset-card__desc {
      font-size: 0.72rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.3;
    }
    .admin-banner {
      display: flex;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      background: color-mix(in srgb, var(--guy-accent, #2e7d32) 10%, #fff);
      border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 28%, transparent);
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }
    .module-group {
      margin-bottom: 0.85rem;
    }
    .module-row {
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      padding: 0.55rem 0.65rem;
      margin-bottom: 0.4rem;
      background: #fff;
    }
    .module-row--on {
      border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 35%, var(--guy-border));
    }
    .module-row__main {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: space-between;
      align-items: center;
    }
    .module-row__info {
      display: flex;
      gap: 0.55rem;
      align-items: flex-start;
      min-width: 0;
      flex: 1;
    }
    .module-row__icon {
      color: var(--guy-muted, #5f6f76);
    }
    .module-row__name {
      font-weight: 650;
      font-size: 0.88rem;
    }
    .module-row__hint {
      font-size: 0.72rem;
      color: var(--guy-muted, #5f6f76);
    }
    .module-row__extra {
      margin-top: 0.55rem;
      padding-top: 0.45rem;
      border-top: 1px dashed var(--guy-border, #d7e0d9);
    }
    .config-btn {
      margin-bottom: 0.45rem;
    }
    .rp-config {
      display: grid;
      gap: 0.45rem;
    }
    .rp-flags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.85rem;
    }
    .level-pills {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .level-pill {
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      border-radius: 999px;
      padding: 0.2rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 650;
      cursor: pointer;
      color: var(--guy-muted, #5f6f76);
    }
    .level-pill--active {
      background: var(--guy-accent, #2e7d32);
      border-color: var(--guy-accent, #2e7d32);
      color: #fff;
    }
    .level-pill--off.level-pill--active {
      background: #fff;
      color: var(--guy-muted, #5f6f76);
      border-color: var(--guy-border, #d7e0d9);
    }
    .divider {
      height: 1px;
      background: var(--guy-border, #d7e0d9);
      margin: 1rem 0;
    }
    .flag-list {
      display: grid;
      gap: 0.45rem;
    }
    .flag-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.7rem;
      align-items: center;
      margin: 0;
      padding: 0.7rem 0.8rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      background: #fff;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }
    .flag-card:hover {
      border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 35%, var(--guy-border));
    }
    .flag-card--on {
      border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 42%, var(--guy-border));
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, #fff);
    }
    .flag-card__icon {
      width: 2.15rem;
      height: 2.15rem;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--guy-border, #d7e0d9) 50%, #fff);
      color: var(--guy-muted, #5f6f76);
    }
    .flag-card--on .flag-card__icon {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 14%, #fff);
      color: var(--guy-primary, #1d65a0);
    }
    .flag-card__icon mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .flag-card__copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }
    .flag-card__copy strong {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--guy-text, #1b2a33);
      line-height: 1.25;
    }
    .flag-card__copy span {
      font-size: 0.74rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }
    .preview {
      position: sticky;
      top: 0.75rem;
      max-height: calc(100dvh - 5.5rem);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 22%, var(--guy-border, #d7e0d9));
      background:
        linear-gradient(
          165deg,
          color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, #fff) 0%,
          #fff 42%
        );
    }
    .preview__toggle {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
      width: 100%;
      border: 0;
      background: transparent;
      padding: 0;
      text-align: left;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }
    .preview__toggle mat-icon {
      color: var(--guy-accent, #2e7d32);
      flex-shrink: 0;
    }
    .preview__title {
      display: block;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-accent, #2e7d32);
    }
    .preview__hint {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.3;
    }
    .preview--open {
      overflow: hidden;
    }
    .preview-nav {
      margin-top: 0.75rem;
      overflow: auto;
      max-height: min(52dvh, 28rem);
      padding-right: 0.15rem;
    }
    .preview-group {
      margin-bottom: 0.85rem;
    }
    .preview-group__title {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 700;
      font-size: 0.8rem;
      margin-bottom: 0.35rem;
      color: var(--guy-accent, #2e7d32);
    }
    .preview-group__title mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--guy-accent, #2e7d32);
    }
    .preview-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .preview-list li {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.82rem;
      padding: 0.35rem 0.5rem;
      border-radius: 8px;
      background: color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, #fff);
      border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 16%, transparent);
      color: var(--guy-ink, #1a221c);
    }
    .preview-list mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--guy-accent, #2e7d32);
    }
  `,
})
export class AdminUserPermissionsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly shops = inject(ShopContextService);
  private readonly fb = inject(FormBuilder);

  readonly user = signal<AdminUserRow | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly activePreset = signal<string | null>(null);
  readonly modulesTick = signal(0);
  /** Preview abierto en desktop; en mobile arranca cerrado para no tapar el editor. */
  readonly previewOpen = signal(
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 961px)').matches,
  );

  readonly shopId = computed(() => this.shops.selectedShopId() ?? '');
  readonly shopName = computed(() => this.shops.selectedShop()?.name ?? 'Local');

  readonly canAssignSuperAdmin = this.auth.isSuperAdmin();
  readonly canAssignUsersModule =
    this.auth.isSuperAdmin() || this.auth.isAdmin();

  readonly accountTypeOptions = this.canAssignSuperAdmin
    ? ACCOUNT_TYPE_OPTIONS
    : ACCOUNT_TYPE_OPTIONS.filter((o) => o.value === 'EMPLOYEE' || o.value === 'ADMIN');
  readonly presets = MODULE_PRESETS;
  readonly moduleGroups = MODULE_GROUPS;
  readonly visibleModules = MODULE_DEFS.filter(
    (m) => m.key !== 'users' || this.canAssignUsersModule,
  );
  readonly visibilityOptions = USER_VISIBILITY_OPTIONS;
  readonly adminFlagOptions = USER_ADMIN_FLAG_OPTIONS;
  readonly editFlagOptions = USER_EDIT_FLAG_OPTIONS;
  readonly orderingConfigOptions = ORDERING_CONFIG_VISIBILITY_OPTIONS;
  readonly orderingConfigLevels = ORDERING_CONFIG_LEVELS;
  readonly shopConfigOptions = SHOP_CONFIG_VISIBILITY_OPTIONS;
  readonly shopConfigLevels = SHOP_CONFIG_LEVELS;
  readonly reportsProductsFlags = REPORTS_PRODUCTS_VISIBILITY_FLAGS;
  readonly reportsProductsAmountModes = REPORTS_PRODUCTS_AMOUNT_MODE_OPTIONS;
  readonly reportsProductsConfigOpen = signal(false);
  readonly reportAmountModes = REPORT_AMOUNT_MODE_OPTIONS;
  /** Módulos de reporte con el panel Configurar abierto. */
  readonly reportConfigOpen = signal<ReadonlySet<string>>(new Set());

  readonly form = this.fb.nonNullable.group({
    accountType: 'EMPLOYEE',
    modules: this.fb.nonNullable.group(
      Object.fromEntries(MODULE_DEFS.map((d) => [d.key, this.fb.nonNullable.control('none')])),
    ),
    visibility: this.fb.nonNullable.group({
      cashWithdraw: true,
      closingsFilters: true,
      payments: true,
      movements: true,
      employeeLink: true,
      usersList: true,
    }),
    orderingConfigVisibility: this.fb.nonNullable.group({
      caja: 'manage',
      channels: 'manage',
      payments: 'manage',
      items: 'manage',
      extras: 'manage',
    }),
    shopConfigVisibility: this.fb.nonNullable.group({
      resumen: 'manage',
      identidad: 'manage',
      operacion: 'manage',
      pedidos: 'manage',
      comanda: 'manage',
      comanderas: 'manage',
      dispositivos: 'manage',
      menu: 'manage',
      carta: 'manage',
      avanzado: 'manage',
    }),
    reportsProductsVisibility: this.fb.nonNullable.group({
      kpis: true,
      charts: true,
      tabProducts: true,
      tabCategories: true,
      tabDays: true,
      export: true,
      import: true,
      amountMode: 'both' as ReportsProductsAmountMode,
    }),
    /** Cierres, Conceptos, Ventas y Estadísticas: un grupo por reporte. */
    reportsVisibility: this.fb.nonNullable.group(
      Object.fromEntries(
        Object.values(REPORT_VISIBILITY_UI).map((ui) => [
          ui.report,
          this.fb.nonNullable.group(defaultReportVisibility(ui.report) as Record<string, unknown>),
        ]),
      ) as Record<ReportKey, FormGroup>,
    ),
    isStockAdmin: false,
    isBeverageStockAdmin: false,
    isShortageAdmin: false,
    isReservationAdmin: false,
    isCustomerOrdersAdmin: false,
    isAttendanceCheckInAdmin: false,
    salonFloorMonitorEnabled: false,
    requireClosingFiles: false,
    canEditExpenses: false,
    canEditPayments: false,
  });

  readonly showOrderingConfigVisibility = computed(() => {
    this.modulesTick();
    if (this.form.controls.accountType.value !== 'EMPLOYEE') return false;
    const raw = this.form.controls.modules.getRawValue() as Record<string, string>;
    const customerOrders = raw['customerOrders'] ?? 'none';
    const orderingCatalog = raw['orderingCatalog'] ?? 'none';
    return customerOrders !== 'none' || orderingCatalog === 'manage';
  });

  readonly showShopConfigVisibility = computed(() => {
    this.modulesTick();
    if (this.form.controls.accountType.value !== 'EMPLOYEE') return false;
    const raw = this.form.controls.modules.getRawValue() as Record<string, string>;
    const level = raw['shopConfig'] ?? 'none';
    return level === 'read' || level === 'manage';
  });

  readonly navPreview = computed(() => {
    this.modulesTick();
    const u = this.user();
    const shopId = this.shopId();
    if (!u || !shopId) return [];
    const accountType = this.form.controls.accountType.value;
    const globalRole =
      accountType === 'SUPER_ADMIN' ? 'OWNER' : accountType === 'ADMIN' ? 'ADMIN' : 'MANAGER';
    const modules =
      accountType === 'EMPLOYEE'
        ? (this.form.controls.modules.getRawValue() as Record<string, string>)
        : emptyModuleLevels();
    const shopConfigVisibility =
      accountType === 'EMPLOYEE'
        ? (this.form.controls.shopConfigVisibility.getRawValue() as Record<string, string>)
        : null;
    const synthetic = buildSyntheticAuthUser({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      shopId,
      shopName: this.shopName(),
      globalRole: globalRole as 'OWNER' | 'ADMIN' | 'MANAGER',
      modules:
        accountType === 'EMPLOYEE'
          ? modules
          : migrateModuleLevels(
              Object.fromEntries(
                MODULE_DEFS.map((d) => {
                  const top =
                    d.levels.find((l) => l.value === 'manage')?.value ??
                    [...d.levels].reverse().find((l) => l.value !== 'none')?.value ??
                    'none';
                  return [d.key, top];
                }),
              ) as Record<string, string>,
            ),
      shopConfigVisibility,
      isSuperAdminPreview: accountType === 'SUPER_ADMIN',
    });
    if (accountType !== 'EMPLOYEE') {
      // Admin/owner: preview full access
      const full = buildSyntheticAuthUser({
        userId: u.id,
        email: u.email,
        fullName: u.fullName,
        shopId,
        shopName: this.shopName(),
        globalRole: accountType === 'SUPER_ADMIN' ? 'OWNER' : 'ADMIN',
        modules: {},
        shopConfigVisibility: null,
        isSuperAdminPreview: accountType === 'SUPER_ADMIN',
      });
      return buildNavPreview(full, shopId, this.shopFeatures(), {
        isSuperAdmin: accountType === 'SUPER_ADMIN',
      });
    }
    return buildNavPreview(synthetic, shopId, this.shopFeatures());
  });

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageShopUsers(this.auth.currentUser(), shopId) && !this.auth.isAdmin()) {
      void this.router.navigate(['/admin/inicio']);
      return;
    }
    const userId = this.route.snapshot.paramMap.get('userId');
    if (!userId || !shopId) {
      this.loading.set(false);
      return;
    }
    this.http
      .get<AdminUserRow[]>(`${environment.apiUrl}/users`, { params: { shopId } })
      .subscribe({
        next: (rows) => {
          const found = rows.find((r) => r.id === userId) ?? null;
          this.user.set(found);
          if (found) {
            this.hydrate(found);
            this.loadSalonFloorMonitor(found.id, shopId);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudo cargar el usuario', 'OK', { duration: 3000 });
        },
      });
  }

  private loadSalonFloorMonitor(userId: string, shopId: string): void {
    this.http
      .get<ShopProfilePreferences>(
        `${environment.apiUrl}/users/${userId}/notification-preferences`,
        { params: { shopId } },
      )
      .subscribe({
        next: (p) => {
          this.form.controls.salonFloorMonitorEnabled.setValue(!!p.salonFloorMonitorEnabled);
        },
        error: () => {
          /* se deja en false */
        },
      });
  }

  private shopFeatures() {
    const s = this.shops.selectedShop();
    return {
      reservationsEnabled: s?.reservationsEnabled !== false,
      waitingListEnabled: s?.waitingListEnabled !== false,
      tipsEnabled: s?.tipsEnabled !== false,
      settlementsEnabled: s?.settlementsEnabled !== false,
      onlineOrderingEnabled: !!s?.onlineOrderingEnabled,
      waiterOrderingEnabled: !!s?.waiterOrderingEnabled,
    };
  }

  private hydrate(user: AdminUserRow): void {
    const vis = normalizeUserVisibility(user.visibility, {
      hideFromCashWithdraw: !!user.hideFromCashWithdraw,
    });
    const ordering = normalizeOrderingConfigVisibility(user.orderingConfigVisibility);
    const shopConfig = normalizeShopConfigVisibility(user.shopConfigVisibility);
    const reportsProducts = normalizeReportsProductsVisibility(user.reportsProductsVisibility);
    const levels = levelsFromUser(user);
    this.form.patchValue({
      accountType: accountTypeFromRole(user.globalRole),
      isStockAdmin: !!user.isStockAdmin,
      isBeverageStockAdmin: !!user.isBeverageStockAdmin,
      isShortageAdmin: !!user.isShortageAdmin,
      isReservationAdmin: !!user.isReservationAdmin,
      isAttendanceCheckInAdmin: !!user.isAttendanceCheckInAdmin,
      isCustomerOrdersAdmin: !!user.isCustomerOrdersAdmin,
      requireClosingFiles: false,
      canEditExpenses: !!user.canEditExpenses,
      canEditPayments: !!user.canEditPayments,
      visibility: vis,
      orderingConfigVisibility: ordering,
      shopConfigVisibility: shopConfig,
      reportsProductsVisibility: reportsProducts,
    });
    this.form.controls.reportsVisibility.patchValue(
      normalizeReportsVisibility(user.reportsVisibility as Record<string, unknown> | null),
    );
    this.reportConfigOpen.set(new Set());
    this.form.controls.modules.patchValue(levels);
    this.reportsProductsConfigOpen.set((levels['reportsProducts'] ?? 'none') !== 'none');
    this.modulesTick.update((n) => n + 1);
    this.syncActivePreset();
  }

  modulesOf(groupId: string) {
    return this.visibleModules.filter((m) => m.group === groupId);
  }

  toggleBoolControl(ctrl: AbstractControl | null | undefined): void {
    if (!ctrl || ctrl.disabled) return;
    ctrl.setValue(!ctrl.value);
    ctrl.markAsDirty();
  }

  moduleLevel(key: ModuleKey): string {
    this.modulesTick();
    return (this.form.controls.modules.get(key)?.value as string) ?? 'none';
  }

  setModuleLevel(key: ModuleKey, value: string): void {
    this.form.controls.modules.get(key)?.setValue(value);
    if (REPORT_VISIBILITY_UI[key] && value === 'none') {
      const report = REPORT_VISIBILITY_UI[key].report;
      this.reportGroup(report).patchValue(defaultReportVisibility(report));
      this.setReportConfigOpen(key, false);
    }
    if (key === 'reportsProducts') {
      if (value === 'none') {
        this.reportsProductsConfigOpen.set(false);
        this.form.controls.reportsProductsVisibility.patchValue(defaultReportsProductsVisibility());
      } else {
        this.reportsProductsConfigOpen.set(true);
      }
    }
    this.modulesTick.update((n) => n + 1);
    this.syncActivePreset();
  }

  orderingConfigLevel(key: OrderingConfigVisibilityKey): OrderingConfigLevel {
    this.modulesTick();
    return (this.form.controls.orderingConfigVisibility.get(key)?.value as OrderingConfigLevel) ?? 'none';
  }

  setOrderingConfigLevel(key: OrderingConfigVisibilityKey, value: OrderingConfigLevel): void {
    this.form.controls.orderingConfigVisibility.get(key)?.setValue(value);
    this.modulesTick.update((n) => n + 1);
  }

  shopConfigLevel(key: ShopConfigVisibilityKey): ShopConfigLevel {
    this.modulesTick();
    return (this.form.controls.shopConfigVisibility.get(key)?.value as ShopConfigLevel) ?? 'none';
  }

  setShopConfigLevel(key: ShopConfigVisibilityKey, value: ShopConfigLevel): void {
    this.form.controls.shopConfigVisibility.get(key)?.setValue(value);
    this.modulesTick.update((n) => n + 1);
  }

  reportsProductsAmountMode(): ReportsProductsAmountMode {
    this.modulesTick();
    return (
      (this.form.controls.reportsProductsVisibility.get('amountMode')
        ?.value as ReportsProductsAmountMode) ?? 'both'
    );
  }

  reportConfig(key: string): ReportVisibilityUi | null {
    return REPORT_VISIBILITY_UI[key] ?? null;
  }

  reportGroup(report: ReportKey): FormGroup {
    return this.form.controls.reportsVisibility.get(report) as FormGroup;
  }

  isReportConfigOpen(key: string): boolean {
    return this.reportConfigOpen().has(key);
  }

  toggleReportConfig(key: string): void {
    this.setReportConfigOpen(key, !this.isReportConfigOpen(key));
  }

  private setReportConfigOpen(key: string, open: boolean): void {
    const next = new Set(this.reportConfigOpen());
    if (open) next.add(key);
    else next.delete(key);
    this.reportConfigOpen.set(next);
  }

  reportAmountMode(report: ReportKey): ReportAmountMode {
    return (this.reportGroup(report).get('amountMode')?.value as ReportAmountMode) ?? 'both';
  }

  setReportAmountMode(report: ReportKey, value: ReportAmountMode): void {
    const ctrl = this.reportGroup(report).get('amountMode');
    ctrl?.setValue(value);
    ctrl?.markAsDirty();
  }

  /** Lo que se guarda: con el módulo apagado (o cuenta no empleado), el reporte vuelve a ver todo. */
  private reportsVisibilityPayload(raw: { accountType: string; modules: unknown }) {
    const modules = raw.modules as Record<string, string>;
    const out: Record<string, unknown> = {};
    for (const [moduleKey, ui] of Object.entries(REPORT_VISIBILITY_UI)) {
      const enabled = raw.accountType === 'EMPLOYEE' && modules[moduleKey] !== 'none';
      out[ui.report] = enabled
        ? this.reportGroup(ui.report).getRawValue()
        : defaultReportVisibility(ui.report);
    }
    return out;
  }

  setReportsProductsAmountMode(value: ReportsProductsAmountMode): void {
    this.form.controls.reportsProductsVisibility.get('amountMode')?.setValue(value);
    this.modulesTick.update((n) => n + 1);
  }

  onAccountTypeChange(): void {
    this.modulesTick.update((n) => n + 1);
    this.syncActivePreset();
  }

  applyPreset(id: string): void {
    const preset = MODULE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const next = emptyModuleLevels();
    for (const [k, v] of Object.entries(preset.modules)) {
      if (k in next && v) next[k as ModuleKey] = v;
    }
    this.form.controls.modules.patchValue(next);
    this.activePreset.set(id);
    this.modulesTick.update((n) => n + 1);
  }

  private syncActivePreset(): void {
    if (this.form.controls.accountType.value !== 'EMPLOYEE') {
      this.activePreset.set(null);
      return;
    }
    const raw = this.form.controls.modules.getRawValue() as Record<string, string>;
    for (const p of MODULE_PRESETS) {
      const expected = emptyModuleLevels();
      for (const [k, v] of Object.entries(p.modules)) {
        if (v) expected[k as ModuleKey] = v;
      }
      const match = MODULE_DEFS.every(
        (d) => (raw[d.key] ?? 'none') === (expected[d.key] ?? 'none'),
      );
      if (match) {
        this.activePreset.set(p.id);
        return;
      }
    }
    this.activePreset.set(null);
  }

  private resolveGlobalRole(): string {
    const t = this.form.controls.accountType.value;
    if (t === 'SUPER_ADMIN') return 'OWNER';
    if (t === 'ADMIN') return 'ADMIN';
    return 'MANAGER';
  }

  private resolveModulePermissions(): Record<string, string> | null {
    if (this.form.controls.accountType.value !== 'EMPLOYEE') return null;
    const raw = this.form.controls.modules.getRawValue() as Record<string, string>;
    const out: Record<string, string> = {};
    for (const d of MODULE_DEFS) {
      const v = raw[d.key] ?? 'none';
      if (d.key === 'orders' || d.key === 'shopConfig' || d.key === 'reportsSales') {
        out[d.key] = v;
        continue;
      }
      if (v && v !== 'none') out[d.key] = v;
    }
    return out;
  }

  goBack(): void {
    void this.router.navigate(['/admin/users']);
  }

  save(): void {
    const u = this.user();
    const shopId = this.shopId();
    if (!u || !shopId) return;
    const raw = this.form.getRawValue();
    const globalRole = this.resolveGlobalRole();
    const modulePermissions = this.resolveModulePermissions();
    this.busy.set(true);
    this.http
      .patch(`${environment.apiUrl}/users/${u.id}?shopId=${shopId}`, {
        globalRole,
        shopRole: globalRole,
        modulePermissions,
        visibility: raw.visibility,
        orderingConfigVisibility: raw.orderingConfigVisibility,
        shopConfigVisibility: raw.shopConfigVisibility,
        reportsProductsVisibility:
          raw.accountType === 'EMPLOYEE' &&
          (raw.modules as Record<string, string>)['reportsProducts'] !== 'none'
            ? raw.reportsProductsVisibility
            : defaultReportsProductsVisibility(),
        reportsVisibility: this.reportsVisibilityPayload(raw),
        isStockAdmin: !!raw.isStockAdmin,
        isBeverageStockAdmin: !!raw.isBeverageStockAdmin,
        isShortageAdmin: !!raw.isShortageAdmin,
        isReservationAdmin: !!raw.isReservationAdmin,
        isAttendanceCheckInAdmin: !!raw.isAttendanceCheckInAdmin,
        isCustomerOrdersAdmin: !!raw.isCustomerOrdersAdmin,
        requireClosingFiles: false,
        canEditExpenses: !!raw.canEditExpenses,
        canEditPayments: !!raw.canEditPayments,
      })
      .subscribe({
        next: () => {
          this.http
            .patch(
              `${environment.apiUrl}/users/${u.id}/notification-preferences`,
              { salonFloorMonitorEnabled: !!raw.salonFloorMonitorEnabled },
              { params: { shopId } },
            )
            .subscribe({
              next: () => {
                this.busy.set(false);
                this.snack.open('Permisos guardados', 'OK', { duration: 2500 });
                void this.router.navigate(['/admin/users']);
              },
              error: () => {
                this.busy.set(false);
                this.snack.open(
                  'Permisos guardados, pero no se pudo actualizar Monitor de salón',
                  'OK',
                  { duration: 4000 },
                );
                void this.router.navigate(['/admin/users']);
              },
            });
        },
        error: (err) => {
          this.busy.set(false);
          const msg = apiErrorMessage(err, 'Error al guardar permisos');
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
