import { Permission } from '../auth/auth.models';

export type HelpBlock = {
  title: string;
  body: string;
  /** Si está vacío, se muestra a cualquiera que vea la pantalla. */
  anyOf?: Permission[];
};

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  blocks: HelpBlock[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'home',
    title: 'Inicio',
    summary: 'Resumen del local: atajos, presentismo de hoy y avisos.',
    blocks: [
      {
        title: 'Qué ves',
        body: 'El inicio muestra el estado del día: presentismo de servicio, accesos rápidos y notificaciones. El contenido cambia según tus permisos.',
      },
    ],
  },
  {
    id: 'closings',
    title: 'Cierres',
    summary: 'Listado y seguimiento de cierres de caja del local.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['closings.read'],
        body: 'Consultá cierres por fecha, estado (borrador, enviado, bloqueado) y totales. Desde acá se entra a editar si tenés permiso.',
      },
      {
        title: 'Crear y editar',
        anyOf: ['closings.create', 'closings.update'],
        body: 'Un cierre carga ventas, efectivo, posnets, cuentas aparte, cubiertos y gastos del día. Podés guardar borrador y enviarlo.',
      },
      {
        title: 'Bloquear',
        anyOf: ['closings.lock'],
        body: 'Un cierre bloqueado no se edita. Sirve para cerrar el día cuando ya está conciliado.',
      },
    ],
  },
  {
    id: 'closings-new',
    title: 'Nuevo cierre',
    summary: 'Formulario para cargar el cierre del día.',
    blocks: [
      {
        title: 'Alcance',
        anyOf: ['closings.create', 'closings.update'],
        body: 'Completá canales de cobro, efectivo contado, retiros, posnets, gastos y observaciones. El total declarado se compara con lo esperado.',
      },
    ],
  },
  {
    id: 'cash-withdrawals',
    title: 'A retirar',
    summary: 'Efectivo retirado de cierres que todavía no se asignó a un socio.',
    blocks: [
      {
        title: 'Uso',
        anyOf: ['closings.read'],
        body: 'Listá retiros pendientes, marcalos como retirados y asignalos a la cuenta de un socio cuando corresponda.',
      },
    ],
  },
  {
    id: 'settlements',
    title: 'Rendiciones',
    summary: 'Cuentas aparte que rinden después (efectivo o depósito).',
    blocks: [
      {
        title: 'Uso',
        anyOf: ['closings.read'],
        body: 'Seguimiento de rendiciones pendientes y realizadas según las cuentas aparte del local.',
      },
    ],
  },
  {
    id: 'movements',
    title: 'Movimientos',
    summary: 'Ingresos, egresos y transferencias entre cuentas del local.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['movements.read'],
        body: 'Filtrá por fecha, cuenta, concepto y tipo. Podés exportar si tenés reportes.',
      },
      {
        title: 'Gestionar',
        anyOf: ['movements.manage'],
        body: 'Cargá movimientos y gastos rápidos. Elegí cuenta origen/destino y concepto. Se puede avisar a admins al crear.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Pagos',
    summary: 'Pagos a proveedores, servicios o empleados, con validación y comprobantes.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['payments.read'],
        body: 'Listá pagos en tarjetas o lista, filtrá por estado, proveedor y fechas. El concepto validado alimenta reportes.',
      },
      {
        title: 'Gestionar',
        anyOf: ['payments.manage'],
        body: 'Creá pagos (borrador o anidados), validá, rechazá, marcá pagado y subí facturas. Hay vista de selección masiva.',
      },
    ],
  },
  {
    id: 'suppliers',
    title: 'Proveedores',
    summary: 'Catálogo de proveedores y su cuenta asociada.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['suppliers.read'],
        body: 'Consultá proveedores activos para usarlos en pagos.',
      },
      {
        title: 'Gestionar',
        anyOf: ['suppliers.manage'],
        body: 'Alta, edición y baja. Cada proveedor puede tener una cuenta contable.',
      },
    ],
  },
  {
    id: 'services',
    title: 'Servicios',
    summary: 'Catálogo de servicios (luz, gas, etc.) para pagos.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['services.read'],
        body: 'Listado de servicios del local.',
      },
      {
        title: 'Gestionar',
        anyOf: ['services.manage'],
        body: 'Creá y editá servicios y su cuenta asociada.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reportes',
    summary: 'Cierres, totales y exportación Excel del período.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['reports.view'],
        body: 'Elegí un rango y ves KPIs, movimientos y tablas. El Excel general incluye hojas de presentismo y liquidación si hay datos.',
      },
      {
        title: 'Exportar',
        anyOf: ['reports.export'],
        body: 'Descargá el Excel del período desde el botón del encabezado.',
      },
    ],
  },
  {
    id: 'reports-concepts',
    title: 'Conceptos (reporte)',
    summary: 'Importe por concepto validado y participación sobre el total.',
    blocks: [
      {
        title: 'Uso',
        anyOf: ['reports.view'],
        body: 'Filtrá por período y tipo (egreso/ingreso/transferencia). La tabla principal suma importes y % (100% el total).',
      },
      {
        title: 'Excel',
        anyOf: ['reports.export'],
        body: 'Descargá una hoja tipo Excel con el mismo recorte.',
      },
    ],
  },
  {
    id: 'reports-products',
    title: 'Ventas POS',
    summary: 'Productos vendidos según el sistema de ventas del local.',
    blocks: [
      {
        title: 'Uso',
        anyOf: ['reports.view'],
        body: 'Requiere un sistema POS configurado en el local. Muestra platos/rubros del período.',
      },
    ],
  },
  {
    id: 'reports-stats',
    title: 'Estadísticas',
    summary: 'Gráficos de evolución y mix.',
    blocks: [
      {
        title: 'Uso',
        anyOf: ['reports.view'],
        body: 'Visualizaciones del período seleccionado para comparar ingresos, egresos y canales.',
      },
    ],
  },
  {
    id: 'reservations',
    title: 'Reservas',
    summary: 'Agenda de mesas, solicitudes web y tablero del día.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['reservations.read'],
        body: 'Calendario y listado por turno (adentro/afuera). Recargar también actualiza reservas ya aceptadas.',
      },
      {
        title: 'Gestionar',
        anyOf: ['reservations.manage'],
        body: 'Creá, editá, sentá y cancelá. Aceptá o rechazá solicitudes públicas. Hay tablero público /r y formulario /reservar.',
      },
    ],
  },
  {
    id: 'waiting-list',
    title: 'Lista de espera',
    summary: 'Cola de espera del salón.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['waitingList.read'],
        body: 'Consultá quién espera mesa adentro o afuera.',
      },
      {
        title: 'Gestionar',
        anyOf: ['waitingList.manage'],
        body: 'Agregá, llamá y cerrá turnos. Hay pantalla pública /w.',
      },
    ],
  },
  {
    id: 'salon',
    title: 'Salón',
    summary: 'Diagrama de mesas y reglas de aforo (no son las normas de servicio).',
    blocks: [
      {
        title: 'Diagrama',
        anyOf: ['reservations.read'],
        body: 'Mesas del salón, combinación y ocupación del turno.',
      },
      {
        title: 'Reglas de mesas',
        anyOf: ['reservations.manage'],
        body: 'Definí slots de cantidad de personas por sector. Es independiente de las normas pre/post servicio.',
      },
    ],
  },
  {
    id: 'stock',
    title: 'Stock alimentos',
    summary: 'Inventario de insumos de cocina.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['stock.read'],
        body: 'Tarjetas o lista, orden alfabético o por faltante. Alertas bajo mínimo.',
      },
      {
        title: 'Gestionar',
        anyOf: ['stock.manage'],
        body: 'Ajustá cantidades, mínimos, envíos entre locales y compartí un snapshot con admins.',
      },
    ],
  },
  {
    id: 'beverage-stock',
    title: 'Stock bebidas',
    summary: 'Inventario de bar y bebidas.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['beverageStock.read'],
        body: 'Mismo esquema que alimentos, para bebidas.',
      },
      {
        title: 'Gestionar',
        anyOf: ['beverageStock.manage'],
        body: 'Cargas, mínimos y alertas de stock bajo.',
      },
    ],
  },
  {
    id: 'shortages',
    title: 'Faltantes',
    summary: 'Faltantes operativos con nivel (nada/poco/normal/mucho).',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['shortages.read'],
        body: 'Listado y filtros por nivel. Los críticos avisan a admins.',
      },
      {
        title: 'Gestionar',
        anyOf: ['shortages.manage'],
        body: 'Cargá y actualizá el nivel. Subir a normal/mucho se interpreta como resuelto.',
      },
    ],
  },
  {
    id: 'attendance',
    title: 'Asistencia · Servicio',
    summary: 'Presentismo diario con hora de entrada y salida.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['attendance.read'],
        body: 'Tablero del mes, panel del día y resumen de horas extra en un rango. Extra = horas después de la hora de retirada del local.',
      },
      {
        title: 'Marcar',
        anyOf: ['attendance.manage'],
        body: 'Al pasar presente se asignan la entrada y salida default del local. Podés cambiarlas por empleado. “Todos presentes” no incluye rotativos. El feriado se marca con clic derecho / mantener.',
      },
      {
        title: 'Costo extra',
        anyOf: ['attendance.read'],
        body: 'El precio por hora se carga en cada empleado. El reporte suma extras × tarifa. La liquidación sigue usando sueldo/21/8 sobre las horas extra calculadas.',
      },
    ],
  },
  {
    id: 'production-attendance',
    title: 'Asistencia · Producción',
    summary: 'Horas de quienes producen comida.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['attendance.read'],
        body: 'Grilla mensual de horas. Solo empleados con “produce comida”.',
      },
      {
        title: 'Marcar',
        anyOf: ['attendance.manage'],
        body: 'Un toque carga las horas default del local; se pueden editar. Distinto del presentismo de servicio.',
      },
    ],
  },
  {
    id: 'my-production',
    title: 'Mis horas de producción',
    summary: 'Carga de horas propias y del equipo a cargo.',
    blocks: [
      {
        title: 'Productor',
        anyOf: ['attendance.self'],
        body: 'Cargá tus horas por día/semana/mes. Si sos supervisor, también las de tu equipo. No da acceso al tablero de servicio.',
      },
    ],
  },
  {
    id: 'employees',
    title: 'Empleados',
    summary: 'Fichas de personal, sueldo, tipo y tarifa de hora extra.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['employees.read'],
        body: 'Listado de empleados visibles, tipo fijo/rotativo y si producen comida.',
      },
      {
        title: 'Gestionar',
        anyOf: ['employees.manage'],
        body: 'Alta y edición: sueldo, precio por hora extra, alias/CBU (productores), supervisor y usuario vinculado.',
      },
    ],
  },
  {
    id: 'candidates',
    title: 'CVs / Candidatos',
    summary: 'Banco de currículums del local.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['candidates.read'],
        body: 'Consultá postulantes y archivos.',
      },
      {
        title: 'Gestionar',
        anyOf: ['candidates.manage'],
        body: 'Cargá y actualizá candidatos y CVs.',
      },
    ],
  },
  {
    id: 'payroll',
    title: 'Liquidaciones',
    summary: 'Cálculo mensual a partir del presentismo de servicio.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['payroll.read'],
        body: 'Presentismo, feriados y horas extra (calculadas por horario) × sueldo/21/8, más bonus de presentismo si aplica.',
      },
      {
        title: 'Gestionar',
        anyOf: ['payroll.manage'],
        body: 'Generá y bloqueá períodos de liquidación.',
      },
    ],
  },
  {
    id: 'commissions',
    title: 'Comisiones',
    summary: 'Reglas de comisión por empleado o ventas.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['commissions.read'],
        body: 'Consultá reglas y liquidaciones de comisión.',
      },
      {
        title: 'Gestionar',
        anyOf: ['commissions.manage'],
        body: 'Definí reglas y calculá comisiones del período.',
      },
    ],
  },
  {
    id: 'reimbursements',
    title: 'Reintegros',
    summary: 'Gastos de productores a devolver.',
    blocks: [
      {
        title: 'Mis gastos',
        anyOf: ['reimbursements.self'],
        body: 'Cargá descripción, importe y usá tu alias/CBU. Un admin marca pagado.',
      },
      {
        title: 'Ver todos',
        anyOf: ['reimbursements.read'],
        body: 'Listado de reintegros del local y estados.',
      },
      {
        title: 'Pagar',
        anyOf: ['reimbursements.manage'],
        body: 'Marcá pagado y subí comprobante.',
      },
    ],
  },
  {
    id: 'service-rules',
    title: 'Normas de servicio',
    summary: 'Reglas pre y post servicio agrupadas por categoría, con PDF para pegar.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['serviceRules.read'],
        body: 'Leé las normas del local. En la página pública /n descargás un PDF para pegar en la pared.',
      },
      {
        title: 'Gestionar',
        anyOf: ['serviceRules.manage'],
        body: 'Creá categorías (Cocina, Salón, Caja…) y reglas Pre o Post servicio. Ordená y editá el texto. No hace falta ser admin del local.',
      },
    ],
  },
  {
    id: 'tips',
    title: 'Propinas',
    summary: 'Caja diaria de propinas y reparto.',
    blocks: [
      {
        title: 'Ver',
        anyOf: ['tips.read'],
        body: 'Consultá propinas del día y el histórico.',
      },
      {
        title: 'Cargar',
        anyOf: ['tips.create'],
        body: 'Ingresá el total del día (efectivo, transferencia, tickets).',
      },
      {
        title: 'Gestionar',
        anyOf: ['tips.manage'],
        body: 'Reparto y ajustes de propinas.',
      },
    ],
  },
  {
    id: 'admin-shop',
    title: 'Local',
    summary: 'Identidad, horarios de servicio, módulos públicos y operación.',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['shops.manage'],
        body: 'Configurá logo, colores, mails, francos, hora de entrada/salida de servicio, horas default de producción, presentismo público y normas públicas.',
      },
    ],
  },
  {
    id: 'admin-shops',
    title: 'Locales',
    summary: 'Alta de locales (solo super admin).',
    blocks: [
      {
        title: 'Super admin',
        body: 'Creá y desactivá locales de la red.',
      },
    ],
  },
  {
    id: 'admin-users',
    title: 'Usuarios',
    summary: 'Alta de usuarios y permisos por módulo.',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['users.manage'],
        body: 'Invitá usuarios, asigná presets (cajero, productor, recepcionista…) o módulos uno a uno. El productor combina asistencia self + reintegros self.',
      },
    ],
  },
  {
    id: 'admin-accounts',
    title: 'Cuentas',
    summary: 'Plan de cuentas del local.',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['accounts.manage'],
        body: 'Cuentas de caja, bancos y sistema. Se usan en movimientos, pagos y cierres.',
      },
    ],
  },
  {
    id: 'admin-concepts',
    title: 'Conceptos',
    summary: 'Catálogo de conceptos contables y categorías.',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['concepts.manage'],
        body: 'Alta de conceptos, tipo (ingreso/egreso/transferencia) y categorías. Un concepto puede tener varias categorías para aparecer en distintos pagos.',
      },
    ],
  },
  {
    id: 'admin-messages',
    title: 'Mensajes',
    summary: 'Plantillas de mail del local.',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['shops.manage'],
        body: 'Asunto y cuerpo por tipo de notificación. Placeholders: {shop} {guest} {name} {detail}.',
      },
    ],
  },
  {
    id: 'admin-menu',
    title: 'Carta',
    summary: 'Cartas públicas del local (menú, vinos, etc.).',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['shops.manage'],
        body: 'Publicá una o más cartas. La página /m es pública si el módulo está activo.',
      },
    ],
  },
  {
    id: 'admin-qr',
    title: 'QR',
    summary: 'Generador de códigos QR (links públicos, Wi‑Fi, texto).',
    blocks: [
      {
        title: 'Uso',
        anyOf: ['shops.manage'],
        body: 'Pegá la URL de reservas, presentismo, normas (/n) o carta y descargá PNG o PDF del código.',
      },
    ],
  },
  {
    id: 'admin-sales-systems',
    title: 'Sistemas de ventas',
    summary: 'Conectores POS (Restosoft, WeMenu, etc.).',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['shops.manage'],
        body: 'Definí cómo interpretar reportes de ventas del POS.',
      },
    ],
  },
  {
    id: 'admin-pos-products',
    title: 'Platos y rubros POS',
    summary: 'Catálogo de productos del sistema de ventas.',
    blocks: [
      {
        title: 'Gestionar',
        anyOf: ['shops.manage'],
        body: 'Mapeo de platos/rubros para el reporte de ventas POS.',
      },
    ],
  },
  {
    id: 'admin-help',
    title: 'Instrucciones',
    summary: 'Manual completo de la app para administradores.',
    blocks: [
      {
        title: 'Uso',
        anyOf: ['shops.manage'],
        body: 'Acá está todo el alcance por módulo. El encabezado descarga un PDF del manual.',
      },
    ],
  },
];

