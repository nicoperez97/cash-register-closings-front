import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { environment } from '../../../environments/environment';
import {
  ACCOUNT_TYPE_OPTIONS,
  MODULE_DEFS,
  MODULE_GROUPS,
  MODULE_PRESETS,
  ModuleKey,
  emptyModuleLevels,
} from '../../core/auth/auth.models';

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  globalRole: string;
  active: boolean;
  shopIds?: string[];
  modulePermissions?: Record<string, string> | null;
  ledgerAccountIds?: string[];
  ledgerAccountId?: string | null;
  ledgerAccountName?: string | null;
}

export type AdminUserDialogData = {
  shopId: string;
  shopName: string;
  canAssignUsersModule: boolean;
  /** Solo Super admin (OWNER) puede asignar/ver el tipo Super admin. */
  canAssignSuperAdmin: boolean;
  /** Super admin: puede asignar varios locales. */
  canAssignShops?: boolean;
  allShops?: Array<{ id: string; name: string }>;
} & (
  | { mode: 'create' }
  | { mode: 'edit'; user: AdminUserRow }
  | { mode: 'roles'; user: AdminUserRow }
);

interface AccountOption {
  id: string;
  name: string;
  type: string;
  userIds?: string[];
  userId?: string | null;
}

function isAdminRole(role?: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

function accountTypeFromRole(role?: string): string {
  if (role === 'OWNER') return 'SUPER_ADMIN';
  if (role === 'ADMIN') return 'ADMIN';
  return 'EMPLOYEE';
}

function levelsFromUser(user: AdminUserRow | null): Record<ModuleKey, string> {
  const base = emptyModuleLevels();
  if (!user || isAdminRole(user.globalRole)) return base;
  const mp = user.modulePermissions ?? {};
  for (const d of MODULE_DEFS) {
    const v = mp[d.key];
    if (v && d.levels.some((l) => l.value === v)) base[d.key] = v;
  }
  return base;
}

@Component({
  selector: 'app-admin-user-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  styles: [
    `
      :host {
        display: block;
      }
      mat-dialog-content {
        max-height: min(72vh, 720px);
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
      .type-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
      }
      @media (max-width: 560px) {
        .type-grid {
          grid-template-columns: 1fr;
        }
      }
      .type-card {
        display: flex;
        gap: 0.7rem;
        align-items: flex-start;
        text-align: left;
        padding: 0.85rem 0.9rem;
        border-radius: 14px;
        border: 1.5px solid var(--guy-border, #d7e0d9);
        background: #fff;
        cursor: pointer;
        font: inherit;
        color: inherit;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease,
          background 0.15s ease;
      }
      .type-card:hover {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 45%, var(--guy-border, #d7e0d9));
      }
      .type-card--active {
        border-color: var(--guy-accent, #2e7d32);
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, #fff);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--guy-accent, #2e7d32) 16%, transparent);
      }
      .type-card__icon {
        flex: 0 0 auto;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 14%, #fff);
        color: var(--guy-accent, #2e7d32);
      }
      .type-card__icon mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .type-card__body {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .type-card__title {
        font-weight: 700;
        font-size: 0.92rem;
        color: var(--guy-text, #1b2a33);
      }
      .type-card__desc {
        font-size: 0.75rem;
        line-height: 1.35;
        color: var(--guy-muted, #5f6f76);
      }
      .admin-banner {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        padding: 0.85rem 1rem;
        border-radius: 12px;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 10%, #fff);
        border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 28%, transparent);
        color: var(--guy-text, #1b2a33);
        font-size: 0.85rem;
        line-height: 1.4;
      }
      .admin-banner mat-icon {
        color: var(--guy-accent, #2e7d32);
        flex: 0 0 auto;
      }
      .preset-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.55rem;
      }
      @media (max-width: 560px) {
        .preset-grid {
          grid-template-columns: 1fr;
        }
      }
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
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }
      .preset-card:hover {
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 40%, var(--guy-border));
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 5%, #fff);
      }
      .preset-card--active {
        border-color: var(--guy-primary, #1d65a0);
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 8%, #fff);
      }
      .preset-card__icon {
        color: var(--guy-primary, #1d65a0);
        margin-top: 0.05rem;
      }
      .preset-card__title {
        font-weight: 700;
        font-size: 0.85rem;
      }
      .preset-card__desc {
        font-size: 0.72rem;
        color: var(--guy-muted, #5f6f76);
        line-height: 1.3;
      }
      .perm-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin: 0 0 0.85rem;
      }
      .perm-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 650;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 12%, #fff);
        color: var(--guy-text, #1b2a33);
      }
      .perm-chip mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--guy-accent, #2e7d32);
      }
      .perm-empty {
        font-size: 0.78rem;
        color: var(--guy-muted, #5f6f76);
        margin: 0 0 0.75rem;
      }
      .module-group {
        margin-bottom: 0.85rem;
      }
      .module-group__label {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
        margin: 0 0 0.45rem;
      }
      .module-row {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr);
        gap: 0.55rem;
        align-items: center;
        padding: 0.55rem 0.65rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 12px;
        background: #fff;
        margin-bottom: 0.4rem;
      }
      .module-row--on {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 35%, var(--guy-border));
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 4%, #fff);
      }
      @media (max-width: 560px) {
        .module-row {
          grid-template-columns: 1fr;
        }
      }
      .module-row__info {
        display: flex;
        gap: 0.55rem;
        align-items: center;
        min-width: 0;
      }
      .module-row__icon {
        flex: 0 0 auto;
        width: 2rem;
        height: 2rem;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--guy-border, #d7e0d9) 55%, #fff);
        color: var(--guy-text, #1b2a33);
      }
      .module-row__icon mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .module-row__name {
        font-weight: 700;
        font-size: 0.86rem;
        color: var(--guy-text, #1b2a33);
      }
      .module-row__hint {
        font-size: 0.7rem;
        color: var(--guy-muted, #5f6f76);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .level-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        justify-content: flex-end;
      }
      @media (max-width: 560px) {
        .level-pills {
          justify-content: flex-start;
        }
      }
      .level-pill {
        border: 1px solid var(--guy-border, #d7e0d9);
        background: #fff;
        color: var(--guy-muted, #5f6f76);
        border-radius: 999px;
        padding: 0.28rem 0.55rem;
        font-size: 0.72rem;
        font-weight: 650;
        cursor: pointer;
        font: inherit;
        line-height: 1.2;
      }
      .level-pill:hover {
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 40%, var(--guy-border));
      }
      .level-pill--active {
        background: var(--guy-primary, #1d65a0);
        border-color: var(--guy-primary, #1d65a0);
        color: #fff;
      }
      .level-pill--off.level-pill--active {
        background: #6b7780;
        border-color: #6b7780;
      }
      .divider {
        height: 1px;
        background: var(--guy-border, #d7e0d9);
        margin: 0.35rem 0 0.9rem;
      }
    `,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ titleIcon }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ titleText }}</strong>
        <span>{{ subtitleText }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        @if (!isRolesOnly) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Nombre</mat-label>
            <mat-icon matPrefix>badge</mat-icon>
            <input matInput formControlName="fullName" autocomplete="name" />
            @if (form.controls.fullName.touched && form.controls.fullName.hasError('required')) {
              <mat-error>Ingresá un nombre</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Correo</mat-label>
            <mat-icon matPrefix>mail</mat-icon>
            <input matInput formControlName="email" autocomplete="email" />
            @if (form.controls.email.touched && form.controls.email.hasError('required')) {
              <mat-error>Ingresá un correo</mat-error>
            }
            @if (form.controls.email.touched && form.controls.email.hasError('email')) {
              <mat-error>Correo inválido</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</mat-label>
            <mat-icon matPrefix>lock</mat-icon>
            <input matInput type="password" formControlName="password" autocomplete="new-password" />
            @if (form.controls.password.touched && form.controls.password.hasError('required')) {
              <mat-error>Ingresá una contraseña</mat-error>
            }
          </mat-form-field>

          <div class="divider"></div>
        } @else {
          <p class="section__hint" style="margin-top: 0">
            Cambiá el tipo de cuenta y los módulos a los que puede acceder
            <strong>{{ user?.fullName }}</strong> en este local.
          </p>
        }

        <div class="section">
          <p class="section__title">¿Qué tipo de acceso?</p>
          <p class="section__hint">Elegí si es administrador del local o un empleado con permisos puntuales.</p>
          <div class="type-grid" role="radiogroup" aria-label="Tipo de cuenta">
            @for (opt of accountTypeOptions; track opt.value) {
              <button
                type="button"
                class="type-card"
                [class.type-card--active]="form.controls.accountType.value === opt.value"
                (click)="setAccountType(opt.value)"
                role="radio"
                [attr.aria-checked]="form.controls.accountType.value === opt.value"
              >
                <span class="type-card__icon" aria-hidden="true">
                  <mat-icon>{{ opt.icon }}</mat-icon>
                </span>
                <span class="type-card__body">
                  <span class="type-card__title">{{ opt.label }}</span>
                  <span class="type-card__desc">{{ opt.description }}</span>
                </span>
              </button>
            }
          </div>
        </div>

        @if (isEmployee()) {
          <div class="section">
            <p class="section__title">Acceso rápido</p>
            <p class="section__hint">Un clic arma los permisos típicos. Después podés afinar módulo por módulo.</p>
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

          <div class="section">
            <p class="section__title">Permisos en {{ data.shopName }}</p>
            @if (enabledSummary().length) {
              <div class="perm-summary">
                @for (chip of enabledSummary(); track chip.key) {
                  <span class="perm-chip">
                    <mat-icon>{{ chip.icon }}</mat-icon>
                    {{ chip.label }} · {{ chip.level }}
                  </span>
                }
              </div>
            } @else {
              <p class="perm-empty">Todavía no tiene acceso a ningún módulo.</p>
            }

            @for (group of moduleGroups; track group.id) {
              @if (modulesOf(group.id).length) {
                <div class="module-group">
                  <p class="module-group__label">{{ group.label }}</p>
                  @for (mod of modulesOf(group.id); track mod.key) {
                    <div
                      class="module-row"
                      [class.module-row--on]="moduleLevel(mod.key) !== 'none'"
                    >
                      <div class="module-row__info">
                        <span class="module-row__icon" aria-hidden="true">
                          <mat-icon>{{ mod.icon }}</mat-icon>
                        </span>
                        <div>
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
                            {{ lvl.short || lvl.label }}
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            }
          </div>
        } @else {
          <div class="admin-banner">
            <mat-icon>verified_user</mat-icon>
            <div>
              @if (form.controls.accountType.value === 'SUPER_ADMIN') {
                <strong>Super admin.</strong>
                Ve todos los locales, puede crearlos y asignar usuarios a cualquiera.
              } @else {
                <strong>Acceso total.</strong>
                Este usuario puede usar todos los módulos de los locales asignados sin restricciones.
              }
            </div>
          </div>
        }

        @if (!isRolesOnly && data.canAssignShops && (data.allShops?.length ?? 0) > 0) {
          <div class="divider"></div>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Locales asignados</mat-label>
            <mat-icon matPrefix>store</mat-icon>
            <mat-select formControlName="shopIds" multiple>
              @for (s of data.allShops; track s.id) {
                <mat-option [value]="s.id">{{ s.name }}</mat-option>
              }
            </mat-select>
            <mat-hint>El usuario podrá operar en estos locales</mat-hint>
          </mat-form-field>
        }

        @if (!isRolesOnly) {
          <div class="divider"></div>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Cuentas asociadas</mat-label>
            <mat-icon matPrefix>account_balance</mat-icon>
            <mat-select formControlName="ledgerAccountIds" multiple>
              @for (a of accounts(); track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
            </mat-select>
            <mat-hint>Opcional · saldos / retiros asociados a este usuario</mat-hint>
          </mat-form-field>

          @if (isEdit) {
            <mat-slide-toggle formControlName="active">Usuario activo</mat-slide-toggle>
            <p class="section__hint" style="margin: 0">
              Si está inactivo no puede iniciar sesión ni usar la app.
            </p>
          }
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
        <mat-icon>{{ saveIcon }}</mat-icon>
        {{ saveLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class AdminUserDialogComponent implements OnInit {
  readonly data = inject<AdminUserDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminUserDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly isRolesOnly = this.data.mode === 'roles';
  readonly isEdit = this.data.mode === 'edit' || this.data.mode === 'roles';
  readonly user =
    this.data.mode === 'edit' || this.data.mode === 'roles' ? this.data.user : null;

  readonly titleIcon = this.isRolesOnly
    ? 'shield'
    : this.data.mode === 'edit'
      ? 'edit'
      : 'person_add';
  readonly titleText = this.isRolesOnly
    ? 'Editar roles'
    : this.data.mode === 'edit'
      ? 'Editar usuario'
      : 'Nuevo usuario';
  readonly subtitleText = this.isRolesOnly
    ? `${this.user?.fullName ?? 'Usuario'} · ${this.data.shopName}`
    : this.data.shopName;
  readonly saveIcon = this.isRolesOnly ? 'shield' : this.isEdit ? 'save' : 'person_add';
  readonly saveLabel = this.isRolesOnly
    ? 'Guardar roles'
    : this.isEdit
      ? 'Guardar cambios'
      : 'Crear';

  readonly busy = signal(false);
  readonly accounts = signal<AccountOption[]>([]);
  readonly activePreset = signal<string | null>(null);
  /** Fuerza refresco de resumen al cambiar pills. */
  readonly modulesTick = signal(0);

  readonly accountTypeOptions = this.data.canAssignSuperAdmin
    ? ACCOUNT_TYPE_OPTIONS
    : ACCOUNT_TYPE_OPTIONS.filter((o) => o.value === 'EMPLOYEE' || o.value === 'ADMIN');
  readonly presets = MODULE_PRESETS;
  readonly moduleGroups = MODULE_GROUPS;
  readonly visibleModules = MODULE_DEFS.filter(
    (m) => m.key !== 'users' || this.data.canAssignUsersModule,
  );

  private initialShopIds(): string[] {
    if (this.user?.shopIds?.length) return [...this.user.shopIds];
    return this.data.shopId ? [this.data.shopId] : [];
  }

  private initialAccountIds(): string[] {
    if (this.user?.ledgerAccountIds?.length) return [...this.user.ledgerAccountIds];
    if (this.user?.ledgerAccountId) return [this.user.ledgerAccountId];
    return [];
  }

  private initialModules = levelsFromUser(this.user);

  readonly form = this.fb.nonNullable.group({
    fullName: [
      this.user?.fullName ?? '',
      this.isRolesOnly ? [] : [Validators.required],
    ],
    email: [
      this.user?.email ?? '',
      this.isRolesOnly ? [] : [Validators.required, Validators.email],
    ],
    password: [
      '',
      this.isEdit || this.isRolesOnly ? [] : [Validators.required],
    ],
    accountType: [
      this.data.canAssignSuperAdmin
        ? accountTypeFromRole(this.user?.globalRole ?? 'CASHIER')
        : accountTypeFromRole(this.user?.globalRole ?? 'CASHIER') === 'SUPER_ADMIN'
          ? 'ADMIN'
          : accountTypeFromRole(this.user?.globalRole ?? 'CASHIER'),
      Validators.required,
    ],
    shopIds: this.fb.nonNullable.control<string[]>(this.initialShopIds(), Validators.required),
    modules: this.fb.nonNullable.group({
      closings: [this.initialModules.closings],
      reports: [this.initialModules.reports],
      movements: [this.initialModules.movements],
      attendance: [this.initialModules.attendance],
      employees: [this.initialModules.employees],
      payroll: [this.initialModules.payroll],
      commissions: [this.initialModules.commissions],
      accounts: [this.initialModules.accounts],
      concepts: [this.initialModules.concepts],
      shop: [this.initialModules.shop],
      users: [this.initialModules.users],
    }),
    ledgerAccountIds: this.fb.nonNullable.control<string[]>(this.initialAccountIds()),
    active: [this.user?.active ?? true],
  });

  readonly enabledSummary = computed(() => {
    this.modulesTick();
    const raw = this.form.controls.modules.getRawValue() as Record<string, string>;
    return this.visibleModules
      .filter((m) => raw[m.key] && raw[m.key] !== 'none')
      .map((m) => {
        const lvl = m.levels.find((l) => l.value === raw[m.key]);
        return {
          key: m.key,
          icon: m.icon,
          label: m.label,
          level: lvl?.short || lvl?.label || raw[m.key],
        };
      });
  });

  ngOnInit(): void {
    if (!this.isRolesOnly) {
      this.http
        .get<AccountOption[]>(`${environment.apiUrl}/shops/${this.data.shopId}/accounts`)
        .subscribe({
          next: (rows) => this.accounts.set(rows),
          error: () => this.accounts.set([]),
        });
    }
    this.syncActivePreset();
  }

  isEmployee(): boolean {
    return this.form.controls.accountType.value === 'EMPLOYEE';
  }

  modulesOf(group: 'daily' | 'people' | 'config') {
    return this.visibleModules.filter((m) => m.group === group);
  }

  moduleLevel(key: ModuleKey): string {
    this.modulesTick();
    return this.form.controls.modules.get(key)?.value ?? 'none';
  }

  setAccountType(value: string): void {
    this.form.controls.accountType.setValue(value);
    if (value !== 'EMPLOYEE') this.activePreset.set(null);
  }

  setModuleLevel(key: ModuleKey, value: string): void {
    this.form.controls.modules.get(key)?.setValue(value);
    this.modulesTick.update((n) => n + 1);
    this.syncActivePreset();
  }

  applyPreset(presetId: string): void {
    const preset = MODULE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = emptyModuleLevels();
    for (const [key, level] of Object.entries(preset.modules)) {
      if (key in next && level) next[key as ModuleKey] = level;
    }
    this.form.controls.modules.patchValue(next);
    this.activePreset.set(presetId);
    this.modulesTick.update((n) => n + 1);
  }

  private syncActivePreset(): void {
    const raw = this.form.controls.modules.getRawValue() as Record<string, string>;
    const match = MODULE_PRESETS.find((p) => {
      const expected = emptyModuleLevels();
      for (const [k, v] of Object.entries(p.modules)) {
        if (v) expected[k as ModuleKey] = v;
      }
      return MODULE_DEFS.every((d) => (raw[d.key] ?? 'none') === (expected[d.key] ?? 'none'));
    });
    this.activePreset.set(match?.id ?? null);
  }

  private resolveGlobalRole(): string {
    const t = this.form.controls.accountType.value;
    if (t === 'SUPER_ADMIN') return 'OWNER';
    if (t === 'ADMIN') {
      if (this.user?.globalRole === 'OWNER' && !this.data.canAssignSuperAdmin) return 'OWNER';
      return 'ADMIN';
    }
    return 'CASHIER';
  }

  private resolvedShopIds(raw: { shopIds: string[] }): string[] {
    if (this.data.canAssignShops) {
      const ids = [...new Set((raw.shopIds ?? []).filter(Boolean))];
      return ids.length ? ids : [this.data.shopId];
    }
    return [this.data.shopId];
  }

  private resolveModulePermissions(): Record<string, string> | null {
    if (this.form.controls.accountType.value === 'EMPLOYEE') {
      const raw = this.form.controls.modules.getRawValue() as Record<string, string>;
      const out: Record<string, string> = {};
      for (const d of this.visibleModules) {
        const v = raw[d.key] ?? 'none';
        if (v && v !== 'none') out[d.key] = v;
      }
      return out;
    }
    return null;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const globalRole = this.resolveGlobalRole();
    const modulePermissions = this.resolveModulePermissions();
    const shopIds = this.resolvedShopIds(raw);
    this.busy.set(true);

    if (this.isRolesOnly && this.user) {
      // No enviar shopIds: evita borrar asignaciones a otros locales.
      this.http
        .patch(`${environment.apiUrl}/users/${this.user.id}?shopId=${shopId}`, {
          globalRole,
          shopRole: globalRole,
          modulePermissions,
        })
        .subscribe({
          next: () => {
            this.busy.set(false);
            this.snack.open('Roles actualizados', 'OK', { duration: 2500 });
            this.ref.close(true);
          },
          error: (err) => {
            this.busy.set(false);
            const msg = err?.error?.message ?? 'Error al guardar roles';
            this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
          },
        });
      return;
    }

    if (this.isEdit && this.user) {
      const body: Record<string, unknown> = {
        fullName: raw.fullName,
        email: raw.email,
        globalRole,
        active: raw.active,
        shopIds,
        shopRole: globalRole,
        modulePermissions,
        ledgerAccountIds: raw.ledgerAccountIds ?? [],
      };
      if (raw.password.trim()) body['password'] = raw.password.trim();
      this.http.patch(`${environment.apiUrl}/users/${this.user.id}?shopId=${shopId}`, body).subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Usuario actualizado', 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'Error al guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
      return;
    }

    if (!raw.password.trim()) {
      this.busy.set(false);
      this.snack.open('Ingresá una contraseña', 'OK', { duration: 2500 });
      return;
    }

    this.http
      .post(`${environment.apiUrl}/users?shopId=${shopId}`, {
        fullName: raw.fullName,
        email: raw.email,
        password: raw.password,
        globalRole,
        shopIds,
        shopRole: globalRole,
        modulePermissions,
        ledgerAccountIds: raw.ledgerAccountIds ?? [],
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Usuario creado', 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'Error al crear';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
