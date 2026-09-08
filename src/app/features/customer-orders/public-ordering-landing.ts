import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import {
  CustomerOrdersApiService,
  PublicOrderingConfig,
} from './customer-orders-api.service';
import { OrderingCartService } from './ordering-cart.service';
import { apiErrorMessage, onAccentColor, orderingLogoUrl, orderingMoney } from './ordering-ui.util';

@Component({
  selector: 'app-public-ordering-landing',
  imports: [RouterLink],
  templateUrl: './public-ordering-landing.html',
  styleUrl: './public-ordering-landing.scss',
})
export class PublicOrderingLandingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CustomerOrdersApiService);
  private readonly cart = inject(OrderingCartService);
  private readonly title = inject(Title);

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
  readonly cartCount = computed(() => this.cart.count());

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
    const slug = this.slug();
    this.cart.bindSlug(slug);
    this.load();
  }

  ngOnDestroy(): void {
    resetStatusBar();
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
}
