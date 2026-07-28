import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard, shopUsersGuard } from './core/guards/permission.guard';
import { MainLayoutComponent } from './core/layout/main-layout';
import { LoginComponent } from './features/auth/login';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, title: 'Ingresar' },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/home-page').then((m) => m.HomePageComponent),
        title: 'Inicio',
      },
      {
        path: 'closings',
        canActivate: [permissionGuard('closings.read')],
        loadComponent: () =>
          import('./features/closings/closings-list').then((m) => m.ClosingsListPage),
        title: 'Cierres',
      },
      {
        path: 'closings/new',
        canActivate: [permissionGuard('closings.create')],
        loadComponent: () =>
          import('./features/closings/closings-form').then((m) => m.ClosingsFormPage),
        title: 'Nuevo cierre',
      },
      {
        path: 'closings/:id',
        canActivate: [permissionGuard('closings.update')],
        loadComponent: () =>
          import('./features/closings/closings-form').then((m) => m.ClosingsFormPage),
        title: 'Editar cierre',
      },
      {
        path: 'reports',
        canActivate: [permissionGuard('reports.view')],
        loadComponent: () =>
          import('./features/reports/reports-page').then((m) => m.ReportsPage),
        title: 'Reportes',
      },
      {
        path: 'admin/shop',
        canActivate: [permissionGuard('shops.manage')],
        loadComponent: () =>
          import('./features/admin/admin-shop').then((m) => m.AdminShopPage),
        title: 'Local',
      },
      {
        path: 'admin/users',
        canActivate: [shopUsersGuard],
        loadComponent: () =>
          import('./features/admin/admin-users').then((m) => m.AdminUsersPage),
        title: 'Usuarios',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
