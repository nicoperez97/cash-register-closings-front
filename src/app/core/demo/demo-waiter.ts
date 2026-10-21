import { DEFAULT_WAITER_CAP_STAFF } from '../../features/admin/waiter-capabilities';
import type {
  WaiterCatalog,
  WaiterFloor,
  WaiterLoginResult,
  WaiterSession,
  WaiterSessionOrder,
  WaiterShiftTipsSummary,
} from '../../features/waiter/waiter-api.service';
import { buildDemoShop, demoMenu, demoPromos, DEMO_SHOP_ID } from './demo-fixtures';

/**
 * Comanda (Operación → Comanda / mozo) para la demo offline. Las mesas abiertas
 * viven en memoria: al recargar la página la demo arranca limpia, como el resto.
 */

const DEMO_WAITERS = [
  { id: 'demo-emp-lucia', fullName: 'Lucía Ejemplo' },
  { id: 'demo-emp-martin', fullName: 'Martín Ejemplo' },
];

const DEMO_TABLES = [
  { id: 'demo-tbl-1', label: 'M1', seats: 2, area: 'INSIDE', mapX: 18, mapY: 22 },
  { id: 'demo-tbl-2', label: 'M2', seats: 4, area: 'INSIDE', mapX: 48, mapY: 22 },
  { id: 'demo-tbl-3', label: 'P1', seats: 6, area: 'OUTSIDE', mapX: 30, mapY: 62 },
];
const SECTOR = { id: 'demo-sector-salon', name: 'Salón' };

const PAYMENT_METHODS = [
  { id: 'demo-pm-cash', name: 'Efectivo', active: true },
  { id: 'demo-pm-card', name: 'Tarjeta', active: true },
  { id: 'demo-pm-mp', name: 'Mercado Pago', active: true },
];

type DemoSessionState = {
  id: string;
  tableId: string | null;
  covers: number;
  waiterId: string;
  openedAt: string;
  closedAt: string | null;
  status: 'OPEN' | 'CLOSED';
  customerTicketPrinted: boolean;
  orders: WaiterSessionOrder[];
  payments: NonNullable<WaiterSession['payments']>;
  tipAmount: number;
};

const sessions = new Map<string, DemoSessionState>();
let orderSeq = 100;

const newId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

function shopRef() {
  const shop = buildDemoShop();
  return {
    id: shop.id || DEMO_SHOP_ID,
    name: shop.name,
    slug: shop.slug,
    logoUrl: null,
    accentColor: shop.accentColor ?? null,
  };
}

function menuItemsById(): Map<string, { id: string; name: string; price: number }> {
  const map = new Map<string, { id: string; name: string; price: number }>();
  for (const menu of demoMenu().menus) {
    for (const section of menu.sections) {
      for (const item of section.items) map.set(item.id, item);
    }
  }
  return map;
}

function waiterOf(id: string) {
  return DEMO_WAITERS.find((w) => w.id === id) ?? DEMO_WAITERS[0];
}

function toSession(s: DemoSessionState): WaiterSession {
  const table = DEMO_TABLES.find((t) => t.id === s.tableId) ?? null;
  const subtotal = round2(s.orders.reduce((acc, o) => acc + o.total, 0));
  return {
    id: s.id,
    status: s.status,
    covers: s.covers,
    customerTicketPrinted: s.customerTicketPrinted,
    ticketTotal: subtotal,
    sessionSubtotal: subtotal,
    paymentMethods: PAYMENT_METHODS,
    payments: s.payments,
    paymentMethodName: s.payments[0]?.paymentMethodName ?? null,
    tipAmount: s.tipAmount,
    orderCount: s.orders.length,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    table: table ? { id: table.id, label: table.label, area: table.area, seats: table.seats } : null,
    waiter: waiterOf(s.waiterId),
    orders: s.orders,
    lineAudits: [],
  };
}