const PATH_HELP: Array<{ test: (path: string) => boolean; id: string }> = [
  { test: (p) => p === '/' || p === '', id: 'home' },
  { test: (p) => p.startsWith('/closings/new') || /\/closings\/[^/]+$/.test(p), id: 'closings-new' },
  { test: (p) => p.startsWith('/closings'), id: 'closings' },
  { test: (p) => p.startsWith('/cash-withdrawals'), id: 'cash-withdrawals' },
  { test: (p) => p.startsWith('/settlements'), id: 'settlements' },
  { test: (p) => p.startsWith('/movements'), id: 'movements' },
  { test: (p) => p.startsWith('/payments'), id: 'payments' },
  { test: (p) => p.startsWith('/suppliers'), id: 'suppliers' },
  { test: (p) => p.startsWith('/services'), id: 'services' },
  { test: (p) => p.startsWith('/reports/concepts'), id: 'reports-concepts' },
  { test: (p) => p.startsWith('/reports/products'), id: 'reports-products' },
  { test: (p) => p.startsWith('/reports/stats'), id: 'reports-stats' },
  { test: (p) => p.startsWith('/reports'), id: 'reports' },
  { test: (p) => p.startsWith('/reservations'), id: 'reservations' },
  { test: (p) => p.startsWith('/waiting-list'), id: 'waiting-list' },
  { test: (p) => p.startsWith('/salon'), id: 'salon' },
  { test: (p) => p.startsWith('/beverage-stock'), id: 'beverage-stock' },
  { test: (p) => p.startsWith('/stock'), id: 'stock' },
  { test: (p) => p.startsWith('/shortages'), id: 'shortages' },
  { test: (p) => p.startsWith('/my-production'), id: 'my-production' },
  { test: (p) => p.startsWith('/production-attendance'), id: 'production-attendance' },
  { test: (p) => p.startsWith('/attendance'), id: 'attendance' },
  { test: (p) => p.startsWith('/employees'), id: 'employees' },
  { test: (p) => p.startsWith('/candidates'), id: 'candidates' },
  { test: (p) => p.startsWith('/payroll'), id: 'payroll' },
  { test: (p) => p.startsWith('/commissions'), id: 'commissions' },
  { test: (p) => p.startsWith('/reimbursements'), id: 'reimbursements' },
  { test: (p) => p.startsWith('/service-rules'), id: 'service-rules' },
  { test: (p) => p.startsWith('/tips'), id: 'tips' },
  { test: (p) => p.startsWith('/admin/shops'), id: 'admin-shops' },
  { test: (p) => p.startsWith('/admin/shop'), id: 'admin-shop' },
  { test: (p) => p.startsWith('/admin/users'), id: 'admin-users' },
  { test: (p) => p.startsWith('/admin/accounts'), id: 'admin-accounts' },
  { test: (p) => p.startsWith('/admin/concepts'), id: 'admin-concepts' },
  { test: (p) => p.startsWith('/admin/messages'), id: 'admin-messages' },
  { test: (p) => p.startsWith('/admin/menu'), id: 'admin-menu' },
  { test: (p) => p.startsWith('/admin/qr'), id: 'admin-qr' },
  { test: (p) => p.startsWith('/admin/sales-systems'), id: 'admin-sales-systems' },
  { test: (p) => p.startsWith('/admin/pos-products'), id: 'admin-pos-products' },
  { test: (p) => p.startsWith('/admin/instrucciones'), id: 'admin-help' },
];

