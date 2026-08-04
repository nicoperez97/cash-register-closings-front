import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import {
  permissionGuard,
  shopUsersGuard,
  superAdminGuard,
} from './core/guards/permission.guard';
import { MainLayoutComponent } from './core/layout/main-layout';
import { LoginComponent } from './features/auth/login';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, title: 'Ingresar' },
  {
    path: 'r/:slug',
    loadComponent: () =>
      import('./features/reservations/public-reservations-board').then(
        (m) => m.PublicReservationsBoardComponent,
      ),
    title: 'Reservas',
  },
  {
    path: 'w/:slug',
    loadComponent: () =>
      import('./features/reservations/public-waiting-board').then(
        (m) => m.PublicWaitingBoardComponent,
      ),
    title: 'Lista de espera',
  },
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
        title: 'Ventas POS',
      },
      {
        path: 'reports',
        canActivate: [permissionGuard('reports.view')],
        loadComponent: () =>
          import('./features/reports/reports-page').then((m) => m.ReportsPage),
        title: 'Reportes',
      },
      {
        path: 'reservations',
        canActivate: [permissionGuard('reservations.read')],
        loadComponent: () =>
          import('./features/reservations/reservations-page').then((m) => m.ReservationsPage),
        title: 'Reservas',
      },
      {
        path: 'waiting-list',
        canActivate: [permissionGuard('waitingList.read')],
        loadComponent: () =>
          import('./features/reservations/waiting-list-page').then((m) => m.WaitingListPage),
        title: 'Lista de espera',
      },
      {
        path: 'payments',
        pathMatch: 'full',
        redirectTo: 'payments/suppliers',
      },
      {
        path: 'payments/suppliers',
        canActivate: [permissionGuard('payments.read')],
        data: { paymentKind: 'supplier' },
        loadComponent: () =>
          import('./features/payments/payments-page').then((m) => m.PaymentsPage),
        title: 'Pagos a proveedores',
      },
      {
        path: 'payments/employees',
        canActivate: [permissionGuard('payments.read')],
        data: { paymentKind: 'employee' },
        loadComponent: () =>
          import('./features/payments/payments-page').then((m) => m.PaymentsPage),
        title: 'Pagos a empleados',
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard('suppliers.read')],
        loadComponent: () =>
          import('./features/suppliers/suppliers-list').then((m) => m.SuppliersListPage),
        title: 'Proveedores',
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
        path: 'candidates',
        canActivate: [permissionGuard('candidates.read')],
        loadComponent: () =>
          import('./features/candidates/candidates-list').then((m) => m.CandidatesListPage),
        title: 'CVs / Candidatos',
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
        title: 'Asistencia · Servicio',
      },
      {
        path: 'production-attendance',
        canActivate: [permissionGuard('attendance.read')],
        loadComponent: () =>
          import('./features/attendance/production-attendance-page').then(
            (m) => m.ProductionAttendancePage,
          ),
        title: 'Asistencia · Produccion',
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
