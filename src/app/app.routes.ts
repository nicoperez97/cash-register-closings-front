import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard, shopUsersGuard, superAdminGuard } from './core/guards/permission.guard';
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
        path: 'reports/products',
        canActivate: [permissionGuard('reports.view')],
        loadComponent: () =>
          import('./features/reports/sales-products-page').then((m) => m.SalesProductsPage),
        title: 'Platos y rubros',
      },
      {
        path: 'reports',
        canActivate: [permissionGuard('reports.view')],
        loadComponent: () =>
          import('./features/reports/reports-page').then((m) => m.ReportsPage),
        title: 'Reportes',
      },
      {
        path: 'admin/shops',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/admin/admin-shops').then((m) => m.AdminShopsPage),
        title: 'Locales',
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
      {
        path: 'admin/accounts',
        canActivate: [permissionGuard('accounts.manage')],
        loadComponent: () =>
          import('./features/admin/admin-accounts').then((m) => m.AdminAccountsPage),
        title: 'Cuentas',
      },
      {
        path: 'admin/concepts',
        canActivate: [permissionGuard('concepts.manage')],
        loadComponent: () =>
          import('./features/admin/admin-concepts').then((m) => m.AdminConceptsPage),
        title: 'Conceptos',
      },
      {
        path: 'admin/sales-systems',
        canActivate: [permissionGuard('shops.manage')],
        loadComponent: () =>
          import('./features/admin/admin-sales-systems').then((m) => m.AdminSalesSystemsPage),
        title: 'Sistemas de ventas',
      },
      {
        path: 'admin/pos-products',
        canActivate: [permissionGuard('shops.manage')],
        loadComponent: () =>
          import('./features/admin/admin-pos-products').then((m) => m.AdminPosProductsPage),
        title: 'Platos POS',
      },
      {
        path: 'employees',
        canActivate: [permissionGuard('employees.read')],
        loadComponent: () =>
          import('./features/employees/employees-list').then((m) => m.EmployeesListPage),
        title: 'Empleados',
      },
      {
        path: 'movements',
        canActivate: [permissionGuard('movements.read')],
        loadComponent: () =>
          import('./features/movements/movements-list').then((m) => m.MovementsListPage),
        title: 'Movimientos',
      },
      {
        path: 'attendance',
        canActivate: [permissionGuard('attendance.read')],
        loadComponent: () =>
          import('./features/attendance/attendance-page').then((m) => m.AttendancePage),
        title: 'Asistencia',
      },
      {
        path: 'payroll',
        canActivate: [permissionGuard('payroll.read')],
        loadComponent: () =>
          import('./features/payroll/payroll-page').then((m) => m.PayrollPage),
        title: 'Liquidaciones',
      },
      {
        path: 'commissions',
        canActivate: [permissionGuard('commissions.read')],
        loadComponent: () =>
          import('./features/commissions/commissions-page').then((m) => m.CommissionsPage),
        title: 'Comisiones',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
