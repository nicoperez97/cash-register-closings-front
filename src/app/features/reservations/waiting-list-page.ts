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
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';
import { usePageRefresh } from '../../core/page-refresh.service';
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
              <input matInput formControlName="phone" placeholder="Opcional" inputmode="tel" autocomplete="tel" />
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
    partySize: [2, [Validators.required, Validators.min(1), Validators.max(99)]],
    phone: [''],
    area: this.fb.nonNullable.control<ReservationArea>('INSIDE'),
  });

  readonly shopName = computed(() => this.shops.selectedShop()?.name ?? 'Local');
  readonly shopSlug = computed(() => this.shops.selectedShop()?.slug ?? '');

  readonly logoUrl = computed(() => {
    const shop = this.shops.selectedShop();
    const raw = shop?.logoUrl;
    return resolveShopLogoSrc(raw, shop?.id) || normalizeLogoUrl(raw) || raw?.trim() || null;
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

  constructor() {
    usePageRefresh(() => this.loadWaiting());
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
    const phone = String(raw.phone ?? '').trim();
    if (phone && !this.hasPhone(phone)) {
      this.snack.open('Teléfono inválido', 'OK', { duration: 2500 });
      return;
    }
    this.api
      .createWaiting(shopId, {
        guestName: raw.guestName.trim(),
        partySize: Number(raw.partySize),
        phone: phone || undefined,
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