export function helpIdFromPath(url: string): string | null {
  const path = url.split('?')[0];
  const hit = PATH_HELP.find((r) => r.test(path));
  return hit?.id ?? null;
}

export function topicById(id: string | null | undefined): HelpTopic | null {
  if (!id) return null;
  return HELP_TOPICS.find((t) => t.id === id) ?? null;
}

const TOPIC_ICONS: Record<string, string> = {
  home: 'home',
  closings: 'point_of_sale',
  'closings-new': 'point_of_sale',
  'cash-withdrawals': 'payments',
  settlements: 'account_balance_wallet',
  movements: 'swap_horiz',
  payments: 'payments',
  suppliers: 'inventory_2',
  services: 'home_repair_service',
  reports: 'insights',
  'reports-concepts': 'category',
  'reports-products': 'restaurant_menu',
  'reports-stats': 'analytics',
  reservations: 'table_restaurant',
  'waiting-list': 'hourglass_top',
  salon: 'grid_view',
  stock: 'inventory',
  'beverage-stock': 'local_bar',
  shortages: 'report',
  attendance: 'storefront',
  'production-attendance': 'restaurant',
  'my-production': 'restaurant',
  employees: 'badge',
  candidates: 'person_search',
  payroll: 'request_quote',
  commissions: 'percent',
  reimbursements: 'receipt_long',
  'service-rules': 'menu_book',
  tips: 'volunteer_activism',
  'admin-shop': 'storefront',
  'admin-shops': 'store',
  'admin-users': 'group',
  'admin-accounts': 'account_balance',
  'admin-concepts': 'sell',
  'admin-messages': 'mail',
  'admin-menu': 'menu_book',
  'admin-qr': 'qr_code_2',
  'admin-sales-systems': 'dns',
  'admin-pos-products': 'restaurant_menu',
  'admin-help': 'help_outline',
};

