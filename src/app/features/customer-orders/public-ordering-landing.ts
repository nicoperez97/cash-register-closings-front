import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicPagePwaService } from '../../core/pwa/public-page-pwa.service';
import { PublicPageInstallBannerComponent } from '../../shared/components/public-page-install-banner';
import {
  CustomerOrdersApiService,
  PublicOrderingConfig,
} from './customer-orders-api.service';
import { OrderingCartService } from './ordering-cart.service';
import {
  apiErrorMessage,
  formatOrderingEtaChip,
  onAccentColor,
  orderingLogoUrl,
  orderingMoney,
} from './ordering-ui.util';

@Component({
  selector: 'app-public-ordering-landing',
  imports: [RouterLink, PublicPageInstallBannerComponent],
  templateUrl: './public-ordering-landing.html',
  styleUrl: './public-ordering-landing.scss',
})
export class PublicOrderingLandingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CustomerOrdersApiService);
  private readonly cart = inject(OrderingCartService);
  private readonly title = inject(Title);
  private readonly pagePwa = inject(PublicPagePwaService);
  private pwaApplied = false;

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly config = signal<PublicOrderingConfig | null>(null);
  readonly zonesOpen = signal(false);

  readonly shop = computed(() => this.config()?.shop ?? null);
  readonly accent = computed(() => this.shop()?.accentColor?.trim() || '#2e7d32');
  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly logoUrl = computed(() => orderingLogoUrl(this.shop()?.logoUrl, this.shop()?.id));

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
  }
  readonly closed = computed(() => {
    const c = this.config();
    return !!c && !c.anyChannelOpen;
  });
  readonly closedByForce = computed(() => !!this.config()?.orderingForceClosed);
  /** Aviso leve cuando un canal habilitado está fuera de horario y el otro sigue abierto. */
  readonly channelHoursHint = computed(() => {
    const c = this.config();
    if (!c || c.orderingForceClosed || !c.anyChannelOpen) return null;
    const takeawayOffHours =
      c.takeawayEnabled && !c.takeawayOpen && (c.takeawayHoursSummary?.length ?? 0) > 0;
    const deliveryOffHours =
      c.deliveryEnabled &&
      !c.deliveryOpen &&
      (c.deliveryZones?.length ?? 0) > 0 &&
      (c.deliveryHoursSummary?.length ?? 0) > 0;
    if (takeawayOffHours && !deliveryOffHours && c.deliveryOpen) {
      return 'Take away fuera de horario por ahora. Podés pedir delivery.';
    }
    if (deliveryOffHours && !takeawayOffHours && c.takeawayOpen) {
      return 'Delivery fuera de horario por ahora. Podés pedir take away.';
    }
    return null;
  });
  readonly cartCount = computed(() => this.cart.count());

  channelClosedLabel(channel: 'takeaway' | 'delivery'): string {
    const c = this.config();
    if (!c || c.orderingForceClosed) return 'cerrado';
    if (channel === 'takeaway') {
      return (c.takeawayHoursSummary?.length ?? 0) > 0 ? 'fuera de horario' : 'cerrado';
    }
    return (c.deliveryHoursSummary?.length ?? 0) > 0 && (c.deliveryZones?.length ?? 0) > 0
      ? 'fuera de horario'
      : 'cerrado';
  }

  ngOnInit(): void {
    const slug = this.slug();
    this.pagePwa.prime('ordering', slug);
    this.cart.bindSlug(slug);
    this.load();
  }

  ngOnDestroy(): void {
    this.pagePwa.release('ordering', this.slug());
  }

  load(): void {
    const slug = this.slug();
    if (!slug) {
      this.loading.set(false);
      this.error.set('Local no encontrado');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.getPublicOrdering(slug).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loading.set(false);
        this.title.setTitle(`Pedir · ${cfg.shop?.name ?? slug}`);
        if (!this.pwaApplied && cfg.shop) {
          this.pwaApplied = true;
          this.pagePwa.apply({
            kind: 'ordering',
            slug: cfg.shop.slug || slug,
            shopName: cfg.shop.name,
            accentColor: cfg.shop.accentColor,
            logoUrl: this.logoUrl(),
          });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No pudimos cargar los pedidos de este local.'));
      },
    });
  }

  onLogoError(): void {
    const c = this.config();
    if (!c) return;
    this.config.set({ ...c, shop: { ...c.shop, logoUrl: null } });
  }

  openZones(): void {
    this.zonesOpen.set(true);
  }

  closeZones(): void {
    this.zonesOpen.set(false);
  }

  zoneFee(fee: number): string {
    return fee > 0 ? orderingMoney(fee) : 'Sin cargo';
  }

  etaChip(channel: 'takeaway' | 'delivery', raw: unknown): string | null {
    return formatOrderingEtaChip(channel, raw);
  }

  hoursRows(
    lines: Array<{ days: string; times: string } | string> | null | undefined,
  ): Array<{ days: string; times: string }> {
    const out: Array<{ days: string; times: string }> = [];
    for (const line of lines ?? []) {
      if (!line) continue;
      if (typeof line === 'object' && line.days) {
        out.push({ days: line.days, times: line.times || '' });
        continue;
      }
      // Legacy: "Lunes a Sábado 10:00 a 16:00hs, 19:30 a 23:30hs"
      const text = String(line).trim();
      const m = text.match(/^(.+?)\s+(\d{1,2}:\d{2}\b.*)$/);
      if (m) {
        out.push({
          days: m[1].trim(),
          times: m[2].replace(/\s*,\s*/g, ' · ').replace(/hs\b/gi, '').trim(),
        });
      } else {
        out.push({ days: text, times: '' });
      }
    }
    return out;
  }
}