export function demoWaiterLogin(): WaiterLoginResult {
  return {
    token: 'crc-demo-waiter-token',
    waiter: DEMO_WAITERS[0],
    shop: shopRef(),
    capabilities: DEFAULT_WAITER_CAP_STAFF,
  };
}

function demoCatalog(): WaiterCatalog {
  const promos = demoPromos().promos;
  return {
    enabled: true,
    shop: { ...shopRef(), currency: 'ARS' },
    extras: [{ id: 'demo-extra-papas', name: 'Papas extra', price: 2500 }],
    discountPresets: [
      { id: 'demo-disc-10', label: '10%', mode: 'percent', value: 10 },
      { id: 'demo-disc-amigo', label: 'Amigo $1000', mode: 'fixed', value: 1000 },
    ],
    promos: promos.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      fixedPrice: p.fixedPrice,
      sellable: p.sellable,
      tableMatchable: p.tableMatchable,
      inSchedule: true,
      items: p.items,
    })),
    tablePaymentMethods: PAYMENT_METHODS,
    capabilities: DEFAULT_WAITER_CAP_STAFF,
    menus: demoMenu().menus.map((m) => ({
      id: m.id,
      slug: m.slug,
      title: m.title,
      note: m.note,
      sections: m.sections.map((s) => ({
        name: s.name,
        items: s.items.map((i) => ({
          id: i.id,
          name: i.name,
          description: (i as { description?: string }).description ?? null,
          price: i.price,
        })),
      })),
    })),
  };
}

function demoFloor(): WaiterFloor {
  const open = [...sessions.values()].filter((s) => s.status === 'OPEN');
  return {
    tables: DEMO_TABLES.map((t, i) => {
      const s = open.find((x) => x.tableId === t.id);
      return {
        id: t.id,
        sectorId: SECTOR.id,
        sectorName: SECTOR.name,
        area: t.area,
        label: t.label,
        seats: t.seats,
        sortOrder: i,
        mapX: t.mapX,
        mapY: t.mapY,
        openSession: s
          ? {
              id: s.id,
              waiterEmployeeId: s.waiterId,
              openedAt: s.openedAt,
              covers: s.covers,
              orderCount: s.orders.length,
              customerTicketPrinted: s.customerTicketPrinted,
            }
          : null,
      };
    }),
    counterSessions: open
      .filter((s) => !s.tableId)
      .map((s) => ({
        id: s.id,
        label: 'Mostrador',
        waiterEmployeeId: s.waiterId,
        openedAt: s.openedAt,
        covers: s.covers,
        orderCount: s.orders.length,
        customerTicketPrinted: s.customerTicketPrinted,
      })),
    mapObjects: [],
  };
}

function demoTips(): WaiterShiftTipsSummary {
  const closed = [...sessions.values()].filter((s) => s.status === 'CLOSED');
  const today = new Date().toISOString().slice(0, 10);
  const label = (s: DemoSessionState) =>
    DEMO_TABLES.find((t) => t.id === s.tableId)?.label ?? 'Mostrador';
  return {
    businessDate: today,
    shift: { id: 'demo-shift-noche', name: 'Noche' },
    from: `${today}T00:00:00.000Z`,
    to: new Date().toISOString(),
    tipTotal: round2(closed.reduce((a, s) => a + s.tipAmount, 0)),
    ticketTotal: round2(closed.reduce((a, s) => a + toSession(s).ticketTotal!, 0)),
    coversTotal: closed.reduce((a, s) => a + s.covers, 0),
    tippedTables: closed.filter((s) => s.tipAmount > 0).length,
    closedTables: closed.length,
    recent: closed.map((s) => ({
      sessionId: s.id,
      tableLabel: label(s),
      tipAmount: s.tipAmount,
      closedAt: s.closedAt,
    })),
  };
}

