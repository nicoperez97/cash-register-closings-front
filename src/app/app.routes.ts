import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import {
  permissionGuard,
  anyPermissionGuard,
  shopFeatureGuard,
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
    path: 'reservar/:slug',
    loadComponent: () =>
      import('./features/reservations/public-reservation-signup').then(
        (m) => m.PublicReservationSignupComponent,
      ),
    title: 'Reservar',
  },
  {
    path: 'mi-reserva/:slug',
    loadComponent: () =>
      import('./features/reservations/public-reservation-lookup').then(
        (m) => m.PublicReservationLookupComponent,
      ),
    title: 'Consultar reserva',
  },
  {
    path: 'p/:slug',
    loadComponent: () =>
      import('./features/attendance/public-attendance-board').then(
        (m) => m.PublicAttendanceBoardComponent,
      ),
    title: 'Presentismo',
  },
  {
    path: 'm/:slug',
    loadComponent: () =>
      import('./features/menu/public-menu-page').then((m) => m.PublicMenuPageComponent),
    title: 'Carta',
  },
  {
    path: 'm/:slug/:menuSlug',
    loadComponent: () =>
      import('./features/menu/public-menu-page').then((m) => m.PublicMenuPageComponent),
    title: 'Carta',
  },
  {
    path: 'n/:slug',
    loadComponent: () =>
      import('./features/service-rules/public-service-rules-page').then(
        (m) => m.PublicServiceRulesPageComponent,
      ),
    title: 'Normas de servicio',
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
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile-page').then((m) => m.ProfilePage),
        title: 'Perfil',
      },
      {
        path: 'closings',
        canActivate: [anyPermissionGuard('closings.read', 'closings.create')],
        loadComponent: () =>
          import('./features/closings/closings-list').then((m) => m.ClosingsListPage),
        title: 'Cierres',
      },
      {
        path: 'cash-withdrawals',
        canActivate: [permissionGuard('cashWithdrawals.read')],
        loadComponent: () =>
          import('./features/cash-withdrawals/cash-withdrawals-page').then(
            (m) => m.CashWithdrawalsPage,
          ),
        title: 'A Retirar',
      },
      {
        path: 'settlements',
        canActivate: [permissionGuard('settlements.read'), shopFeatureGuard('settlements')],
        loadComponent: () =>
          import('./features/settlements/settlements-page').then((m) => m.SettlementsPage),
        title: 'Rendiciones',
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
        path: 'reports/stats',
        canActivate: [permissionGuard('reports.view')],
        loadComponent: () =>
          import('./features/reports/stats-page').then((m) => m.StatsPage),
        title: 'Estadísticas',
      },
      {
        path: 'reports/concepts',
        canActivate: [permissionGuard('reports.view')],
        loadComponent: () =>
          import('./features/reports/concepts-report-page').then(
            (m) => m.ConceptsReportPage,
          ),
        title: 'Conceptos',
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
        canActivate: [
          permissionGuard('reservations.read'),
          shopFeatureGuard('reservations'),
        ],
        loadComponent: () =>
          import('./features/reservations/reservations-page').then((m) => m.ReservationsPage),
        title: 'Reservas',
      },
      {
        path: 'waiting-list',
        canActivate: [
          permissionGuard('waitingList.read'),
          shopFeatureGuard('waitingList'),
        ],
        loadComponent: () =>
          import('./features/reservations/waiting-list-page').then((m) => m.WaitingListPage),
        title: 'Lista de espera',
      },
      {
        path: 'salon',
        pathMatch: 'full',
        redirectTo: '/salon/diagrama',
      },
      {
        path: 'salon/diagrama',
        canActivate: [
          permissionGuard('reservations.read'),
          shopFeatureGuard('reservations'),
        ],
        loadComponent: () => import('./features/salon/salon-page').then((m) => m.SalonPage),
        title: 'Diagrama',
      },
      {
        path: 'salon/reglas',
        canActivate: [
          permissionGuard('reservations.read'),
          shopFeatureGuard('reservations'),
        ],
        loadComponent: () => import('./features/salon/salon-page').then((m) => m.SalonPage),
        title: 'Reglas',
      },
      {
        path: 'salon/horarios',
        canActivate: [
          permissionGuard('reservations.read'),
          shopFeatureGuard('reservations'),
        ],
        loadComponent: () =>
          import('./features/salon/salon-hours-page').then((m) => m.SalonHoursPage),
        title: 'Horarios',
      },
      {
        path: 'tips',
        canActivate: [permissionGuard('tips.read'), shopFeatureGuard('tips')],
        loadComponent: () =>
          import('./features/tips/tips-page').then((m) => m.TipsPage),
        title: 'Propinas',
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
        path: 'payments/services',
        canActivate: [permissionGuard('payments.read')],
        data: { paymentKind: 'service' },
        loadComponent: () =>
          import('./features/payments/payments-page').then((m) => m.PaymentsPage),
        title: 'Pagos a servicios',
      },
      {
        path: 'payments/partners',
        canActivate: [permissionGuard('payments.read')],
        data: { paymentKind: 'partner' },
        loadComponent: () =>
          import('./features/payments/payments-page').then((m) => m.PaymentsPage),
        title: 'Pagos a socios',
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard('suppliers.read')],
        loadComponent: () =>
          import('./features/suppliers/suppliers-list').then((m) => m.SuppliersListPage),
        title: 'Proveedores',
      },
      {
        path: 'services',
        canActivate: [permissionGuard('services.read')],
        loadComponent: () =>
          import('./features/services/services-list').then((m) => m.ServicesListPage),
        title: 'Servicios',
      },
      {
        path: 'stock',
        canActivate: [permissionGuard('stock.read')],
        data: { stockKind: 'food' },
        loadComponent: () =>
          import('./features/stock/stock-page').then((m) => m.StockPage),
        title: 'Stock alimentos',
      },
      {
        path: 'beverage-stock',
        canActivate: [permissionGuard('beverageStock.read')],
        data: { stockKind: 'beverage' },
        loadComponent: () =>
          import('./features/stock/stock-page').then((m) => m.StockPage),
        title: 'Stock bebidas',
      },
      {
        path: 'shortages',
        canActivate: [permissionGuard('shortages.read')],
        loadComponent: () =>
          import('./features/shortages/shortages-page').then((m) => m.ShortagesPage),
        title: 'Faltantes',
      },
      {
        path: 'orders',
        canActivate: [permissionGuard('orders.read')],
        loadComponent: () =>
          import('./features/orders/orders-page').then((m) => m.OrdersPage),
        title: 'Pedidos',
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
        path: 'admin/messages',
        canActivate: [permissionGuard('shops.manage')],
        loadComponent: () =>
          import('./features/admin/admin-messages').then((m) => m.AdminMessagesPage),
        title: 'Mensajes',
      },
      {
        path: 'admin/menu',
        canActivate: [permissionGuard('shops.manage')],
        loadComponent: () =>
          import('./features/menu/admin-menu').then((m) => m.AdminMenuPage),
        title: 'Carta',
      },
      {
        path: 'admin/qr',
        canActivate: [permissionGuard('shops.manage')],
        loadComponent: () =>
          import('./features/admin/admin-qr').then((m) => m.AdminQrPage),
        title: 'QR',
      },
      {
        path: 'admin/instrucciones',
        canActivate: [permissionGuard('shops.manage')],
        loadComponent: () =>
          import('./features/admin/admin-help-page').then((m) => m.AdminHelpPage),
        title: 'Instrucciones',
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
        path: 'expenses',
        canActivate: [permissionGuard('expenses.read')],
        loadComponent: () =>
          import('./features/movements/expenses-list').then((m) => m.ExpensesListPage),
        title: 'Gastos',
      },
      {
        path: 'incomes',
        canActivate: [permissionGuard('incomes.read')],
        loadComponent: () =>
          import('./features/movements/incomes-list').then((m) => m.IncomesListPage),
        title: 'Ingresos',
      },
      {
        path: 'account-transfers',
        canActivate: [permissionGuard('accountTransfers.read')],
        loadComponent: () =>
          import('./features/movements/account-transfers-list').then(
            (m) => m.AccountTransfersListPage,
          ),
        title: 'Movimientos entre cuentas',
      },
      {
        path: 'partner-splits',
        canActivate: [permissionGuard('partnerSplits.read')],
        loadComponent: () =>
          import('./features/partner-splits/partner-splits-page').then(
            (m) => m.PartnerSplitsPage,
          ),
        title: 'División de socios',
      },
      {
        path: 'splits',
        canActivate: [permissionGuard('partnerSplits.read')],
        loadComponent: () =>
          import('./features/partner-splits/splits-history-page').then(
            (m) => m.SplitsHistoryPage,
          ),
        title: 'Divisiones',
      },
      {
        path: 'transactions',
        canActivate: [
          anyPermissionGuard('expenses.read', 'incomes.read', 'accountTransfers.read'),
        ],
        loadComponent: () =>
          import('./features/movements/transactions-list').then((m) => m.TransactionsListPage),
        title: 'Transacciones',
      },
      {
        path: 'movements',
        redirectTo: 'expenses',
        pathMatch: 'full',
      },
      {
        path: 'my-production',
        canActivate: [permissionGuard('attendance.self')],
        loadComponent: () =>
          import('./features/attendance/my-production-page').then((m) => m.MyProductionPage),
        title: 'Mis horas de producción',
      },
      {
        path: 'reimbursements',
        canActivate: [
          anyPermissionGuard(
            'reimbursements.self',
            'reimbursements.read',
            'reimbursements.manage',
          ),
        ],
        loadComponent: () =>
          import('./features/reimbursements/reimbursements-page').then(
            (m) => m.ReimbursementsPage,
          ),
        title: 'Reintegros',
      },
      {
        path: 'service-rules',
        canActivate: [permissionGuard('serviceRules.read')],
        loadComponent: () =>
          import('./features/service-rules/service-rules-page').then(
            (m) => m.ServiceRulesPage,
          ),
        title: 'Normas de servicio',
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
  { path: '**', loadComponent: () => import('./features/public/public-not-found').then((m) => m.PublicNotFoundPage), title: 'No encontrada' },
];
