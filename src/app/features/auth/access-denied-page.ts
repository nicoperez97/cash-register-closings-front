import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { defaultHomeRoute } from '../../core/auth/auth.models';

@Component({
  selector: 'app-access-denied-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Sin acceso"
      subtitle="Este módulo no está habilitado para tu usuario en este local."
    />
    <section class="panel-card">
      <p class="text-muted">
        Pedile al administrador del local que te dé permiso, o volvé al inicio.
      </p>
      <a mat-flat-button color="primary" [routerLink]="home()">
        <mat-icon>home</mat-icon>
        Ir a inicio
      </a>
    </section>
  `,
  styles: `
    .panel-card {
      padding: 1.25rem 1.35rem;
    }
    p {
      margin: 0 0 1rem;
    }
  `,
})
export class AccessDeniedPageComponent {
  private readonly auth = inject(AuthService);
  private readonly shops = inject(ShopContextService);
  private readonly route = inject(ActivatedRoute);

  readonly from = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('from') || '')),
    { initialValue: '' },
  );

  home(): string {
    return defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId());
  }
}
