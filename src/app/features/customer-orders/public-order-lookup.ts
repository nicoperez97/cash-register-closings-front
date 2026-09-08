import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import {
  CustomerOrdersApiService,
  PublicCustomerOrder,
} from './customer-orders-api.service';
import {
  apiErrorMessage,
  fulfillmentLabel,
  orderingMoney,
  paymentLabel,
  statusLabel,
} from './ordering-ui.util';

@Component({
  selector: 'app-public-order-lookup',
  imports: [FormsModule, RouterLink],
  templateUrl: './public-order-lookup.html',
  styleUrl: './public-order-lookup.scss',
})
export class PublicOrderLookupComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CustomerOrdersApiService);
  private readonly title = inject(Title);

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly error = signal<string | null>(null);
  readonly order = signal<PublicCustomerOrder | null>(null);

  phone = '';
  code = '';

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
    this.title.setTitle('Consultar pedido');
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  search(ev: Event): void {
    ev.preventDefault();
    const slug = this.slug();
    const phone = this.phone.trim();
    const code = this.code.trim();
    if (!slug || !phone || !code) return;
    this.loading.set(true);
    this.error.set(null);
    this.order.set(null);
    this.api.lookupPublicOrder(slug, phone, code).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.searched.set(true);
        this.order.set(res);
        this.title.setTitle(`Pedido ${res.code}`);
      },
      error: (err) => {
        this.loading.set(false);
        this.searched.set(true);
        this.order.set(null);
        this.error.set(apiErrorMessage(err, 'No encontramos ese pedido.'));
      },
    });
  }

  statusText(status: PublicCustomerOrder['status']): string {
    return statusLabel(status);
  }

  fulfillmentText(f: PublicCustomerOrder['fulfillment']): string {
    return fulfillmentLabel(f);
  }

  paymentText(p: PublicCustomerOrder['paymentMethod']): string {
    return paymentLabel(p);
  }

  money(n: number): string {
    return orderingMoney(n);
  }
}
