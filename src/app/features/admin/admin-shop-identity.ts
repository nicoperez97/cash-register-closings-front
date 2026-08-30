import { Component, input, output } from '@angular/core';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { UserAvatarComponent } from '../../shared/components/user-avatar';

export interface AdminShopUserOption {
  id: string;
  fullName: string;
  email: string;
  active?: boolean;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
}

export interface AdminShopEmailTypeOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-admin-shop-identity',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatIconModule,
    UserAvatarComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Identidad</h2>
      <p class="text-muted small mb-3">Nombre visible y datos de contacto del local.</p>
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
            [placeholder]="
              emailSmtpConfigured()
                ? '•••••••• (dejar vacío para no cambiar)'
                : 'Contraseña de app de Gmail'
            "
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
            <button mat-stroked-button type="button" (click)="clearSmtp.emit()">
              <mat-icon>link_off</mat-icon>
              Quitar contraseña SMTP
            </button>
          </div>
        }
      </div>
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Notificaciones por correo</h2>
      <p class="text-muted small mb-3">
        Activá el envío de mails, elegí qué avisos se mandan y a qué usuarios del local.
      </p>
      <mat-slide-toggle formControlName="emailNotificationsEnabled" class="mb-3">
        Enviar notificaciones por correo
      </mat-slide-toggle>
      @if (emailNotificationsOn()) {
        <div class="shop-admin__email-grid">
          <div>
            <h3 class="shop-admin__op-title">Qué mails se envían</h3>
            <div class="shop-admin__check-list">
              <button mat-stroked-button type="button" class="mb-2" (click)="toggleAllEmailTypes.emit()">
                {{ allEmailTypesSelected() ? 'Desmarcar todos' : 'Marcar todos' }}
              </button>
              @for (t of emailTypeOptions(); track t.value) {
                <mat-checkbox
                  [checked]="isEmailTypeSelected()(t.value)"
                  (change)="toggleEmailType.emit(t.value)"
                >
                  {{ t.label }}
                </mat-checkbox>
              }
            </div>
          </div>
          <div>
            <h3 class="shop-admin__op-title">A quién</h3>
            <div class="shop-admin__check-list">
              <button mat-stroked-button type="button" class="mb-2" (click)="toggleAllEmailUsers.emit()">
                {{ allEmailUsersSelected() ? 'Desmarcar todos' : 'Marcar todos' }}
              </button>
              @if (!shopUsers().length) {
                <p class="text-muted small">No hay usuarios en este local.</p>
              }
              @for (u of shopUsers(); track u.id) {
                <mat-checkbox
                  class="shop-admin__user-check"
                  [checked]="isEmailUserSelected()(u.id)"
                  (change)="toggleEmailUser.emit(u.id)"
                >
                  <span class="shop-admin__user-row">
                    <app-user-avatar
                      [userId]="u.id"
                      [avatarUrl]="u.avatarUrl ?? null"
                      [hasAvatar]="!!u.hasAvatar || !!u.avatarUrl"
                      size="sm"
                      [alt]="u.fullName"
                    />
                    <span class="shop-admin__user-copy">
                      <span>{{ u.fullName }}</span>
                      <span class="text-muted small">{{ u.email }}</span>
                    </span>
                  </span>
                </mat-checkbox>
              }
            </div>
          </div>
        </div>
      }
    </section>

    <section class="panel-card guy-form-section shop-admin__appearance">
      <h2 class="guy-section-title">Apariencia</h2>
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
            (change)="logoFileSelected.emit($event)"
          />
          <button
            mat-stroked-button
            type="button"
            [disabled]="logoUploading() || !shopId()"
            (click)="logoFile.click()"
          >
            <mat-icon>upload</mat-icon>
            {{ logoUploading() ? 'Subiendo…' : 'Subir desde archivos' }}
          </button>
          @if (hasLogo()) {
            <button mat-stroked-button type="button" (click)="clearLogo.emit()">
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
              [value]="accentPicker()"
              (input)="accentPickerChange.emit($event)"
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
              [value]="accentSecondaryPicker()"
              (input)="accentSecondaryPickerChange.emit($event)"
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
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopIdentityComponent {
  readonly shopId = input<string | null>(null);
  readonly shopUsers = input<AdminShopUserOption[]>([]);
  readonly emailTypeOptions = input<readonly AdminShopEmailTypeOption[]>([]);
  readonly emailSmtpConfigured = input(false);
  readonly emailNotificationsOn = input(false);
  readonly allEmailTypesSelected = input(false);
  readonly allEmailUsersSelected = input(false);
  readonly isEmailTypeSelected = input<(type: string) => boolean>(() => false);
  readonly isEmailUserSelected = input<(id: string) => boolean>(() => false);
  readonly uploadedLogoPath = input<string | null>(null);
  readonly logoUploading = input(false);
  readonly hasLogo = input(false);
  readonly accentPicker = input('#2E7D32');
  readonly accentSecondaryPicker = input('#F9A825');
  readonly liveAccent = input('#2E7D32');
  readonly liveAccentSecondary = input('#F9A825');

  readonly clearSmtp = output<void>();
  readonly toggleEmailType = output<string>();
  readonly toggleAllEmailTypes = output<void>();
  readonly toggleEmailUser = output<string>();
  readonly toggleAllEmailUsers = output<void>();
  readonly logoFileSelected = output<Event>();
  readonly clearLogo = output<void>();
  readonly accentPickerChange = output<Event>();
  readonly accentSecondaryPickerChange = output<Event>();
}
