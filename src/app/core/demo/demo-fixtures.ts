import { AuthUser, ROLE_PERMISSIONS, ShopSummary, deriveModulesFromRole, toUiRole } from '../auth/auth.models';
import { defaultReportsProductsVisibility } from '../../shared/reports-products-visibility';
import {
  DEMO_LOCAL_TOKEN,
  DemoAccountType,
  DemoAttendanceDayStatus,
  DemoClosingStatus,
  DemoConceptKind,
  DemoPaymentMethod,
  DemoPaymentPriority,
  DemoPaymentStatus,
  DemoServiceRulePhase,
  DemoShopMode,
  DemoShortageLevel,
  DemoShortageLevelLabel,
  DemoStockKind,
} from './demo-constants';

/** IDs fijos de la demo offline (no coinciden con datos reales de clientes). */
export const DEMO_SHOP_ID = 'demo-shop-00000000-0000-4000-8000-000000000001';
export const DEMO_USER_ID = 'demo-user-00000000-0000-4000-8000-000000000001';
/** @deprecated usar DEMO_LOCAL_TOKEN — se mantiene por imports existentes. */
export const DEMO_TOKEN = DEMO_LOCAL_TOKEN;

export const DEMO_ACCOUNT_IDS = {
  ingreso: 'demo-acc-ingreso',
  egreso: 'demo-acc-egreso',
  efectivo: 'demo-acc-efectivo',
  mp: 'demo-acc-mp',
  socioA: 'demo-acc-socio-a',
  socioB: 'demo-acc-socio-b',
} as const;

export const DEMO_CONCEPT_IDS = {
  verduleria: 'demo-cpt-verduleria',
  sueldos: 'demo-cpt-sueldos',
  cobro: 'demo-cpt-cobro',
  division: 'demo-cpt-division',
  transferencia: 'demo-cpt-transfer',
} as const;

export const DEMO_MENU_ITEM_IDS = {
  milanesa: 'demo-mi-milanesa',
  lomito: 'demo-mi-lomito',
  agua: 'demo-mi-agua',
  gaseosa: 'demo-mi-gaseosa',
} as const;

