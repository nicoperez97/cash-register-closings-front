import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatDialogRef } from '@angular/material/dialog';
import { APP_TITLE_BRAND, formatAppTitle } from '../../core/routing/app-title.strategy';
import { ShopContextService } from '../../core/shop/shop-context.service';

/**
 * Actualiza el título de la pestaña mientras un diálogo está abierto
 * y lo restaura al cerrar (soporta diálogos anidados).
 */
@Injectable({ providedIn: 'root' })
export class DialogTitleService {
  private readonly title = inject(Title);
  private readonly shops = inject(ShopContextService);
  private readonly stack: string[] = [];

  track<T, R>(ref: MatDialogRef<T, R>, pageTitle: string): MatDialogRef<T, R> {
    this.stack.push(this.title.getTitle());
    const brand = this.shops.selectedShop()?.name?.trim() || APP_TITLE_BRAND;
    this.title.setTitle(formatAppTitle(pageTitle, brand));
    ref.afterClosed().subscribe(() => {
      const prev = this.stack.pop();
      if (prev !== undefined) this.title.setTitle(prev);
    });
    return ref;
  }
}