/** GET bajo /public/shops/:slug/ — undefined si no es de la comanda. */
export function demoWaiterGet(rest: string): unknown {
  if (!rest.startsWith('waiter')) return undefined;
  const r = rest.replace(/^waiter\/?/, '');
  if (r === '' || r === 'me') {
    const { token: _t, ...me } = demoWaiterLogin();
    return me;
  }
  if (r === 'catalog') return demoCatalog();
  if (r === 'tables') return demoFloor();
  if (r === 'tips-summary') return demoTips();
  const m = r.match(/^sessions\/([^/]+)$/);
  if (m) {
    const s = sessions.get(m[1]);
    return s ? toSession(s) : undefined;
  }
  return undefined;
}

/** GET bajo /shops/:id/comanda/ — undefined si no corresponde. */
export function demoComandaShopGet(rest: string): unknown {
  if (!rest.startsWith('comanda')) return undefined;
  if (rest === 'comanda/waiters') return DEMO_WAITERS;
  if (rest.startsWith('comanda/monitor')) {
    const open = [...sessions.values()].filter((s) => s.status === 'OPEN');
    return {
      shopName: shopRef().name,
      shiftName: 'Noche',
      businessDate: new Date().toISOString().slice(0, 10),
      tables: open.map((s) => {
        const ses = toSession(s);
        return {
          sessionId: s.id,
          tableId: s.tableId,
          tableLabel: ses.table?.label ?? 'Mostrador',
          sectorName: SECTOR.name,
          covers: s.covers,
          waiterName: ses.waiter.fullName,
          openedAt: s.openedAt,
          orderCount: s.orders.length,
          customerTicketPrinted: s.customerTicketPrinted,
          total: ses.ticketTotal ?? 0,
          lines: s.orders.flatMap((o) => o.items.map((i) => ({ qty: i.qty, name: i.name }))),
        };
      }),
      recentOrders: [],
      recentAudits: [],
    };
  }
  if (rest.startsWith('comanda/receipts')) {
    return { from: '', to: '', count: 0, ticketTotal: 0, tipTotal: 0, rows: [] };
  }
  return undefined;
}

type Body = Record<string, unknown>;