export function buildDemoShop(): ShopSummary {
  const allManage = {
    resumen: 'manage',
    identidad: 'manage',
    operacion: 'manage',
    pedidos: 'manage',
    comanda: 'manage',
    comanderas: 'manage',
    dispositivos: 'manage',
    menu: 'manage',
    carta: 'manage',
    avanzado: 'manage',
  } as const;

  return {
    id: DEMO_SHOP_ID,
    name: 'Demo Gastronomía',
    slug: 'demo-gastro',
    unitsLabel: 'cubiertos',
    coversEnabled: true,
    reservationsEnabled: true,
    reservationSignupEnabled: true,
    reservationTimeRequired: false,
    reservationInsideEnabled: true,
    reservationOutsideEnabled: true,
    reservationInsideMaxPartySize: 20,
    reservationOutsideMinPartySize: 1,
    reservationOutsideMaxPartySize: 40,
    waitingListEnabled: true,
    tipsEnabled: true,
    settlementsEnabled: true,
    publicAttendanceEnabled: true,
    publicServiceRulesEnabled: true,
    serviceAttendanceWithHours: true,
    holidayPayMultiplier: 1.5,
    menuEnabled: true,
    shopMode: DemoShopMode.RESTAURANTE,
    onlineOrderingEnabled: true,
    waiterOrderingEnabled: true,
    waiterCapabilities: {
      public: {
        allowSendOrder: true,
        allowPrintKitchen: true,
        defaultPrintKitchen: true,
        lockPrintKitchen: false,
        allowPrintCustomerTicket: true,
        defaultPrintCustomerTicket: false,
        lockPrintCustomerTicket: false,
        allowEditTicket: true,
        allowRemoveTicketLines: true,
        allowTicketDiscount: true,
        allowCloseTable: true,
        requireTicketBeforeClose: true,
        allowTipOnClose: true,
        allowDiscardEmptySession: true,
        allowHistory: true,
        requireWaiterOnOpen: false,
      },
      staff: {
        allowSendOrder: true,
        allowPrintKitchen: true,
        defaultPrintKitchen: true,
        lockPrintKitchen: false,
        allowPrintCustomerTicket: true,
        defaultPrintCustomerTicket: true,
        lockPrintCustomerTicket: false,
        allowEditTicket: true,
        allowRemoveTicketLines: true,
        allowTicketDiscount: true,
        allowCloseTable: true,
        requireTicketBeforeClose: true,
        allowTipOnClose: true,
        allowDiscardEmptySession: true,
        allowHistory: true,
        requireWaiterOnOpen: true,
      },
    },
    orderingForceClosed: false,
    orderingShiftActive: true,
    takeawayEnabled: true,
    deliveryEnabled: true,
    orderingHours: {
      takeaway: {
        mon: { open: '11:00', close: '23:00' },
        tue: { open: '11:00', close: '23:00' },
        wed: { open: '11:00', close: '23:00' },
        thu: { open: '11:00', close: '23:00' },
        fri: { open: '11:00', close: '00:00' },
        sat: { open: '11:00', close: '00:00' },
        sun: { open: '12:00', close: '22:00' },
      },
      delivery: {
        mon: { open: '12:00', close: '22:30' },
        tue: { open: '12:00', close: '22:30' },
        wed: { open: '12:00', close: '22:30' },
        thu: { open: '12:00', close: '22:30' },
        fri: { open: '12:00', close: '23:30' },
        sat: { open: '12:00', close: '23:30' },
        sun: { open: '12:00', close: '22:00' },
      },
    },
    orderingPayments: {
      methods: ['CASH', 'TRANSFER'],
      items: [
        { id: 'op_cash', name: 'Efectivo', accountId: null, active: true },
        { id: 'op_transfer', name: 'Transferencia', accountId: null, active: true },
      ],
      transferInstructions: 'Alias demo.ejemplo',
      whatsapp: '5491100000000',
    },
    counterPaymentMethods: [
      { id: 'cp_cash', name: 'Efectivo', accountId: null, active: true },
      { id: 'cp_pedidosya', name: 'Pedidos Ya', accountId: null, active: true },
      { id: 'cp_rappi', name: 'Rappi', accountId: null, active: true },
    ],
    deliveryZones: [
      {
        id: 'demo-zone-1',
        name: 'Centro',
        fee: 1500,
        note: 'Hasta 3 km',
        color: '#1D7AC8',
      },
      {
        id: 'demo-zone-2',
        name: 'Alrededores',
        fee: 2500,
        note: '3 a 6 km',
        color: '#2E7D32',
      },
    ],
    orderingEta: {
      takeaway: '20-30 min',
      delivery: '40-55 min',
    },
    discountPresets: [
      { id: 'demo-disc-10', label: '10%', mode: 'percent', value: 10 },
      { id: 'demo-disc-15', label: '15%', mode: 'percent', value: 15 },
    ],
    defaultChangeAmount: 10000,
    differenceReasonMinAmount: 500,
    currency: 'ARS',
    timezone: 'America/Argentina/Buenos_Aires',
    openingTime: '08:00',
    shifts: [
      {
        id: 'demo-shift-manana',
        name: 'Mañana',
        opensAt: '08:00',
        closesAt: '14:00',
        weekdays: [1, 2, 3, 4, 5, 6],
      },
      {
        id: 'demo-shift-tarde',
        name: 'Tarde',
        opensAt: '14:00',
        closesAt: '18:00',
        weekdays: [1, 2, 3, 4, 5],
      },
      {
        id: 'demo-shift-noche',
        name: 'Noche',
        opensAt: '18:00',
        closesAt: '23:30',
        weekdays: [1, 2, 3, 4, 5, 6],
      },
    ],
    productionDefaultHours: 8,
    closedWeekdays: [0],
    logoUrl: null,
    accentColor: '#1D7AC8',
    accentSecondary: '#2E7D32',
    email: 'hola@demo-gastro.example',
    instagramHandle: 'demogastro',
    phone: '5491100000000',
    emailSmtpConfigured: true,
    emailNotificationsEnabled: true,
    emailNotificationTypes: null,
    emailNotificationUserIds: null,
    emailMessageTemplates: {
      reservationConfirmed: {
        subject: 'Reserva confirmada — {{shopName}}',
        body: 'Hola {{guestName}}, tu reserva está confirmada.',
      },
      orderReady: {
        subject: 'Tu pedido está listo',
        body: 'Hola {{guestName}}, ya podés retirar tu pedido.',
      },
    },
    salesSystemId: 'demo-ss-1',
    partnerDividendAccountId: DEMO_ACCOUNT_IDS.egreso,
    partnerDividendConceptId: DEMO_CONCEPT_IDS.division,
    transferConceptId: DEMO_CONCEPT_IDS.transferencia,
    closingIncomeConceptId: DEMO_CONCEPT_IDS.cobro,
    cashWithdrawalConceptId: null,
    closingCashConceptId: null,
    orderingConfigVisibility: {
      caja: 'manage',
      channels: 'manage',
      payments: 'manage',
      items: 'manage',
      extras: 'manage',
    },
    shopConfigVisibility: { ...allManage },
    reportsProductsVisibility: defaultReportsProductsVisibility(),
    isStockAdmin: true,
    isBeverageStockAdmin: true,
    isShortageAdmin: true,
    isReservationAdmin: true,
    isCustomerOrdersAdmin: true,
    canEditExpenses: true,
    canEditPayments: true,
    requireClosingFiles: false,
    active: true,
  };
}

