import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicPagePwaService } from '../../core/pwa/public-page-pwa.service';
import { PublicPageInstallBannerComponent } from '../../shared/components/public-page-install-banner';
import { CustomerOrdersApiService } from './customer-orders-api.service';
import { rememberOrderPhone } from './public-order-session';
import { apiErrorMessage, onAccentColor, orderingLogoUrl } from './ordering-ui.util';

@Component({
  selector: 'app-public-order-lookup',
  imports: [FormsModule, RouterLink, PublicPageInstallBannerComponent],
  templateUrl: './public-order-lookup.html',
  styleUrl: './public-order-lookup.scss',
})
export class PublicOrderLookupComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CustomerOrdersApiService);
  private readonly title = inject(Title);
  private readonly pagePwa = inject(PublicPagePwaService);
  private pwaApplied = false;

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly loading = signal(false);
  readonly brandingLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly accent = signal('#2e7d32');
  readonly onAccent = computed(() => onAccentColor(this.accent()));

  phone = '';
  code = '';

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
  }

  ngOnInit(): void {
    this.title.setTitle('Consultar pedido');
    const slug = this.slug();
    this.pagePwa.prime('orderLookup', slug);
    if (!slug) {
      this.brandingLoading.set(false);
      return;
    }
    this.api.getPublicOrdering(slug).subscribe({
      next: (cfg) => {
        const color = cfg.shop?.accentColor?.trim() || '#2e7d32';
        this.accent.set(color);
        this.title.setTitle(`Consultar pedido · ${cfg.shop?.name ?? slug}`);
        this.brandingLoading.set(false);
        if (!this.pwaApplied && cfg.shop) {
          this.pwaApplied = true;
          this.pagePwa.apply({
            kind: 'orderLookup',
            slug: cfg.shop.slug || slug,
            shopName: cfg.shop.name,
            accentColor: cfg.shop.accentColor,
            logoUrl: orderingLogoUrl(cfg.shop.logoUrl, cfg.shop.id),
          });
        }
      },
      error: () => this.brandingLoading.set(false),
    });
  }

  ngOnDestroy(): void {
    this.pagePwa.release('orderLookup', this.slug());
  }

  search(ev: Event): void {
    ev.preventDefault();
    const slug = this.slug();
    const phone = this.phone.trim();
    const code = this.code.trim().toUpperCase();
    if (!slug || !phone) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.lookupPublicOrder(slug, phone, code || undefined).subscribe({
      next: (res) => {
        this.loading.set(false);
        rememberOrderPhone(slug, res.code, phone);
        void this.router.navigate(['/mi-pedido', slug, res.code]);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No encontramos ese pedido.'));
      },
    });
  }
}
