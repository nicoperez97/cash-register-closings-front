import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { normalizeLogoUrl } from '../../core/utils/drive-url';
import {
  ReservationArea,
  ReservationsApiService,
  WaitingListRow,
} from './reservations-api.service';

@Component({
  selector: 'app-waiting-list-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatButtonToggleModule,
  ],
  template: `
    <div class="wait">
      <header class="wait-hero">
        <div class="wait-hero__glow" aria-hidden="true"></div>
        @if (logoUrl()) {
          <img class="wait-hero__logo" [src]="logoUrl()!" [alt]="shopName()" />
        }
        <p class="wait-hero__eyebrow">Lista de espera</p>
        <h1 class="wait-hero__brand">{{ shopName() }}</h1>
        <p class="wait-hero__stats">
          <span class="wait-hero__pulse" aria-hidden="true"></span>
          <span>
            <strong>{{ waiting().length }}</strong> en espera ·
            <strong>{{ totalGuests() }}</strong> pers. ·
            <strong>{{ insideGuests() }}</strong> adentro ·
            <strong>{{ outsideGuests() }}</strong> afuera
          </span>
        </p>
        @if (shopSlug()) {
          <div class="wait-hero__actions">
            <a class="wait-public-btn" [href]="publicUrl()" target="_blank" rel="noopener">
              <mat-icon>open_in_new</mat-icon>
              Pantalla pública
            </a>
            <button type="button" class="wait-public-btn wait-public-btn--ghost" (click)="copyPublicUrl()">
              <mat-icon>content_copy</mat-icon>
              Copiar link
            </button>
          </div>
        }
      </header>

      @if (canManage()) {
        <form class="wait-compose" [formGroup]="waitingForm" (ngSubmit)="saveWaiting()">
          <p class="wait-compose__label">Anotar mesa</p>
          <div class="wait-compose__row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wait-compose__name">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="guestName" autocomplete="name" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wait-compose__party">
              <mat-label>Pers.</mat-label>
              <input
                matInput
                type="number"
                min="1"
                inputmode="numeric"
                pattern="[0-9]*"
                formControlName="partySize"
              />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wait-compose__phone">
              <mat-label>Teléfono</mat-label>
              <input matInput formControlName="phone" placeholder="59899…" inputmode="tel" autocomplete="tel" />
            </mat-form-field>
            <mat-button-toggle-group
              formControlName="area"
              class="wait-area-toggle"
              hideSingleSelectionIndicator
            >
              <mat-button-toggle value="INSIDE">Adentro</mat-button-toggle>
              <mat-button-toggle value="OUTSIDE">Afuera</mat-button-toggle>
            </mat-button-toggle-group>
            <button
              mat-flat-button
              color="primary"
              type="submit"
              class="wait-compose__submit"
              [disabled]="waitingForm.invalid"
            >
              <mat-icon>person_add</mat-icon>
              Anotar
            </button>
          </div>
        </form>
      }

      <section class="wait-queue" aria-label="Cola de espera">
        @for (w of waiting(); track w.id; let i = $index) {
          <article class="wait-item" [class.wait-item--out]="w.area === 'OUTSIDE'" [style.--i]="i">
            <span class="wait-item__pos">{{ i + 1 }}</span>
            <div class="wait-item__main">
              <strong>{{ w.guestName }}</strong>
              <span>
                {{ w.partySize }} {{ w.partySize === 1 ? 'persona' : 'personas' }}
                · {{ w.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}
              </span>
            </div>
            <a
              class="wait-item__wa"
              [href]="w.whatsappUrl || whatsappHref(w.phone)"
              target="_blank"
              rel="noopener"
              [class.wait-item__wa--disabled]="!hasPhone(w.phone)"
              [attr.aria-disabled]="!hasPhone(w.phone)"
              (click)="!hasPhone(w.phone) && $event.preventDefault()"
            >
              <mat-icon>chat</mat-icon>
              WhatsApp
            </a>
            @if (canManage()) {
              <div class="wait-item__actions">
                <button mat-stroked-button type="button" (click)="seatWaiting(w)">Sentar</button>
                <button mat-icon-button type="button" aria-label="Quitar" (click)="deleteWaiting(w)">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
            }
          </article>
        } @empty {
          <div class="wait-empty">
            <mat-icon>hourglass_empty</mat-icon>
            <strong>Nadie en espera</strong>
            <p>Cuando llegue alguien, anotalo arriba y avisale por WhatsApp.</p>
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .wait {
        max-width: 42rem;
        margin: 0 auto;
        padding-bottom: 2rem;
      }

      .wait-hero {
        position: relative;
        text-align: center;
        padding: 1.35rem 1rem 1.5rem;
        margin-bottom: 1rem;
        border-radius: 22px;
        overflow: hidden;
        background:
          radial-gradient(ellipse 70% 80% at 50% -20%, color-mix(in srgb, var(--guy-green, #2e7d32) 28%, transparent), transparent 65%),
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--guy-navy, #003366) 92%, #000) 0%,
            #0f1a14 55%,
            #122018 100%
          );
        color: #f3f7f4;
        animation: wait-rise 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .wait-hero__glow {
        position: absolute;
        inset: 0 15% auto;
        height: 6rem;
        background: radial-gradient(circle, color-mix(in srgb, var(--guy-green, #2e7d32) 45%, transparent), transparent 70%);
        filter: blur(28px);
        pointer-events: none;
      }

      .wait-hero__logo {
        position: relative;
        width: 5.5rem;
        height: 5.5rem;
        object-fit: contain;
        border-radius: 18px;
        margin-bottom: 0.75rem;
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
      }

      .wait-hero__eyebrow {
        position: relative;
        margin: 0 0 0.3rem;
        font-size: 0.72rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-weight: 700;
        color: color-mix(in srgb, var(--guy-green, #2e7d32) 70%, #fff);
      }

      .wait-hero__brand {
        position: relative;
        margin: 0;
        font-size: clamp(1.85rem, 6vw, 2.6rem);
        font-weight: 750;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }

      .wait-hero__stats {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        margin: 0.85rem auto 0;
        max-width: 22rem;
        font-size: 0.88rem;
        line-height: 1.35;
        color: #b7c4bb;
        text-align: center;
      }

      .wait-hero__stats strong {
        color: #fff;
        font-variant-numeric: tabular-nums;
      }

      .wait-hero__actions {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 1rem;
      }

      .wait-public-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        min-height: 2.4rem;
        padding: 0.45rem 1rem;
        border-radius: 999px;
        border: 1px solid transparent;
        background: #fff;
        color: #0f2a1a;
        text-decoration: none;
        font: inherit;
        font-size: 0.86rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        transition:
          transform 140ms ease,
          background 140ms ease,
          border-color 140ms ease;
      }

      .wait-public-btn mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
        color: inherit;
      }

      .wait-public-btn:hover {
        transform: translateY(-1px);
        background: #f3f7f4;
      }

      .wait-public-btn--ghost {
        background: rgba(255, 255, 255, 0.08);
        color: #f3f7f4;
        border-color: rgba(255, 255, 255, 0.28);
        box-shadow: none;
      }

      .wait-public-btn--ghost:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.45);
      }

      .wait-hero__pulse {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 999px;
        background: #3dba6e;
        box-shadow: 0 0 0 0 rgba(61, 186, 110, 0.5);
        animation: wait-pulse 1.6s ease-out infinite;
      }

      .wait-compose {
        margin-bottom: 1.1rem;
        padding: 0.95rem 1rem 1.05rem;
        border-radius: 18px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: var(--guy-card, #fff);
        box-shadow: var(--guy-shadow, 0 8px 24px rgba(0, 51, 102, 0.06));
        animation: wait-rise 520ms cubic-bezier(0.22, 1, 0.36, 1) 60ms both;
      }

      .wait-compose__label {
        margin: 0 0 0.55rem;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }

      .wait-compose__row {
        display: grid;
        grid-template-columns: 1.2fr 4.5rem 1fr auto auto;
        gap: 0.5rem;
        align-items: center;
      }

      .wait-area-toggle {
        width: 100%;
        min-width: 10rem;
        display: inline-flex !important;
        border-radius: 12px;
        overflow: hidden;
      }

      .wait-area-toggle .mat-button-toggle {
        flex: 1 1 0;
      }

      .wait-area-toggle .mat-button-toggle-button {
        width: 100%;
      }

      .wait-area-toggle .mat-button-toggle-label-content {
        width: 100%;
        text-align: center;
        padding: 0.45rem 0.55rem !important;
      }

      @media (max-width: 720px) {
        .wait-compose__row {
          grid-template-columns: 1fr 5rem;
        }

        .wait-compose__phone,
        .wait-area-toggle,
        .wait-compose__submit {
          grid-column: 1 / -1;
        }
      }

      .wait-compose__submit {
        height: 3rem;
        white-space: nowrap;
      }

      .wait-queue {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .wait-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 0.9rem;
        border-radius: 16px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: var(--guy-card, #fff);
        animation: wait-rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        animation-delay: calc(var(--i, 0) * 45ms);
      }

      .wait-item--out {
        border-color: color-mix(in srgb, #ef6c00 35%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, #ef6c00 6%, var(--guy-card, #fff));
      }

      .wait-item__pos {
        display: grid;
        place-items: center;
        width: 2.35rem;
        height: 2.35rem;
        border-radius: 999px;
        flex-shrink: 0;
        font-size: 1rem;
        font-weight: 750;
        color: #fff;
        background: linear-gradient(145deg, var(--guy-navy, #003366), #0a4a2a);
      }

      .wait-item__main {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
        flex: 1;
      }

      .wait-item__main strong {
        font-size: 1.05rem;
        letter-spacing: -0.01em;
        color: var(--guy-navy, #003366);
      }

      .wait-item__main span {
        font-size: 0.82rem;
        color: var(--guy-muted, #5f6f76);
      }

      .wait-item__wa {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.45rem 0.85rem;
        border-radius: 999px;
        background: #25d366;
        color: #083b1f;
        text-decoration: none;
        font-weight: 750;
        font-size: 0.88rem;
        white-space: nowrap;
        transition: transform 160ms ease, filter 160ms ease;
      }

      .wait-item__wa:hover {
        transform: translateY(-1px);
        filter: brightness(1.05);
      }

      .wait-item__wa--disabled {
        opacity: 0.35;
        pointer-events: none;
        filter: grayscale(0.6);
      }

      .wait-item__wa mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }

      .wait-item__actions {
        display: flex;
        align-items: center;
        gap: 0.15rem;
      }

      @media (max-width: 560px) {
        .wait-item {
          flex-wrap: wrap;
        }

        .wait-item__wa {
          order: 3;
          flex: 1 1 auto;
          justify-content: center;
        }

        .wait-item__actions {
          order: 4;
          width: 100%;
          justify-content: space-between;
        }
      }

      .wait-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.35rem;
        padding: 2.5rem 1rem;
        text-align: center;
        color: var(--guy-muted, #5f6f76);
        border-radius: 18px;
        border: 1px dashed var(--guy-border, #d7e0d9);
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, #fff);
        animation: wait-rise 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .wait-empty mat-icon {
        font-size: 2.2rem;
        width: 2.2rem;
        height: 2.2rem;
        margin-bottom: 0.25rem;
        color: var(--guy-green, #2e7d32);
        opacity: 0.7;
      }

      .wait-empty strong {
        color: var(--guy-navy, #003366);
        font-size: 1.05rem;
      }

      .wait-empty p {
        margin: 0;
        max-width: 22rem;
        font-size: 0.9rem;
        line-height: 1.4;
      }

      @keyframes wait-rise {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes wait-pulse {
        70% {
          box-shadow: 0 0 0 10px rgba(61, 186, 110, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(61, 186, 110, 0);
        }
      }

      :host-context(html[data-theme='dark']) .wait-compose,
      :host-context(html[data-theme='dark']) .wait-item {
        background: var(--guy-card, #1a1f1c);
      }
    `,
  ],
})
export class WaitingListPage implements OnInit {
  private readonly api = inject(ReservationsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly waiting = signal<WaitingListRow[]>([]);

  readonly waitingForm = this.fb.nonNullable.group({
    guestName: ['', Validators.required],
    partySize: [2, [Validators.required, Validators.min(1)]],
    phone: [''],
    area: this.fb.nonNullable.control<ReservationArea>('INSIDE'),
  });

  readonly shopName = computed(() => this.shops.selectedShop()?.name ?? 'Local');
  readonly shopSlug = computed(() => this.shops.selectedShop()?.slug ?? '');

  readonly logoUrl = computed(() => {
    const raw = this.shops.selectedShop()?.logoUrl;
    return normalizeLogoUrl(raw) || raw?.trim() || null;
  });

  readonly totalGuests = computed(() =>
    this.waiting().reduce((s, w) => s + Number(w.partySize || 0), 0),
  );
  readonly insideGuests = computed(() =>
    this.waiting()
      .filter((w) => w.area !== 'OUTSIDE')
      .reduce((s, w) => s + Number(w.partySize || 0), 0),
  );
  readonly outsideGuests = computed(() =>
    this.waiting()
      .filter((w) => w.area === 'OUTSIDE')
      .reduce((s, w) => s + Number(w.partySize || 0), 0),
  );

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'waitingList.manage');
  }

  ngOnInit(): void {
    this.loadWaiting();
  }

  publicUrl(): string {
    const slug = this.shopSlug();
    return `${window.location.origin}/w/${encodeURIComponent(slug)}`;
  }

  async copyPublicUrl(): Promise<void> {
    const url = this.publicUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      this.snack.open('URL copiada', 'OK', { duration: 2000 });
    } catch {
      this.snack.open('No se pudo copiar la URL', 'OK', { duration: 3000 });
    }
  }

  whatsappHref(phone: string): string {
    const digits = String(phone ?? '').replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : '#';
  }

  hasPhone(phone?: string | null): boolean {
    return String(phone ?? '').replace(/\D/g, '').length >= 6;
  }

  private loadWaiting(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.listWaiting(shopId).subscribe({
      next: (rows) => this.waiting.set(rows ?? []),
      error: () => this.snack.open('No se pudo cargar la lista de espera', 'OK', { duration: 3000 }),
    });
  }

  saveWaiting(): void {
    if (this.waitingForm.invalid || !this.canManage()) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.waitingForm.getRawValue();
    this.api
      .createWaiting(shopId, {
        guestName: raw.guestName.trim(),
        partySize: Number(raw.partySize),
        phone: raw.phone.trim(),
        area: raw.area,
      })
      .subscribe({
        next: () => {
          this.waitingForm.reset({ guestName: '', partySize: 2, phone: '', area: 'INSIDE' });
          this.loadWaiting();
          this.snack.open('Agregado a la espera', 'OK', { duration: 2000 });
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  seatWaiting(row: WaitingListRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.api.updateWaiting(shopId, row.id, { status: 'SEATED' }).subscribe({
      next: () => {
        this.loadWaiting();
        this.snack.open(`${row.guestName} sentado`, 'OK', { duration: 2000 });
      },
      error: () => this.snack.open('No se pudo actualizar', 'OK', { duration: 3000 }),
    });
  }

  deleteWaiting(row: WaitingListRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.api.removeWaiting(shopId, row.id).subscribe({
      next: () => this.loadWaiting(),
      error: () => this.snack.open('No se pudo quitar', 'OK', { duration: 3000 }),
    });
  }
}