export function buildDemoAuthUser(): AuthUser {
  const shop = buildDemoShop();
  const perms = [...ROLE_PERMISSIONS.ADMIN];
  const modules = deriveModulesFromRole('ADMIN') as Record<string, string>;
  return {
    id: DEMO_USER_ID,
    email: 'demo@cierres.example',
    fullName: 'Admin Demo',
    phone: null,
    bankAlias: null,
    cbu: null,
    avatarUrl: null,
    hasAvatar: false,
    role: toUiRole('ADMIN'),
    globalRole: 'ADMIN',
    permissions: perms,
    shopIds: [shop.id],
    shopRoles: { [shop.id]: 'ADMIN' },
    shopPermissions: { [shop.id]: perms },
    shopModulePermissions: { [shop.id]: modules },
    shopAccountIds: {
      [shop.id]: [
        DEMO_ACCOUNT_IDS.efectivo,
        DEMO_ACCOUNT_IDS.mp,
        DEMO_ACCOUNT_IDS.socioA,
        DEMO_ACCOUNT_IDS.socioB,
      ],
    },
    shops: [shop],
    favoriteShopId: shop.id,
    isDemo: true,
  };
}

export function demoAccounts() {
  return [
    {
      id: DEMO_ACCOUNT_IDS.ingreso,
      name: '1. Ingreso',
      code: 'INGRESO',
      type: DemoAccountType.SYSTEM,
      active: true,
      listInBalances: true,
      listInExpenses: true,
      listInIncomes: true,
      listInTransfers: true,
    },
    {
      id: DEMO_ACCOUNT_IDS.egreso,
      name: '2. Egreso',
      code: 'EGRESO',
      type: DemoAccountType.SYSTEM,
      active: true,
      listInBalances: true,
      listInExpenses: true,
      listInIncomes: true,
      listInTransfers: true,
    },
    {
      id: DEMO_ACCOUNT_IDS.efectivo,
      name: 'Efectivo Caja',
      code: 'EFECTIVO',
      type: DemoAccountType.CHANNEL,
      active: true,
      listInBalances: true,
      listInExpenses: true,
      listInIncomes: true,
      listInTransfers: true,
    },
    {
      id: DEMO_ACCOUNT_IDS.mp,
      name: 'Mercado Pago',
      code: 'MP',
      type: DemoAccountType.CHANNEL,
      active: true,
      listInBalances: true,
      listInExpenses: true,
      listInIncomes: true,
      listInTransfers: true,
    },
    {
      id: DEMO_ACCOUNT_IDS.socioA,
      name: 'Socio Ana',
      code: 'SOCIO_A',
      type: DemoAccountType.PARTNER,
      active: true,
      listInBalances: true,
      listInExpenses: true,
      listInIncomes: true,
      listInTransfers: true,
    },
    {
      id: DEMO_ACCOUNT_IDS.socioB,
      name: 'Socio Bruno',
      code: 'SOCIO_B',
      type: DemoAccountType.PARTNER,
      active: true,
      listInBalances: true,
      listInExpenses: true,
      listInIncomes: true,
      listInTransfers: true,
    },
  ];
}

export function demoConcepts() {
  return [
    {
      id: DEMO_CONCEPT_IDS.cobro,
      name: 'Cobro',
      kind: DemoConceptKind.INCOME,
      active: true,
      validated: true,
      categories: ['Ingresos'],
    },
    {
      id: DEMO_CONCEPT_IDS.verduleria,
      name: 'Verdulería',
      kind: DemoConceptKind.EXPENSE,
      active: true,
      validated: true,
      categories: ['Compras'],
    },
    {
      id: DEMO_CONCEPT_IDS.sueldos,
      name: 'Sueldos',
      kind: DemoConceptKind.EXPENSE,
      active: true,
      validated: true,
      categories: ['Personal'],
    },
    {
      id: DEMO_CONCEPT_IDS.division,
      name: 'División',
      kind: DemoConceptKind.EXPENSE,
      active: true,
      validated: true,
      categories: ['Socios'],
    },
    {
      id: DEMO_CONCEPT_IDS.transferencia,
      name: 'Transferencia e/ cuentas',
      kind: DemoConceptKind.TRANSFER,
      active: true,
      validated: true,
      categories: [],
    },
  ];
}