const BLOCK_ICONS: Record<string, string> = {
  'Qué ves': 'visibility',
  Ver: 'visibility',
  'Ver todos': 'visibility',
  Gestionar: 'tune',
  'Crear y editar': 'edit_note',
  Bloquear: 'lock',
  Uso: 'touch_app',
  Marcar: 'check_circle',
  'Costo extra': 'schedule',
  Exportar: 'download',
  Excel: 'table_view',
  Diagrama: 'grid_view',
  'Reglas de mesas': 'tune',
  Productor: 'restaurant',
  'Mis gastos': 'receipt_long',
  Pagar: 'paid',
  Cargar: 'add_card',
  'Super admin': 'admin_panel_settings',
  Alcance: 'list_alt',
};

export function helpTopicIcon(id: string): string {
  return TOPIC_ICONS[id] ?? 'info';
}

export function helpBlockIcon(title: string): string {
  return BLOCK_ICONS[title] ?? 'info';
}

export type HelpBlockTone = 'read' | 'do' | 'lock' | 'info';

export function helpBlockTone(title: string): HelpBlockTone {
  const t = title.toLowerCase();
  if (/(bloquear|pagar|super admin)/.test(t)) return 'lock';
  if (/(gestionar|crear|marcar|cargar|exportar|excel|productor)/.test(t)) return 'do';
  if (/(ver|qué ves|alcance|diagrama|uso)/.test(t)) return 'read';
  return 'info';
}

export type HelpBodyPart = { kind: 'text' | 'code'; value: string };

export function helpBodyParts(body: string): HelpBodyPart[] {
  const parts: HelpBodyPart[] = [];
  const re = /(\/[a-zA-Z][\w/-]*|\{[a-zA-Z]+\})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push({ kind: 'text', value: body.slice(last, m.index) });
    parts.push({ kind: 'code', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ kind: 'text', value: body.slice(last) });
  return parts.length ? parts : [{ kind: 'text', value: body }];
}
