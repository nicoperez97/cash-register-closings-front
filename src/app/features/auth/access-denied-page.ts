import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { defaultHomeRoute } from '../../core/auth/auth.models';

/** Ruta legada `/forbidden`: redirige al inicio del rol (no se muestra UI). */
@Component({
  selector: 'app-access-denied-page',
  template: '',
})
export class AccessDeniedPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly shops = inject(ShopContextService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.router.navigateByUrl(
      defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
      { replaceUrl: true },
    );
  }
}
