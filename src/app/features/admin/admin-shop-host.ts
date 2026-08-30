import { InjectionToken } from '@angular/core';
import type { AdminShopPage } from './admin-shop';

/** Token para que las rutas hijas usen el formulario del shell. */
export const ADMIN_SHOP_HOST = new InjectionToken<AdminShopPage>('ADMIN_SHOP_HOST');
