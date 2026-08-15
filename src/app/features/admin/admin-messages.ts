import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { environment } from '../../../environments/environment';
import { usePageRefresh } from '../../core/page-refresh.service';
import {
  EMAIL_MESSAGE_TYPE_OPTIONS,
  EmailMessageTemplates,
} from './email-message-types';

@Component({
  selector: 'app-admin-messages',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Mensajes"
      [subtitle]="shops.selectedShop()?.name ?? 'Textos de email del local'"
    />

    <p class="msg-hint">
      Vacío = texto automático. Placeholders:
      <code>{{ placeholders }}</code>
    </p>

    <form class="msg-page" [formGroup]="form" (ngSubmit)="save()">
      <section class="panel-card">
        <h2>Al equipo</h2>
        @for (opt of staffOptions; track opt.value) {
          <article class="msg-card">
            <h3>{{ opt.label }}</h3>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Asunto</mat-label>
              <input matInput [formControlName]="opt.value + '_subject'" [placeholder]="opt.defaultSubject" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuerpo</mat-label>
              <textarea
                matInput
                rows="4"
                [formControlName]="opt.value + '_body'"
                [placeholder]="opt.defaultBody"
              ></textarea>
            </mat-form-field>
          </article>
        }
      </section>

      <section class="panel-card">
        <h2>Al comensal</h2>
        @for (opt of guestOptions; track opt.value) {
          <article class="msg-card">
            <h3>{{ opt.label }}</h3>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Asunto</mat-label>
              <input matInput [formControlName]="opt.value + '_subject'" [placeholder]="opt.defaultSubject" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuerpo</mat-label>
              <textarea
                matInput
                rows="5"
                [formControlName]="opt.value + '_body'"
                [placeholder]="opt.defaultBody"
              ></textarea>
            </mat-form-field>
          </article>
        }
      </section>

      <div class="msg-actions">
        <button mat-flat-button color="primary" type="submit" [disabled]="saving() || loading()">
          <mat-icon>save</mat-icon>
          {{ saving() ? 'Guardando…' : 'Guardar mensajes' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .msg-hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .msg-hint code {
      font-size: 0.82rem;
      margin-right: 0.35rem;
    }
    .msg-page {
      display: grid;
      gap: 1rem;
    }
    .msg-page h2 {
      margin: 0 0 0.85rem;
      font-size: 1rem;
      color: var(--guy-navy, #003366);
    }
    .msg-card {
      display: grid;
      gap: 0.55rem;
      margin-bottom: 1rem;
    }
    .msg-card h3 {
      margin: 0;
      font-size: 0.88rem;
      font-weight: 700;
    }
    .msg-actions {
      display: flex;
      justify-content: flex-end;
      position: sticky;
      bottom: 0.75rem;
    }
  `,
})
export class AdminMessagesPage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly shops = inject(ShopContextService);

  readonly staffOptions = EMAIL_MESSAGE_TYPE_OPTIONS.filter((o) => o.group === 'staff');
  readonly guestOptions = EMAIL_MESSAGE_TYPE_OPTIONS.filter((o) => o.group === 'guest');
  readonly placeholders = '{shop} {guest} {name} {detail} {title} {body}';

  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group(
    Object.fromEntries(
      EMAIL_MESSAGE_TYPE_OPTIONS.flatMap((o) => [
        [`${o.value}_subject`, this.fb.nonNullable.control('')],
        [`${o.value}_body`, this.fb.nonNullable.control('')],
      ]),
    ),
  );

  readonly shopId = computed(() => this.shops.selectedShopId());

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) return;
      this.reload();
    });
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.http.get<{ emailMessageTemplates?: EmailMessageTemplates | null }>(
      `${environment.apiUrl}/shops/${shopId}`,
    ).subscribe({
      next: (shop) => {
        this.loading.set(false);
        const templates = shop.emailMessageTemplates ?? {};
        const patch: Record<string, string> = {};
        for (const opt of EMAIL_MESSAGE_TYPE_OPTIONS) {
          patch[`${opt.value}_subject`] = templates[opt.value]?.subject ?? '';
          patch[`${opt.value}_body`] = templates[opt.value]?.body ?? '';
        }
        this.form.patchValue(patch);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los mensajes', 'OK', { duration: 3000 });
      },
    });
  }

  save(): void {
    const shopId = this.shopId();
    if (!shopId || this.saving()) return;
    const raw = this.form.getRawValue() as Record<string, string>;
    const emailMessageTemplates: EmailMessageTemplates = {};
    for (const opt of EMAIL_MESSAGE_TYPE_OPTIONS) {
      const subject = String(raw[`${opt.value}_subject`] ?? '').trim();
      const body = String(raw[`${opt.value}_body`] ?? '').trim();
      if (!subject && !body) continue;
      emailMessageTemplates[opt.value] = {
        ...(subject ? { subject } : {}),
        ...(body ? { body } : {}),
      };
    }
    this.saving.set(true);
    this.http
      .patch(`${environment.apiUrl}/shops/${shopId}`, { emailMessageTemplates })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('Mensajes guardados', 'OK', { duration: 2200 });
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }
}