/** Mutaciones de la comanda (entrar, mesas, pedidos, cierre). undefined si no corresponde. */
export function demoWaiterMutation(method: string, rel: string, body: Body): unknown {
  if (method === 'POST' && /^\/shops\/[^/]+\/comanda\/enter$/.test(rel)) {
    return demoWaiterLogin();
  }
  const pub = rel.match(/^\/public\/shops\/[^/]+\/waiter\/(.*)$/);
  if (!pub) return undefined;
  const r = pub[1];

  if (method === 'POST' && r === 'login') return demoWaiterLogin();

  if (method === 'POST' && r === 'sessions') {
    const tableId = (body['salonTableId'] as string | undefined) ?? null;
    const existing = [...sessions.values()].find((s) => s.status === 'OPEN' && s.tableId === tableId);
    if (existing && tableId) return toSession(existing);
    const s: DemoSessionState = {
      id: newId('demo-ses'),
      tableId,
      covers: Math.max(1, Number(body['covers']) || 1),
      waiterId: (body['waiterEmployeeId'] as string | undefined) ?? DEMO_WAITERS[0].id,
      openedAt: new Date().toISOString(),
      closedAt: null,
      status: 'OPEN',
      customerTicketPrinted: false,
      orders: [],
      payments: [],
      tipAmount: 0,
    };
    sessions.set(s.id, s);
    return toSession(s);
  }

  const m = r.match(/^sessions\/([^/]+)(?:\/(.*))?$/);
  if (!m) return undefined;
  const s = sessions.get(m[1]);
  if (!s) return undefined;
  const action = m[2] ?? '';

  if (action === 'orders' && method === 'POST') {
    const items = menuItemsById();
    const lines: WaiterSessionOrder['items'] = [];
    for (const it of (body['items'] as Array<Body> | undefined) ?? []) {
      const item = items.get(String(it['menuItemId']));
      if (!item) continue;
      const unitPrice = Number(it['unitPrice']) || item.price;
      lines.push({
        menuItemId: item.id,
        name: item.name,
        qty: Math.max(1, Number(it['qty']) || 1),
        unitPrice,
        notes: (it['notes'] as string | null) ?? null,
        removedIngredients: (it['removedIngredients'] as string[] | undefined) ?? [],
      });
    }
    for (const ex of (body['extras'] as Array<Body> | undefined) ?? []) {
      const extra = demoCatalog().extras.find((e) => e.id === ex['extraId']);
      if (!extra) continue;
      lines.push({
        name: extra.name,
        qty: Math.max(1, Number(ex['qty']) || 1),
        unitPrice: extra.price,
        kind: 'EXTRA',
        extraId: extra.id,
        attachedToMenuItemId: (ex['attachedToMenuItemId'] as string | null) ?? null,
      });
    }
    for (const pr of (body['promos'] as Array<Body> | undefined) ?? []) {
      const promo = demoCatalog().promos?.find((p) => p.id === pr['promoId']);
      if (!promo) continue;
      lines.push({ name: promo.name, qty: Math.max(1, Number(pr['qty']) || 1), unitPrice: promo.fixedPrice, kind: 'PROMO' });
    }
    const subtotal = round2(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
    const order: WaiterSessionOrder = {
      id: newId('demo-ord'),
      code: `D${++orderSeq}`,
      status: 'PREPARING',
      items: lines,
      subtotal,
      total: subtotal,
      customerNotes: (body['customerNotes'] as string | null) ?? null,
      createdAt: new Date().toISOString(),
    };
    s.orders.push(order);
    return { id: order.id, print: { kitchenQueued: false, kitchenWarning: 'Demo: no se imprime.' } };
  }

  if (action === 'discard' && method === 'POST') {
    sessions.delete(s.id);
    return { ok: true };
  }

  if (action === 'print-customer-ticket' && method === 'POST') {
    s.customerTicketPrinted = true;
    return toSession(s);
  }

  if (action === 'close' && method === 'POST') {
    const total = toSession(s).ticketTotal ?? 0;
    const byId = new Map(PAYMENT_METHODS.map((p) => [p.id, p.name]));
    const parts = (body['payments'] as Array<Body> | undefined) ?? [];
    s.payments = parts.length
      ? parts.map((p) => ({
          paymentMethodId: String(p['paymentMethodId']),
          paymentMethodName: byId.get(String(p['paymentMethodId'])) ?? 'Pago',
          amount: Number(p['amount']) || 0,
        }))
      : [
          {
            paymentMethodId: String(body['paymentMethodId'] ?? PAYMENT_METHODS[0].id),
            paymentMethodName: byId.get(String(body['paymentMethodId'])) ?? PAYMENT_METHODS[0].name,
            amount: total,
          },
        ];
    const tipValue = Number(body['tipValue']) || 0;
    s.tipAmount = body['tipMode'] === 'percent' ? round2((total * tipValue) / 100) : tipValue;
    s.status = 'CLOSED';
    s.closedAt = new Date().toISOString();
    return toSession(s);
  }

  if (action === 'lines' && method === 'PATCH') {
    const order = s.orders.find((o) => o.id === body['orderId']);
    const idx = Number(body['lineIndex']);
    if (order && order.items[idx]) {
      if (body['remove']) order.items.splice(idx, 1);
      else {
        if (body['qty'] != null) order.items[idx].qty = Math.max(1, Number(body['qty']));
        if (body['unitPrice'] != null) order.items[idx].unitPrice = Number(body['unitPrice']);
      }
      order.subtotal = order.total = round2(order.items.reduce((a, l) => a + l.qty * l.unitPrice, 0));
    }
    return toSession(s);
  }

  // reprint-kitchen, promo: sin impresión real; devolver la mesa.
  return { ...toSession(s), ok: true, printedOrders: 0, status: s.status };
}