export function demoMenu() {
  return {
    enabled: true,
    slug: 'carta',
    menus: [
      {
        id: 'demo_menu_carta',
        slug: 'carta',
        title: 'Carta',
        note: 'Menú de ejemplo para la demo',
        sections: [
          {
            name: 'Clásicos',
            items: [
              {
                id: DEMO_MENU_ITEM_IDS.milanesa,
                name: 'Milanesa al pan',
                description: 'Con papas',
                price: 12500,
                available: true,
              },
              {
                id: DEMO_MENU_ITEM_IDS.lomito,
                name: 'Lomito completo',
                description: 'Huevo, jamón y queso',
                price: 14500,
                available: true,
              },
            ],
          },
          {
            name: 'Bebidas',
            items: [
              {
                id: DEMO_MENU_ITEM_IDS.agua,
                name: 'Agua 500 ml',
                price: 2500,
                available: true,
              },
              {
                id: DEMO_MENU_ITEM_IDS.gaseosa,
                name: 'Gaseosa 500 ml',
                price: 3200,
                available: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

export function demoPromos() {
  return {
    promos: [
      {
        id: 'demo-pr-combo',
        name: 'Combo demo',
        description: 'Sandwich + bebida',
        available: true,
        showOnPublicMenu: true,
        sellable: true,
        tableMatchable: true,
        fixedPrice: 15000,
        items: [
          { menuItemId: DEMO_MENU_ITEM_IDS.milanesa, qty: 1 },
          { menuItemId: DEMO_MENU_ITEM_IDS.agua, qty: 1 },
        ],
      },
    ],
    menus: demoMenu().menus,
  };
}

export function demoUsers() {
  return [
    {
      id: DEMO_USER_ID,
      fullName: 'Admin Demo',
      email: 'demo@cierres.example',
      globalRole: 'ADMIN',
      active: true,
      shopIds: [DEMO_SHOP_ID],
      shopRoles: { [DEMO_SHOP_ID]: 'ADMIN' },
    },
    {
      id: 'demo-user-cajero',
      fullName: 'Cajero Ejemplo',
      email: 'cajero@demo.example',
      globalRole: 'CASHIER',
      active: true,
      shopIds: [DEMO_SHOP_ID],
      shopRoles: { [DEMO_SHOP_ID]: 'CASHIER' },
    },
    {
      id: 'demo-user-gerente',
      fullName: 'Gerente Ejemplo',
      email: 'gerente@demo.example',
      globalRole: 'MANAGER',
      active: true,
      shopIds: [DEMO_SHOP_ID],
      shopRoles: { [DEMO_SHOP_ID]: 'MANAGER' },
    },
  ];
}

/** KPIs y listados del Inicio (valores inventados). */
export function demoHomeFixtures(shopId: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${day}`;

  return {
    balances: {
      shopId,
      from: `${y}-${m}-01`,
      to: today,
      accounts: [
        {
          accountId: DEMO_ACCOUNT_IDS.efectivo,
          name: 'Efectivo Caja',
          code: 'EFECTIVO',
          balance: 45200,
        },
        {
          accountId: DEMO_ACCOUNT_IDS.mp,
          name: 'Mercado Pago',
          code: 'MP',
          balance: 128500,
        },
        {
          accountId: DEMO_ACCOUNT_IDS.socioA,
          name: 'Socio Ana',
          code: 'SOCIO_A',
          balance: 80000,
        },
        {
          accountId: DEMO_ACCOUNT_IDS.socioB,
          name: 'Socio Bruno',
          code: 'SOCIO_B',
          balance: 75500,
        },
      ],
    },
    closingSources: [
      {
        id: 'demo-src-1',
        role: 'CASH',
        accountId: DEMO_ACCOUNT_IDS.efectivo,
        accountName: 'Efectivo Caja',
        active: true,
      },
      {
        id: 'demo-src-2',
        role: 'CARD',
        accountId: DEMO_ACCOUNT_IDS.mp,
        accountName: 'Mercado Pago',
        active: true,
      },
    ],
    cashWithdrawalsPending: {
      items: [],
      availableTotal: 0,
    },
    closingsOpen: null,
    suggestedOpening: { amount: 15000, source: 'default' },
    reportsSummary: {
      count: 8,
      totals: { declared: 2450000, calculated: 2450000, difference: 0 },
    },
    receivablesSummary: {
      count: 0,
      totalNet: 0,
      byChannel: [],
      earliestExpected: null,
    },
    attendance: {
      employees: [
        {
          employeeId: 'demo-emp-1',
          fullName: 'Lucía Ejemplo',
          days: { [today]: { status: DemoAttendanceDayStatus.PRESENT, shiftId: 'demo-shift-noche' } },
        },
        {
          employeeId: 'demo-emp-2',
          fullName: 'Martín Ejemplo',
          days: { [today]: { status: DemoAttendanceDayStatus.ABSENT } },
        },
        {
          employeeId: 'demo-emp-3',
          fullName: 'Sofía Ejemplo',
          days: {},
        },
        {
          employeeId: 'demo-emp-4',
          fullName: 'Diego Ejemplo',
          days: {},
        },
      ],
    },
    payments: [
      {
        id: 'demo-pay-1',
        shopId,
        title: 'Verdulería semanal',
        notes: 'Pedido de verduras de ejemplo',
        conceptId: DEMO_CONCEPT_IDS.verduleria,
        conceptName: 'Verdulería',
        conceptDescription: null,
        amount: 45000,
        dueDate: today,
        priority: DemoPaymentPriority.MEDIUM,
        payerUserId: null,
        payerName: null,
        validatorUserId: null,
        validatorName: null,
        accountId: DEMO_ACCOUNT_IDS.efectivo,
        accountName: 'Efectivo Caja',
        paymentMethod: null,
        supplierId: 'demo-sup-1',
        supplierName: 'Proveedor Ejemplo SA',
        supplierBankAlias: 'proveedor.ejemplo',
        supplierLegalName: 'Proveedor Ejemplo SA',
        supplierTaxId: '30-12345678-9',
        employeeId: null,
        employeeName: null,
        serviceId: null,
        serviceName: null,
        serviceBankAlias: null,
        status: DemoPaymentStatus.PENDING_VALIDATION,
        paidAt: null,
        validatedAt: null,
        validatedByUserId: null,
        createdByUserId: DEMO_USER_ID,
        createdByName: 'Admin Demo',
        movementId: null,
        createdAt: `${today}T12:00:00.000Z`,
        updatedAt: `${today}T12:00:00.000Z`,
      },
      {
        id: 'demo-pay-2',
        shopId,
        title: 'Sueldo quincena',
        notes: null,
        conceptId: DEMO_CONCEPT_IDS.sueldos,
        conceptName: 'Sueldos',
        conceptDescription: null,
        amount: 180000,
        dueDate: today,
        priority: DemoPaymentPriority.HIGH,
        payerUserId: DEMO_USER_ID,
        payerName: 'Admin Demo',
        validatorUserId: DEMO_USER_ID,
        validatorName: 'Admin Demo',
        accountId: DEMO_ACCOUNT_IDS.mp,
        accountName: 'Mercado Pago',
        paymentMethod: DemoPaymentMethod.TRANSFER,
        supplierId: null,
        supplierName: null,
        supplierBankAlias: null,
        employeeId: 'demo-emp-1',
        employeeName: 'Lucía Ejemplo',
        serviceId: null,
        serviceName: null,
        serviceBankAlias: null,
        status: DemoPaymentStatus.VALIDATED,
        paidAt: null,
        validatedAt: `${today}T10:00:00.000Z`,
        validatedByUserId: DEMO_USER_ID,
        createdByUserId: DEMO_USER_ID,
        createdByName: 'Admin Demo',
        movementId: null,
        createdAt: `${today}T09:00:00.000Z`,
        updatedAt: `${today}T10:00:00.000Z`,
      },
    ],
  };
}

function demoDateParts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${day}`;
  const monthStart = `${y}-${m}-01`;
  const d2 = String(Math.max(1, now.getDate() - 2)).padStart(2, '0');
  const d5 = String(Math.max(1, now.getDate() - 5)).padStart(2, '0');
  return {
    today,
    monthStart,
    day2: `${y}-${m}-${d2}`,
    day5: `${y}-${m}-${d5}`,
  };
}

export function demoSuppliers(shopId: string) {
  return [
    {
      id: 'demo-sup-1',
      shopId,
      name: 'Proveedor Ejemplo SA',
      legalName: 'Proveedor Ejemplo SA',
      taxId: '30-12345678-9',
      bankAlias: 'proveedor.ejemplo',
      notes: 'Verduras y abarrotes',
      accountId: 'demo-acc-sup-1',
      accountName: 'Proveedor Ejemplo SA',
      active: true,
    },
  ];
}

export function demoServices(shopId: string) {
  return [
    {
      id: 'demo-svc-1',
      shopId,
      name: 'Gas natural',
      legalName: 'Distribuidora Demo',
      taxId: null,
      bankAlias: 'gas.demo',
      notes: null,
      accountId: 'demo-acc-svc-1',
      accountName: 'Gas natural',
      active: true,
    },
  ];
}

export function demoShopUsers() {
  return demoUsers().map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    active: u.active,
    globalRole: u.globalRole,
  }));
}

export function demoShortages(shopId: string) {
  const { today } = demoDateParts();
  return [
    {
      id: 'demo-sh-1',
      shopId,
      name: 'Papas',
      level: DemoShortageLevel.LOW,
      levelLabel: DemoShortageLevelLabel.LOW,
      notes: 'Quedan dos bolsas',
      active: true,
      createdAt: `${today}T08:00:00.000Z`,
      updatedAt: `${today}T08:00:00.000Z`,
    },
    {
      id: 'demo-sh-2',
      shopId,
      name: 'Aceite',
      level: DemoShortageLevel.NONE,
      levelLabel: DemoShortageLevelLabel.NONE,
      notes: 'Pedir urgente',
      active: true,
      createdAt: `${today}T08:30:00.000Z`,
      updatedAt: `${today}T08:30:00.000Z`,
    },
    {
      id: 'demo-sh-3',
      shopId,
      name: 'Coca 500',
      level: DemoShortageLevel.NORMAL,
      levelLabel: DemoShortageLevelLabel.NORMAL,
      notes: null,
      active: true,
      createdAt: `${today}T09:00:00.000Z`,
      updatedAt: null,
    },
  ];
}

export function demoStockCategories(shopId: string, kind: DemoStockKind) {
  if (kind === 'beverage') {
    return [
      {
        id: 'demo-stc-beb',
        shopId,
        name: 'Gaseosas',
        active: true,
        kind,
      },
    ];
  }
  return [
    {
      id: 'demo-stc-food',
      shopId,
      name: 'Secos',
      active: true,
      kind,
    },
  ];
}

export function demoStockProducts(shopId: string, kind: DemoStockKind) {
  if (kind === 'beverage') {
    return [
      {
        id: 'demo-stp-coca',
        shopId,
        categoryId: 'demo-stc-beb',
        categoryName: 'Gaseosas',
        name: 'Coca 500 ml',
        minQuantity: 12,
        maxQuantity: 48,
        quantity: 20,
        belowMinimum: false,
        active: true,
        kind,
      },
    ];
  }
  return [
    {
      id: 'demo-stp-harina',
      shopId,
      categoryId: 'demo-stc-food',
      categoryName: 'Secos',
      name: 'Harina 000',
      minQuantity: 5,
      maxQuantity: 20,
      quantity: 3,
      belowMinimum: true,
      active: true,
      kind,
    },
  ];
}

export function demoMovements(shopId: string) {
  const { today, day2, day5 } = demoDateParts();
  return [
    {
      id: 'demo-mov-1',
      shopId,
      businessDate: today,
      createdAt: `${today}T14:00:00.000Z`,
      fromAccountId: DEMO_ACCOUNT_IDS.efectivo,
      toAccountId: DEMO_ACCOUNT_IDS.egreso,
      fromAccountName: 'Efectivo Caja',
      toAccountName: '2. Egreso',
      description: 'Compra verdulería',
      amountUyu: 45000,
      conceptId: DEMO_CONCEPT_IDS.verduleria,
      conceptName: 'Verdulería',
      conceptKind: DemoConceptKind.EXPENSE,
      invoiced: false,
      source: 'manual',
      paymentMethod: DemoPaymentMethod.CASH,
      active: true,
    },
    {
      id: 'demo-mov-2',
      shopId,
      businessDate: day2,
      createdAt: `${day2}T20:00:00.000Z`,
      fromAccountId: DEMO_ACCOUNT_IDS.ingreso,
      toAccountId: DEMO_ACCOUNT_IDS.efectivo,
      fromAccountName: '1. Ingreso',
      toAccountName: 'Efectivo Caja',
      description: 'Cobro del día',
      amountUyu: 185000,
      conceptId: DEMO_CONCEPT_IDS.cobro,
      conceptName: 'Cobro',
      conceptKind: DemoConceptKind.INCOME,
      invoiced: false,
      source: 'closing',
      active: true,
    },
    {
      id: 'demo-mov-3',
      shopId,
      businessDate: day5,
      createdAt: `${day5}T11:00:00.000Z`,
      fromAccountId: DEMO_ACCOUNT_IDS.mp,
      toAccountId: DEMO_ACCOUNT_IDS.efectivo,
      fromAccountName: 'Mercado Pago',
      toAccountName: 'Efectivo Caja',
      description: 'Paso a efectivo',
      amountUyu: 50000,
      conceptId: DEMO_CONCEPT_IDS.transferencia,
      conceptName: 'Transferencia e/ cuentas',
      conceptKind: DemoConceptKind.TRANSFER,
      invoiced: false,
      source: 'manual',
      active: true,
    },
  ];
}

export function demoSalesSummary(shopId: string) {
  const { today, monthStart, day2, day5 } = demoDateParts();
  return {
    shopId,
    from: monthStart,
    to: today,
    totals: {
      qty: 86,
      amount: 812000,
      lineCount: 94,
      productCount: 4,
      categoryCount: 2,
      subcategoryCount: 0,
      ticketCount: 42,
      avgTicketAmount: 19333,
      dishesPerTicket: 2.05,
      top10Share: 1,
      amountDeltaPct: 8.5,
    },
    products: [
      {
        productCode: 'MIL',
        productName: 'Milanesa al pan',
        category: 'Clásicos',
        subcategory: null,
        qty: 32,
        amount: 400000,
        ticketCount: 28,
        share: 0.49,
        avgTicketAmount: 14286,
        trendPct: 5,
      },
      {
        productCode: 'LOM',
        productName: 'Lomito completo',
        category: 'Clásicos',
        subcategory: null,
        qty: 24,
        amount: 348000,
        ticketCount: 22,
        share: 0.43,
        avgTicketAmount: 15818,
        trendPct: -2,
      },
      {
        productCode: 'AGUA',
        productName: 'Agua 500 ml',
        category: 'Bebidas',
        subcategory: null,
        qty: 18,
        amount: 45000,
        ticketCount: 16,
        share: 0.06,
        avgTicketAmount: 2813,
        trendPct: 12,
      },
      {
        productCode: 'GAS',
        productName: 'Gaseosa 500 ml',
        category: 'Bebidas',
        subcategory: null,
        qty: 12,
        amount: 19000,
        ticketCount: 10,
        share: 0.02,
        avgTicketAmount: 1900,
        trendPct: 0,
      },
    ],
    categories: [
      {
        category: 'Clásicos',
        productCount: 2,
        qty: 56,
        amount: 748000,
        ticketCount: 40,
        share: 0.92,
      },
      {
        category: 'Bebidas',
        productCount: 2,
        qty: 30,
        amount: 64000,
        ticketCount: 24,
        share: 0.08,
      },
    ],
    byDay: [
      { date: day5, qty: 20, amount: 190000, ticketCount: 10 },
      { date: day2, qty: 28, amount: 270000, ticketCount: 14 },
      { date: today, qty: 38, amount: 352000, ticketCount: 18 },
    ],
    byPayment: [
      {
        paymentCode: 'EFECTIVO',
        qty: 40,
        amount: 380000,
        ticketCount: 20,
        share: 0.47,
      },
      {
        paymentCode: 'MP',
        qty: 46,
        amount: 432000,
        ticketCount: 22,
        share: 0.53,
      },
    ],
    pareto: [
      { label: 'Milanesa al pan', amount: 400000, cumulativeShare: 0.49 },
      { label: 'Lomito completo', amount: 348000, cumulativeShare: 0.92 },
      { label: 'Agua 500 ml', amount: 45000, cumulativeShare: 0.98 },
      { label: 'Gaseosa 500 ml', amount: 19000, cumulativeShare: 1 },
    ],
    sameWeekdayCompare: [
      {
        date: today,
        amount: 352000,
        previousDate: day5,
        previousAmount: 190000,
        deltaPct: 85.3,
      },
    ],
    filterOptions: {
      categories: ['Clásicos', 'Bebidas'],
      subcategories: [],
      paymentCodes: ['EFECTIVO', 'MP'],
    },
  };
}

export function demoPosLinkedPreview(shopId: string) {
  const { today, monthStart } = demoDateParts();
  return {
    shopId,
    from: monthStart,
    to: today,
    linkedCount: 2,
    withPosSalesCount: 2,
    totals: { posQty: 56, posAmount: 748000, cartaAmount: 748000 },
    items: [
      {
        menuItemId: DEMO_MENU_ITEM_IDS.milanesa,
        menuItemName: 'Milanesa al pan',
        productCode: 'MIL',
        productName: 'Milanesa al pan',
        category: 'Clásicos',
        subcategory: null,
        cartaQty: 32,
        cartaAmount: 400000,
        posQty: 32,
        posAmount: 400000,
        posTicketCount: 28,
      },
      {
        menuItemId: DEMO_MENU_ITEM_IDS.lomito,
        menuItemName: 'Lomito completo',
        productCode: 'LOM',
        productName: 'Lomito completo',
        category: 'Clásicos',
        subcategory: null,
        cartaQty: 24,
        cartaAmount: 348000,
        posQty: 24,
        posAmount: 348000,
        posTicketCount: 22,
      },
    ],
  };
}

export function demoConceptsReport(shopId: string) {
  const { today, monthStart, day2, day5 } = demoDateParts();
  return {
    shopId,
    from: monthStart,
    to: today,
    conceptOptions: [
      { id: DEMO_CONCEPT_IDS.cobro, name: 'Cobro', kind: DemoConceptKind.INCOME },
      { id: DEMO_CONCEPT_IDS.verduleria, name: 'Verdulería', kind: DemoConceptKind.EXPENSE },
      { id: DEMO_CONCEPT_IDS.sueldos, name: 'Sueldos', kind: DemoConceptKind.EXPENSE },
    ],
    comparison: {
      incomeDeltaPct: 6.2,
      expenseDeltaPct: -3.1,
      countDeltaPct: 4,
    },
    totals: {
      movementCount: 3,
      income: 185000,
      expense: 45000,
      transfer: 50000,
      net: 140000,
      withoutConceptCount: 0,
      withoutConceptAmount: 0,
      avgAmount: 93333,
    },
    byKind: [
      { kind: DemoConceptKind.INCOME, count: 1, amount: 185000, share: 0.66 },
      { kind: DemoConceptKind.EXPENSE, count: 1, amount: 45000, share: 0.16 },
      { kind: DemoConceptKind.TRANSFER, count: 1, amount: 50000, share: 0.18 },
    ],
    byConcept: [
      {
        conceptId: DEMO_CONCEPT_IDS.cobro,
        name: 'Cobro',
        kind: DemoConceptKind.INCOME,
        count: 1,
        amount: 185000,
        avgAmount: 185000,
        share: 0.66,
      },
      {
        conceptId: DEMO_CONCEPT_IDS.verduleria,
        name: 'Verdulería',
        kind: DemoConceptKind.EXPENSE,
        count: 1,
        amount: 45000,
        avgAmount: 45000,
        share: 0.16,
      },
    ],
    byDay: [
      {
        businessDate: day5,
        count: 1,
        income: 0,
        expense: 0,
        transfer: 50000,
      },
      {
        businessDate: day2,
        count: 1,
        income: 185000,
        expense: 0,
        transfer: 0,
      },
      {
        businessDate: today,
        count: 1,
        income: 0,
        expense: 45000,
        transfer: 0,
      },
    ],
  };
}

export function demoPartnerSplits(shopId: string) {
  return {
    config: {
      partnerAccountIds: [DEMO_ACCOUNT_IDS.socioA, DEMO_ACCOUNT_IDS.socioB],
      channelLeaves: [
        { accountId: DEMO_ACCOUNT_IDS.efectivo, leaveAmount: 15000 },
        { accountId: DEMO_ACCOUNT_IDS.mp, leaveAmount: 0 },
      ],
      extras: [],
    },
    partners: [
      {
        accountId: DEMO_ACCOUNT_IDS.socioA,
        name: 'Socio Ana',
        current: 80000,
        target: 90000,
        difference: 10000,
        share: 0.5,
        included: true,
        ownershipPercent: 50,
      },
      {
        accountId: DEMO_ACCOUNT_IDS.socioB,
        name: 'Socio Bruno',
        current: 75500,
        target: 90000,
        difference: 14500,
        share: 0.5,
        included: true,
        ownershipPercent: 50,
      },
    ],
    channels: [
      {
        accountId: DEMO_ACCOUNT_IDS.efectivo,
        name: 'Efectivo Caja',
        current: 45200,
        target: 15000,
        difference: -30200,
        leaveAmount: 15000,
        included: true,
      },
      {
        accountId: DEMO_ACCOUNT_IDS.mp,
        name: 'Mercado Pago',
        current: 128500,
        target: 0,
        difference: -128500,
        leaveAmount: 0,
        included: true,
      },
    ],
    extras: [],
    availablePartners: [
      {
        accountId: DEMO_ACCOUNT_IDS.socioA,
        name: 'Socio Ana',
        included: true,
        current: 80000,
      },
      {
        accountId: DEMO_ACCOUNT_IDS.socioB,
        name: 'Socio Bruno',
        included: true,
        current: 75500,
      },
    ],
    totals: {
      balances: 329200,
      reserves: 15000,
      extras: 0,
      toDistribute: 314200,
      share: 157100,
      differences: 24500,
    },
    transfers: [
      {
        fromAccountId: DEMO_ACCOUNT_IDS.mp,
        fromName: 'Mercado Pago',
        toAccountId: DEMO_ACCOUNT_IDS.socioA,
        toName: 'Socio Ana',
        amount: 10000,
      },
      {
        fromAccountId: DEMO_ACCOUNT_IDS.mp,
        fromName: 'Mercado Pago',
        toAccountId: DEMO_ACCOUNT_IDS.socioB,
        toName: 'Socio Bruno',
        amount: 14500,
      },
    ],
  };
}

export function demoPartnerSplitRuns(shopId: string) {
  const { today } = demoDateParts();
  return [
    {
      id: 'demo-split-run-1',
      shopId,
      createdAt: `${today}T18:00:00.000Z`,
      createdByName: 'Admin Demo',
      kind: 'classic',
      movementCount: 2,
      totalAmount: 24500,
      snapshot: demoPartnerSplits(shopId),
    },
  ];
}

export function demoServiceRules(shopId: string) {
  return {
    categories: [
      {
        id: 'demo-srcat-1',
        shopId,
        name: 'Salón',
        sortOrder: 0,
        active: true,
      },
    ],
    rules: [
      {
        id: 'demo-srrule-1',
        shopId,
        categoryId: 'demo-srcat-1',
        phase: DemoServiceRulePhase.PRE,
        title: 'Revisar mesas',
        body: 'Antes de abrir, chequear limpio, cubiertos y carta.',
        sortOrder: 0,
        active: true,
      },
      {
        id: 'demo-srrule-2',
        shopId,
        categoryId: 'demo-srcat-1',
        phase: DemoServiceRulePhase.DURING,
        title: 'Tiempos de cocina',
        body: 'Avisar si un plato supera los 20 minutos.',
        sortOrder: 1,
        active: true,
      },
      {
        id: 'demo-srrule-3',
        shopId,
        categoryId: 'demo-srcat-1',
        phase: DemoServiceRulePhase.POST,
        title: 'Cierre de salón',
        body: 'Apagar luces y dejar caja cuadrada.',
        sortOrder: 2,
        active: true,
      },
    ],
  };
}

export function demoClosings(shopId: string) {
  const { today, day2 } = demoDateParts();
  return [
    {
      id: 'demo-closing-1',
      shopId,
      businessDate: day2,
      status: DemoClosingStatus.CLOSED,
      shiftName: 'Noche',
      declaredTotal: 270000,
      calculatedTotal: 270000,
      difference: 0,
      createdAt: `${day2}T23:30:00.000Z`,
      createdByName: 'Cajero Ejemplo',
    },
    {
      id: 'demo-closing-2',
      shopId,
      businessDate: today,
      status: DemoClosingStatus.DRAFT,
      shiftName: 'Mañana',
      declaredTotal: 95000,
      calculatedTotal: 95000,
      difference: 0,
      createdAt: `${today}T14:00:00.000Z`,
      createdByName: 'Admin Demo',
    },
  ];
}

export function demoSalesSystems() {
  return [
    {
      id: 'demo-ss-1',
      name: 'Restosoft demo',
      type: 'RESTOSOFT',
      active: true,
      shopIds: [DEMO_SHOP_ID],
    },
  ];
}

export function demoPublicMenu(slug: string) {
  const shop = buildDemoShop();
  return {
    shop: {
      id: shop.id,
      name: shop.name,
      slug: shop.slug || slug,
      logoUrl: null,
      accentColor: shop.accentColor,
    },
    menus: demoMenu().menus,
    menu: demoMenu().menus[0],
    promos: demoPromos().promos,
  };
}
