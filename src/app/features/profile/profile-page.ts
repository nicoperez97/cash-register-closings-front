import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { UserAvatarComponent } from '../../shared/components/user-avatar';
import { openUserAvatarPreview } from '../../shared/components/open-user-avatar-preview';
import { userAvatarSrc } from '../../core/utils/drive-url';
import { ShopNavEditorComponent } from '../admin/shop-nav-editor';
import { ShopToolbarEditorComponent } from '../admin/shop-toolbar-editor';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import type { ShopNavConfig } from '../../core/layout/nav-config';
import type { ShopToolbarConfig } from '../../core/layout/toolbar-config';
import {
  EligibleNotification,
  ProfileApiService,
  ShopProfilePreferences,
  UserProfile,
} from './profile-api.service';
import { takeInputFile } from '../../shared/utils/input-file';
import { normalizeLogoImageFile } from '../../shared/utils/normalize-logo-image';

@Component({
  selector: 'app-profile-page',
  imports: [
    PageHeaderComponent,
    UserAvatarComponent,
    ShopNavEditorComponent,
    ShopToolbarEditorComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <app-page-header title="Perfil" [subtitle]="shops.selectedShop()?.name ?? 'Tu cuenta'" />

    <div class="profile-grid" [class.profile-grid--busy]="busy()">
      @if (busy()) {
        <mat-progress-bar class="profile-progress" mode="indeterminate" aria-label="Guardando" />
      }

      <section class="panel-card profile-card profile-account" style="--i: 0">
        <h2 class="section-title">Cuenta</h2>

        <div class="account-identity">
          <div class="photo-block__avatar" [class.photo-block__avatar--pulse]="avatarBusy()">
            <app-user-avatar
              [userId]="profile()?.id ?? auth.currentUser()?.id ?? null"
              [avatarUrl]="profile()?.avatarUrl ?? auth.currentUser()?.avatarUrl ?? null"
              [hasAvatar]="!!(profile()?.hasAvatar || auth.currentUser()?.hasAvatar)"
              [cacheKey]="avatarBust()"
              [previewable]="hasAvatarPhoto()"
              [previewSubtitle]="profile()?.email ?? auth.currentUser()?.email ?? null"
              size="lg"
              [alt]="profile()?.fullName || auth.currentUser()?.fullName || 'Tu perfil'"
            />
          </div>
          <div class="account-identity__meta">
            <strong class="account-identity__name">{{
              profile()?.fullName || auth.currentUser()?.fullName || 'Tu perfil'
            }}</strong>
            <span class="account-identity__email">{{ profile()?.email ?? '' }}</span>
            <div class="photo-actions">
              <input
                #fileInput
                type="file"
                accept="image/*"
                hidden
                (change)="onAvatarFile($event)"
              />
              @if (hasAvatarPhoto()) {
                <button mat-stroked-button type="button" [disabled]="busy()" (click)="viewAvatar()">
                  <mat-icon>zoom_in</mat-icon>
                  Ver foto
                </button>
              }
              <button
                mat-stroked-button
                type="button"
                [disabled]="busy()"
                (click)="fileInput.click()"
              >
                <mat-icon>photo_camera</mat-icon>
                Subir foto
              </button>
              @if (hasAvatarPhoto()) {
                <button mat-button type="button" color="warn" [disabled]="busy()" (click)="removeAvatar()">
                  Quitar
                </button>
              }
            </div>
          </div>
        </div>

        <form class="data-form" [formGroup]="form" (ngSubmit)="saveData()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Nombre</mat-label>
            <input matInput formControlName="fullName" autocomplete="name" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Email</mat-label>
            <input matInput [value]="profile()?.email ?? ''" disabled />
            <mat-hint>Lo cambia un admin</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Teléfono</mat-label>
            <input matInput formControlName="phone" autocomplete="tel" />
          </mat-form-field>
          <div class="data-form__row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Alias</mat-label>
              <input matInput formControlName="bankAlias" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>CBU</mat-label>
              <input matInput formControlName="cbu" inputmode="numeric" />
            </mat-form-field>
          </div>
          <div class="form-actions form-actions--sticky">
            @if (form.pristine && form.valid) {
              <p class="form-actions__hint">Editá un campo para poder guardar</p>
            }
            <button
              mat-flat-button
              color="primary"
              type="submit"
              class="form-actions__save"
              [disabled]="busy() || form.invalid || form.pristine"
            >
              <mat-icon>save</mat-icon>
              Guardar datos
            </button>
          </div>
        </form>
      </section>

      <section class="panel-card profile-card profile-notifs" style="--i: 1">
        <div class="section-head">
          <h2 class="section-title">Notificaciones</h2>
          <span class="section-head__hint">Avisos activos</span>
        </div>
        <p class="text-muted">
          Solo ves avisos que el local te habilitó. Apagá App, Mail o ambos.
        </p>
        @if (!shopId()) {
          <p class="text-muted">Seleccioná un local.</p>
        } @else if (!eligible().length) {
          <p class="text-muted">No tenés notificaciones habilitadas en este local.</p>
        } @else {
          <ul class="notif-list">
            @for (n of eligible(); track n.type; let i = $index) {
              <li
                class="notif-list__item"
                [class.notif-list__item--muted]="channelMuted(n, 'app') && channelMuted(n, 'email')"
                [style.--ni]="i"
              >
                <div class="notif-list__label">
                  <span>{{ n.label }}</span>
                  @if (channelMuted(n, 'app') && channelMuted(n, 'email')) {
                    <span class="notif-list__badge">Silenciada</span>
                  } @else if (channelMuted(n, 'app')) {
                    <span class="notif-list__badge">Sin app</span>
                  } @else if (channelMuted(n, 'email')) {
                    <span class="notif-list__badge">Sin mail</span>
                  }
                </div>
                <div class="notif-list__channels">
                  <label class="notif-list__channel">
                    <mat-slide-toggle
                      [checked]="!channelMuted(n, 'app')"
                      [disabled]="busy()"
                      [attr.aria-label]="'App: ' + n.label"
                      (change)="toggleChannel(n, 'app', !$event.checked)"
                    />
                    App
                  </label>
                  <label class="notif-list__channel">
                    <mat-slide-toggle
                      [checked]="!channelMuted(n, 'email')"
                      [disabled]="busy()"
                      [attr.aria-label]="'Mail: ' + n.label"
                      (change)="toggleChannel(n, 'email', !$event.checked)"
                    />
                    Mail
                  </label>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <section class="panel-card profile-card profile-menu" style="--i: 2">
        <div class="menu-head">
          <div class="menu-head__copy">
            <div class="menu-head__title-row">
              <h2 class="section-title">Menú lateral</h2>
              @if (shopId()) {
                <span
                  class="menu-source"
                  [class.menu-source--mine]="!usingShopMenu()"
                  [matTooltip]="
                    usingShopMenu()
                      ? 'Estás viendo el menú del local. Guardá uno propio para personalizarlo.'
                      : 'Tu menú personal gana sobre el del local en la barra lateral.'
                  "
                >
                  <mat-icon>{{ usingShopMenu() ? 'storefront' : 'person' }}</mat-icon>
                  {{ usingShopMenu() ? 'Menú del local' : 'Tu menú' }}
                </span>
              }
            </div>
            <p class="text-muted">
              Primero se usa tu personalización; si no tenés una, el menú del local.
            </p>
          </div>
          <div class="menu-actions" [class.menu-actions--sticky]="menuDirty()">
            <button
              mat-stroked-button
              type="button"
              [disabled]="busy() || !shopId() || usingShopMenu()"
              (click)="resetMenu()"
            >
              Usar menú del local
            </button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="busy() || !shopId() || !menuDirty()"
              (click)="saveMenu()"
            >
              <mat-icon>save</mat-icon>
              Guardar menú
            </button>
          </div>
        </div>
        @if (shopId()) {
          <app-shop-nav-editor [value]="menuDraft()" (valueChange)="onMenuChange($event)" />
        }
      </section>

      <section class="panel-card profile-card profile-menu" style="--i: 3">
        <div class="menu-head">
          <div class="menu-head__copy">
            <div class="menu-head__title-row">
              <h2 class="section-title">Accesos rápidos</h2>
              @if (shopId()) {
                <span
                  class="menu-source"
                  [class.menu-source--mine]="!usingShopToolbar()"
                  [matTooltip]="
                    usingShopToolbar()
                      ? 'Estás viendo los atajos del local. Guardá los tuyos para personalizarlos.'
                      : 'Tus atajos ganan sobre los del local en la barra superior.'
                  "
                >
                  <mat-icon>{{ usingShopToolbar() ? 'storefront' : 'person' }}</mat-icon>
                  {{ usingShopToolbar() ? 'Atajos del local' : 'Tus atajos' }}
                </span>
              }
            </div>
            <p class="text-muted">
              Primero se usan tus atajos; si no tenés, los del local. Los permisos siguen filtrando.
            </p>
          </div>
          <div class="menu-actions" [class.menu-actions--sticky]="toolbarDirty()">
            <button
              mat-stroked-button
              type="button"
              [disabled]="busy() || !shopId() || usingShopToolbar()"
              (click)="resetToolbar()"
            >
              Usar atajos del local
            </button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="busy() || !shopId() || !toolbarDirty()"
              (click)="saveToolbar()"
            >
              <mat-icon>save</mat-icon>
              Guardar atajos
            </button>
          </div>
        </div>
        @if (shopId()) {
          <app-shop-toolbar-editor
            [value]="toolbarDraft()"
            (valueChange)="onToolbarChange($event)"
          />
        }
      </section>
    </div>
  `,
  styles: `
    .profile-grid {
      position: relative;
      display: grid;
      gap: 1rem;
      align-items: start;
      padding-bottom: max(4.5rem, env(safe-area-inset-bottom, 0px));
    }
    .profile-progress {
      position: sticky;
      top: 0;
      z-index: 5;
      grid-column: 1 / -1;
      border-radius: 999px;
      overflow: hidden;
    }
    @media (min-width: 960px) {
      .profile-grid {
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr);
        padding-bottom: 0;
      }
      .profile-menu {
        grid-column: 1 / -1;
      }
    }
    .profile-card {
      width: 100%;
      margin-top: 0 !important;
      animation: profile-card-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-delay: calc(var(--i, 0) * 55ms);
      transition:
        box-shadow 0.22s ease,
        transform 0.22s ease;
    }
    .profile-account {
      max-width: 40rem;
    }
    @media (min-width: 960px) {
      .profile-account {
        max-width: none;
      }
    }
    @keyframes profile-card-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .section-title {
      margin: 0 0 0.85rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--guy-navy, #003366);
    }
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.35rem;
    }
    .section-head .section-title {
      margin-bottom: 0;
    }
    .section-head__hint {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--guy-muted, #666);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .text-muted {
      color: var(--guy-muted, #666);
      font-size: 0.9rem;
      margin: 0 0 0.75rem;
      line-height: 1.4;
    }
    .account-identity {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid color-mix(in srgb, var(--guy-border, #e5e5e5) 80%, transparent);
    }
    .account-identity__meta {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 0;
      flex: 1 1 auto;
    }
    .account-identity__name {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--guy-navy, #003366);
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .account-identity__email {
      font-size: 0.82rem;
      color: var(--guy-muted, #666);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 0.35rem;
    }
    .photo-block__avatar {
      flex-shrink: 0;
      display: grid;
      place-items: center;
      transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .photo-block__avatar--pulse {
      animation: avatar-pulse 0.9s ease infinite;
    }
    @keyframes avatar-pulse {
      0%,
      100% {
        transform: scale(1);
        filter: brightness(1);
      }
      50% {
        transform: scale(1.04);
        filter: brightness(1.06);
      }
    }
    .photo-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
    }
    .photo-actions button {
      min-height: 2.5rem;
    }
    .data-form {
      display: grid;
      gap: 0.85rem;
      min-width: 0;
    }
    .data-form__row {
      display: grid;
      gap: 0.85rem;
    }
    @media (min-width: 480px) {
      .data-form__row {
        grid-template-columns: 1fr 1fr;
      }
    }
    .form-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.65rem;
      margin-top: 0.25rem;
    }
    .form-actions__hint {
      margin: 0;
      font-size: 0.82rem;
      color: var(--guy-muted, #666);
    }
    .form-actions__save {
      min-width: 9.5rem;
      min-height: 2.75rem;
      margin-left: auto;
    }
    .form-actions__save mat-icon {
      margin-right: 0.35rem;
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
    }
    @media (max-width: 719px) {
      .account-identity {
        align-items: flex-start;
      }
      .form-actions--sticky {
        position: sticky;
        bottom: max(0.5rem, env(safe-area-inset-bottom, 0px));
        z-index: 2;
        margin: 0.35rem -0.25rem 0;
        padding: 0.65rem 0.25rem 0.15rem;
        background: linear-gradient(
          to top,
          var(--guy-card, #fff) 72%,
          color-mix(in srgb, var(--guy-card, #fff) 0%, transparent)
        );
      }
      .form-actions__hint {
        width: 100%;
      }
      .form-actions__save {
        width: 100%;
        margin-left: 0;
      }
    }
    .notif-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .notif-list__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid color-mix(in srgb, var(--guy-border, #e5e5e5) 85%, transparent);
      min-height: 3rem;
      animation: notif-row-in 0.32s ease both;
      animation-delay: calc(var(--ni, 0) * 28ms);
      transition:
        opacity 0.22s ease,
        background 0.22s ease;
    }
    @keyframes notif-row-in {
      from {
        opacity: 0;
        transform: translateX(-6px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    .notif-list__item:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .notif-list__item--muted .notif-list__label > span:first-child {
      color: var(--guy-muted, #666);
    }
    .notif-list__label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.55rem;
      min-width: 0;
      font-size: 0.92rem;
      font-weight: 500;
    }
    .notif-list__channels {
      display: flex;
      gap: 0.85rem;
      align-items: flex-end;
      flex: 0 0 auto;
    }
    .notif-list__channel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
      font-size: 0.68rem;
      font-weight: 750;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #666);
      cursor: pointer;
    }
    .notif-list__badge {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--guy-muted, #666);
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--guy-border, #e5e5e5) 55%, transparent);
    }
    .menu-head {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }
    .menu-head__copy {
      flex: 1 1 14rem;
      min-width: 0;
    }
    .menu-head__title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.55rem 0.75rem;
      margin-bottom: 0.35rem;
    }
    .menu-head__title-row .section-title {
      margin: 0;
    }
    .menu-head .text-muted {
      margin-bottom: 0;
    }
    .menu-source {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      background: color-mix(in srgb, var(--guy-border, #d7e0d9) 55%, transparent);
      color: var(--guy-muted, #5f6f76);
      transition:
        background 0.22s ease,
        color 0.22s ease;
    }
    .menu-source mat-icon {
      font-size: 0.95rem;
      width: 0.95rem;
      height: 0.95rem;
    }
    .menu-source--mine {
      background: color-mix(in srgb, var(--guy-accent, #2e7d32) 14%, transparent);
      color: var(--guy-accent, #2e7d32);
    }
    .menu-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .menu-actions button {
      min-height: 2.75rem;
    }
    .menu-actions button mat-icon {
      margin-right: 0.3rem;
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }
    @media (max-width: 719px) {
      .menu-actions {
        width: 100%;
      }
      .menu-actions button {
        flex: 1 1 auto;
      }
      .menu-actions--sticky {
        position: sticky;
        top: 0.35rem;
        z-index: 2;
        padding: 0.45rem 0;
        background: color-mix(in srgb, var(--guy-card, #fff) 92%, transparent);
        backdrop-filter: blur(6px);
        animation: sticky-bar-in 0.25s ease both;
      }
      @keyframes sticky-bar-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .profile-card,
      .notif-list__item,
      .photo-block__avatar--pulse,
      .menu-actions--sticky {
        animation: none !important;
      }
    }
  `,
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly shops = inject(ShopContextService);
  private readonly api = inject(ProfileApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly profile = signal<UserProfile | null>(null);
  readonly prefs = signal<ShopProfilePreferences | null>(null);
  readonly busy = signal(false);
  readonly avatarBusy = signal(false);
  readonly avatarBust = signal(Date.now());
  readonly menuDraft = signal<ShopNavConfig | null>(null);
  readonly menuDirty = signal(false);
  readonly toolbarDraft = signal<ShopToolbarConfig | null>(null);
  readonly toolbarDirty = signal(false);

  readonly shopId = this.shops.selectedShopId;
  readonly eligible = computed(() => this.prefs()?.eligibleNotifications ?? []);
  readonly usingShopMenu = computed(() => {
    const p = this.prefs();
    if (!p) return true;
    return p.usingShopMenuDefault || p.navConfig == null;
  });
  readonly usingShopToolbar = computed(() => {
    const p = this.prefs();
    if (!p) return true;
    return p.usingShopToolbarDefault === true || p.toolbarConfig == null;
  });

  hasAvatarPhoto(): boolean {
    const p = this.profile();
    const u = this.auth.currentUser();
    return !!(p?.hasAvatar || p?.avatarUrl || u?.hasAvatar || u?.avatarUrl);
  }

  viewAvatar(): void {
    const p = this.profile();
    const u = this.auth.currentUser();
    const src = userAvatarSrc(
      {
        id: p?.id ?? u?.id ?? null,
        avatarUrl: p?.avatarUrl ?? u?.avatarUrl ?? null,
        hasAvatar: this.hasAvatarPhoto(),
      },
      this.avatarBust(),
    );
    if (!src) return;
    openUserAvatarPreview(
      this.dialog,
      {
        title: p?.fullName || u?.fullName || 'Tu perfil',
        src,
        subtitle: p?.email ?? u?.email ?? null,
      },
      'Foto de perfil',
    );
  }

  readonly form = new FormGroup({
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    phone: new FormControl('', { nonNullable: true }),
    bankAlias: new FormControl('', { nonNullable: true }),
    cbu: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    effect(() => {
      this.shopId();
      this.reload();
    });
  }

  private reload(): void {
    this.busy.set(true);
    this.api.get().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.form.reset({
          fullName: p.fullName ?? '',
          phone: p.phone ?? '',
          bankAlias: p.bankAlias ?? '',
          cbu: p.cbu ?? '',
        });
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo cargar el perfil', 'OK', { duration: 3500 });
      },
    });
    const shopId = this.shopId();
    if (!shopId) {
      this.prefs.set(null);
      this.menuDraft.set(null);
      this.toolbarDraft.set(null);
      return;
    }
    this.api.getPreferences(shopId).subscribe({
      next: (prefs) => {
        this.prefs.set(prefs);
        this.menuDraft.set(prefs.navConfig ?? prefs.shopNavConfig ?? null);
        this.menuDirty.set(false);
        this.toolbarDraft.set(prefs.toolbarConfig ?? prefs.shopToolbarConfig ?? null);
        this.toolbarDirty.set(false);
      },
      error: () => this.prefs.set(null),
    });
  }

  /** Aplica prefs al shop activo para que sidebar/toolbar usen overrides de inmediato. */
  private syncShopFromPrefs(p: ShopProfilePreferences): void {
    const shop = this.shops.selectedShop();
    if (!shop || shop.id !== p.shopId) return;
    const next = {
      ...shop,
      myNavConfig: p.navConfig ?? null,
      myToolbarConfig: p.toolbarConfig ?? null,
      mutedNotificationTypes: p.mutedNotificationTypes ?? [],
    };
    this.shops.upsertShop(next);
    const user = this.auth.currentUser();
    if (!user?.shops?.length) return;
    this.auth.patchCurrentUser({
      shops: user.shops.map((s) => (s.id === next.id ? { ...s, ...next } : s)),
    });
  }

  private syncUserFromProfile(p: UserProfile): void {
    this.auth.patchCurrentUser({
      fullName: p.fullName,
      phone: p.phone ?? null,
      bankAlias: p.bankAlias ?? null,
      cbu: p.cbu ?? null,
      avatarUrl: p.avatarUrl ?? null,
      hasAvatar: !!p.hasAvatar || !!p.avatarUrl,
    });
  }

  saveData(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    this.busy.set(true);
    this.api
      .update({
        fullName: raw.fullName.trim(),
        phone: raw.phone.trim() || null,
        bankAlias: raw.bankAlias.trim() || null,
        cbu: raw.cbu.trim() || null,
      })
      .subscribe({
        next: (p) => {
          this.profile.set(p);
          this.form.markAsPristine();
          this.syncUserFromProfile(p);
          this.busy.set(false);
          this.auth.scheduleRefreshMe(0);
          this.snack.open('Datos guardados', 'OK', { duration: 2500 });
        },
        error: () => {
          this.busy.set(false);
          this.snack.open('No se pudieron guardar los datos', 'OK', { duration: 3500 });
        },
      });
  }

  async onAvatarFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    // Safari/iOS: materializar bytes antes de vaciar el input (si no, el multipart llega truncado).
    const picked = await takeInputFile(input);
    if (!picked) return;
    const type = (picked.type || '').toLowerCase();
    if (type && !type.startsWith('image/')) {
      this.snack.open('Elegí una imagen (foto de la cámara o la galería)', 'OK', { duration: 3500 });
      return;
    }
    let file = picked;
    try {
      file = await normalizeLogoImageFile(picked, { maxPx: 1024, quality: 0.88 });
    } catch {
      // Si falla la conversión (p. ej. HEIC raro), subimos el original materializado.
    }
    this.busy.set(true);
    this.avatarBusy.set(true);
    this.api.uploadAvatar(file).subscribe({
      next: (p) => {
        this.profile.set(p);
        this.avatarBust.set(Date.now());
        this.syncUserFromProfile(p);
        this.busy.set(false);
        this.avatarBusy.set(false);
        this.auth.scheduleRefreshMe(0);
        this.snack.open('Foto actualizada', 'OK', { duration: 2500 });
      },
      error: (err) => {
        this.busy.set(false);
        this.avatarBusy.set(false);
        const msg = err?.error?.message ?? 'No se pudo subir la foto';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : String(msg), 'OK', {
          duration: 4000,
        });
      },
    });
  }

  removeAvatar(): void {
    this.busy.set(true);
    this.avatarBusy.set(true);
    this.api.removeAvatar().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.avatarBust.set(Date.now());
        this.syncUserFromProfile(p);
        this.busy.set(false);
        this.avatarBusy.set(false);
        this.auth.scheduleRefreshMe(0);
        this.snack.open('Foto eliminada', 'OK', { duration: 2500 });
      },
      error: () => {
        this.busy.set(false);
        this.avatarBusy.set(false);
        this.snack.open('No se pudo quitar la foto', 'OK', { duration: 3500 });
      },
    });
  }

  channelMuted(n: EligibleNotification, channel: 'app' | 'email'): boolean {
    if (channel === 'app') return n.mutedApp ?? n.muted;
    return n.mutedEmail ?? n.muted;
  }

  toggleChannel(n: EligibleNotification, channel: 'app' | 'email', muted: boolean): void {
    const shopId = this.shopId();
    const prefs = this.prefs();
    if (!shopId || !prefs) return;
    const app: string[] = [];
    const email: string[] = [];
    for (const row of this.eligible()) {
      const appMuted = row.type === n.type ? (channel === 'app' ? muted : this.channelMuted(row, 'app')) : this.channelMuted(row, 'app');
      const emailMuted = row.type === n.type ? (channel === 'email' ? muted : this.channelMuted(row, 'email')) : this.channelMuted(row, 'email');
      if (appMuted) app.push(row.type);
      if (emailMuted) email.push(row.type);
    }
    this.busy.set(true);
    this.api
      .updatePreferences(shopId, {
        mutedAppNotificationTypes: app,
        mutedEmailNotificationTypes: email,
      })
      .subscribe({
        next: (p) => {
          this.prefs.set(p);
          this.syncShopFromPrefs(p);
          this.busy.set(false);
          this.auth.scheduleRefreshMe(0);
        },
        error: () => {
          this.busy.set(false);
          this.snack.open('No se pudo actualizar la notificación', 'OK', { duration: 3500 });
        },
      });
  }

  onMenuChange(cfg: ShopNavConfig | null): void {
    this.menuDraft.set(cfg);
    this.menuDirty.set(true);
  }

  saveMenu(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.busy.set(true);
    this.api.updatePreferences(shopId, { navConfig: this.menuDraft() }).subscribe({
      next: (p) => {
        this.prefs.set(p);
        this.menuDraft.set(p.navConfig ?? p.shopNavConfig ?? null);
        this.menuDirty.set(false);
        this.syncShopFromPrefs(p);
        this.busy.set(false);
        this.auth.scheduleRefreshMe(0);
        this.snack.open('Menú guardado · ya se usa en la barra lateral', 'OK', { duration: 2800 });
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo guardar el menú', 'OK', { duration: 3500 });
      },
    });
  }

  resetMenu(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.busy.set(true);
    this.api.updatePreferences(shopId, { navConfig: null }).subscribe({
      next: (p) => {
        this.prefs.set(p);
        this.menuDraft.set(p.shopNavConfig ?? null);
        this.menuDirty.set(false);
        this.syncShopFromPrefs(p);
        this.busy.set(false);
        this.auth.scheduleRefreshMe(0);
        this.snack.open('Volviste al menú del local', 'OK', { duration: 2500 });
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo restablecer el menú', 'OK', { duration: 3500 });
      },
    });
  }

  onToolbarChange(cfg: ShopToolbarConfig | null): void {
    this.toolbarDraft.set(cfg);
    this.toolbarDirty.set(true);
  }

  saveToolbar(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const sent = this.toolbarDraft();
    this.busy.set(true);
    this.api.updatePreferences(shopId, { toolbarConfig: sent }).subscribe({
      next: (p) => {
        this.prefs.set(p);
        // null intencional = “usar del local”. Cualquier otro envío debe volver persistido.
        if (sent != null && p.toolbarConfig == null) {
          this.toolbarDirty.set(true);
          this.busy.set(false);
          this.snack.open('No se pudieron guardar los atajos. Probá de nuevo.', 'OK', {
            duration: 4000,
          });
          return;
        }
        this.toolbarDraft.set(
          p.toolbarConfig != null ? p.toolbarConfig : (p.shopToolbarConfig ?? null),
        );
        this.toolbarDirty.set(false);
        this.syncShopFromPrefs(p);
        this.busy.set(false);
        this.auth.scheduleRefreshMe(0);
        this.snack.open(
          sent == null
            ? 'Volviste a los atajos del local'
            : 'Atajos guardados · ya se usan en la barra',
          'OK',
          { duration: 2800 },
        );
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudieron guardar los atajos', 'OK', { duration: 3500 });
      },
    });
  }

  resetToolbar(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.busy.set(true);
    this.api.updatePreferences(shopId, { toolbarConfig: null }).subscribe({
      next: (p) => {
        this.prefs.set(p);
        this.toolbarDraft.set(p.shopToolbarConfig ?? null);
        this.toolbarDirty.set(false);
        this.syncShopFromPrefs(p);
        this.busy.set(false);
        this.auth.scheduleRefreshMe(0);
        this.snack.open('Volviste a los atajos del local', 'OK', { duration: 2500 });
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudieron restablecer los atajos', 'OK', { duration: 3500 });
      },
    });
  }
}
