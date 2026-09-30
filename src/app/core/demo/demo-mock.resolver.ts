import { DemoOverlayStore } from './demo-overlay.store';
import {
  DemoOrderChannel,
  DemoOrderStatus,
  DemoReservationArea,
  DemoReservationStatus,
  DemoSettlementStatus,
  DemoTipStatus,
  DemoWaitingStatus,
} from './demo-constants';
import {
  DEMO_SHOP_ID,
  buildDemoAuthUser,
  buildDemoShop,
  demoAccounts,
  demoClosings,
  demoConcepts,
  demoConceptsReport,
  demoHomeFixtures,
  demoMenu,
  demoMovements,
  demoPartnerSplitRuns,
  demoPartnerSplits,
  demoPosLinkedPreview,
  demoPromos,
  demoPublicMenu,
  demoSalesSummary,
  demoSalesSystems,
  demoServiceRules,
  demoServices,
  demoShopUsers,
  demoShortages,
  demoStockCategories,
  demoStockProducts,
  demoSuppliers,
  demoUsers,
} from './demo-fixtures';

function kindFromUrl(fullUrl: string): import('./demo-constants').DemoStockKind {
  try {
    const q = fullUrl.includes('?') ? fullUrl.split('?')[1] : '';
    const params = new URLSearchParams(q);
    return params.get('kind') === 'beverage' ? 'beverage' : 'food';
  } catch {
    return 'food';
  }
}

function queryParam(fullUrl: string, key: string): string | null {
  try {
    const q = fullUrl.includes('?') ? fullUrl.split('?')[1] : '';
    return new URLSearchParams(q).get(key);
  } catch {
    return null;
  }
}

function filterMovementsByKind(
  rows: Array<{ conceptKind?: string | null }>,
  fullUrl: string,
): typeof rows {
  const kind = (queryParam(fullUrl, 'kind') || '').toLowerCase();
  if (!kind || kind === 'all') return rows;
  const map: Record<string, string> = {
    expense: 'EXPENSE',
    income: 'INCOME',
    transfer: 'TRANSFER',
  };
  const want = map[kind];
  if (!want) return rows;
  return rows.filter((r) => String(r.conceptKind ?? '').toUpperCase() === want);
}

function emptyPaged() {
  return { items: [], total: 0, page: 1, pageSize: 50 };
}

/**
 * Resuelve respuestas mock para la demo offline (sin red).
 * `rel` = path relativo a /api/v1 sin query.
 */
export function resolveDemoGet(
  rel: string,
  fullUrl: string,
  store: DemoOverlayStore,
): unknown {
  if (rel === '/auth/me' || rel.startsWith('/auth/me')) {
    return buildDemoAuthUser();
  }

  if (rel === '/auth/demo') {
    return { enabled: true };
  }

  if (rel === '/auth/google') {
    return { enabled: false, clientId: null };
  }

  if (rel === '/notifications/unseen-count') {
    return { count: 0 };
  }
  if (rel === '/notifications/unseen-counts-by-shop') {
    return { counts: {} };
  }
  if (rel === '/notifications' || rel.startsWith('/notifications/')) {
    return { items: [], total: 0 };
  }

  if (rel === '/push/vapid-public-key') {
    return { publicKey: null, enabled: false };
  }
  if (rel.startsWith('/push/')) {
    return { ok: true, demo: true };
  }

  if (rel === '/shops') {
    const shop = buildDemoShop();
    return [{ id: shop.id, name: shop.name, slug: shop.slug }];
  }

  if (rel === '/users' || rel.startsWith('/users/')) {
    const list = store.mergeGet('/users', demoUsers());
    if (rel === '/users') return list;
    const id = rel.split('/')[2];
    const rows = Array.isArray(list) ? list : demoUsers();
    return rows.find((u: { id?: string }) => u.id === id) ?? rows[0];
  }

  if (rel === '/sales-systems' || rel.startsWith('/sales-systems/')) {
    const list = store.mergeGet('/sales-systems', demoSalesSystems());
    if (rel === '/sales-systems') return list;
    const id = rel.split('/')[2];
    const rows = Array.isArray(list) ? list : demoSalesSystems();
    return rows.find((s: { id?: string }) => s.id === id) ?? rows[0];
  }

  const publicMatch = rel.match(/^\/public\/shops\/([^/]+)(?:\/(.*))?$/);
  if (publicMatch) {
    const slug = decodeURIComponent(publicMatch[1] || 'demo-gastro');
    const rest = publicMatch[2] ?? '';
    if (!rest || rest === 'menu' || rest.startsWith('menu/')) {
      return demoPublicMenu(slug);
    }
    if (rest === 'service-rules') {
      const shop = buildDemoShop();
      return {
        ...demoServiceRules(shop.id),
        shop: { id: shop.id, name: shop.name, slug: shop.slug, logoUrl: null, accentColor: shop.accentColor },
      };
    }
    if (rest.endsWith('.pdf') || rest.includes('pdf')) {
      return new Blob([]);
    }
    return { shop: { id: DEMO_SHOP_ID, name: 'Demo Gastronomía', slug }, items: [] };
  }

  const shopMatch = rel.match(/^\/shops\/([^/]+)(?:\/(.*))?$/);
  if (shopMatch) {
    const shopId = shopMatch[1];
    const rest = shopMatch[2] ?? '';
    const home = demoHomeFixtures(shopId || DEMO_SHOP_ID);

    if (!rest) {
      const base = {
        ...buildDemoShop(),
        id: shopId,
        closingIncomeConceptId: null,
        transferConceptId: null,
        partnerDividendConceptId: null,
        partnerDividendAccountId: null,
        cashWithdrawalConceptId: null,
      };
      return store.mergeGet(rel, base);
    }

    if (rest === 'print-agent' || rest.startsWith('print-agent/')) {
      return { configured: false, tokenPrefix: null, demo: true };
    }

    if (rest === 'users' || rest.startsWith('users/')) {
      return store.mergeGet(`/shops/${shopId}/users`, demoShopUsers());
    }

    if (rest === 'accounts' || rest.startsWith('accounts/')) {
      const listKey = `/shops/${shopId}/accounts`;
      const list = store.mergeGet(listKey, demoAccounts());
      if (rest === 'accounts') return list;
      const id = rest.split('/')[1];
      const rows = Array.isArray(list) ? list : demoAccounts();
      return rows.find((a: { id?: string }) => a.id === id) ?? rows[0];
    }

    if (rest === 'concepts' || rest.startsWith('concepts/')) {
      const listKey = `/shops/${shopId}/concepts`;
      const list = store.mergeGet(listKey, demoConcepts());
      if (rest === 'concepts') return list;
      const id = rest.split('/')[1];
      const rows = Array.isArray(list) ? list : demoConcepts();
      return rows.find((c: { id?: string }) => c.id === id) ?? rows[0];
    }

    if (rest === 'menu' || rest.startsWith('menu/')) {
      return store.mergeGet(`/shops/${shopId}/menu`, demoMenu());
    }
    if (rest === 'promos' || rest.startsWith('promos/')) {
      return store.mergeGet(`/shops/${shopId}/promos`, demoPromos());
    }

    if (rest === 'pos-products' || rest === 'pos-categories') return [];

    if (rest === 'shortages' || rest.startsWith('shortages/')) {
      const listKey = `/shops/${shopId}/shortages`;
      const list = store.mergeGet(listKey, demoShortages(shopId));
      if (rest === 'shortages') return list;
      const id = rest.split('/')[1];
      const rows = Array.isArray(list) ? list : demoShortages(shopId);
      return rows.find((s: { id?: string }) => s.id === id) ?? rows[0];
    }

    if (rest.startsWith('stock/')) {
      const kind = kindFromUrl(fullUrl);
      if (rest === 'stock/categories' || rest.startsWith('stock/categories/')) {
        const listKey = `/shops/${shopId}/stock/categories/${kind}`;
        const list = store.mergeGet(listKey, demoStockCategories(shopId, kind));
        if (rest === 'stock/categories') return list;
        const id = rest.split('/')[2];
        const rows = Array.isArray(list) ? list : demoStockCategories(shopId, kind);
        return rows.find((c: { id?: string }) => c.id === id) ?? rows[0];
      }
      if (rest === 'stock/products' || rest.startsWith('stock/products/')) {
        const listKey = `/shops/${shopId}/stock/products/${kind}`;
        const list = store.mergeGet(listKey, demoStockProducts(shopId, kind));
        if (rest === 'stock/products') return list;
        const id = rest.split('/')[2];
        const rows = Array.isArray(list) ? list : demoStockProducts(shopId, kind);
        return rows.find((p: { id?: string }) => p.id === id) ?? rows[0];
      }
      if (rest === 'stock/admins') return demoShopUsers();
      return [];
    }

    if (rest === 'suppliers' || rest.startsWith('suppliers/')) {
      const listKey = `/shops/${shopId}/suppliers`;
      const list = store.mergeGet(listKey, demoSuppliers(shopId));
      if (rest === 'suppliers') return list;
      const id = rest.split('/')[1];
      const rows = Array.isArray(list) ? list : demoSuppliers(shopId);
      return rows.find((s: { id?: string }) => s.id === id) ?? rows[0];
    }

    if (rest === 'services' || rest.startsWith('services/')) {
      const listKey = `/shops/${shopId}/services`;
      const list = store.mergeGet(listKey, demoServices(shopId));
      if (rest === 'services') return list;
      const id = rest.split('/')[1];
      const rows = Array.isArray(list) ? list : demoServices(shopId);
      return rows.find((s: { id?: string }) => s.id === id) ?? rows[0];
    }

    if (rest === 'closing-sources') return home.closingSources;
    if (rest === 'movements/balances') return home.balances;

    if (rest === 'movements' || rest.startsWith('movements/')) {
      if (rest === 'movements/balances') return home.balances;
      const listKey = `/shops/${shopId}/movements`;
      const list = store.mergeGet(listKey, demoMovements(shopId));
      if (rest === 'movements') {
        const rows = filterMovementsByKind(
          Array.isArray(list) ? list : demoMovements(shopId),
          fullUrl,
        );
        return { items: rows, total: rows.length, page: 1, pageSize: 50 };
      }
      const id = rest.split('/')[1];
      const rows = Array.isArray(list) ? list : demoMovements(shopId);
      return rows.find((m: { id?: string }) => m.id === id) ?? rows[0];
    }

    if (rest === 'cash-withdrawals/pending') return home.cashWithdrawalsPending;
    if (rest === 'cash-withdrawals/pending-count') return { count: 0 };
    if (rest.startsWith('cash-withdrawals')) return { items: [], total: 0 };

    if (rest === 'closings/open') return home.closingsOpen;
    if (rest === 'closings/suggested-opening') return home.suggestedOpening;
    if (rest === 'closings' || rest.startsWith('closings/')) {
      const listKey = `/shops/${shopId}/closings`;
      const list = store.mergeGet(listKey, demoClosings(shopId));
      if (rest === 'closings') return list;
      const id = rest.split('/')[1];
      if (!id || id === 'open' || id === 'suggested-opening') return list;
      const rows = Array.isArray(list) ? list : demoClosings(shopId);
      return rows.find((c: { id?: string }) => c.id === id) ?? rows[0];
    }

    if (rest.startsWith('sales-reports/menu/summary') || rest === 'sales-reports/menu/summary') {
      return demoSalesSummary(shopId);
    }
    if (rest.startsWith('sales-reports/products/summary')) {
      return demoSalesSummary(shopId);
    }
    if (rest.startsWith('sales-reports/menu/pos-linked-preview')) {
      return demoPosLinkedPreview(shopId);
    }
    if (rest.startsWith('sales-reports')) {
      return demoSalesSummary(shopId);
    }

    if (rest.startsWith('reports/concepts') || rest.includes('concepts-report')) {
      return demoConceptsReport(shopId);
    }
    if (rest.startsWith('reports/summary')) return home.reportsSummary;
    if (rest.startsWith('reports')) {
      return demoConceptsReport(shopId);
    }

    if (rest === 'partner-splits' || rest.startsWith('partner-splits/')) {
      if (rest === 'partner-splits/runs' || rest.startsWith('partner-splits/runs/')) {
        const listKey = `/shops/${shopId}/partner-splits/runs`;
        const list = store.mergeGet(listKey, demoPartnerSplitRuns(shopId));
        if (rest === 'partner-splits/runs') return list;
        const id = rest.split('/')[2];
        const rows = Array.isArray(list) ? list : demoPartnerSplitRuns(shopId);
        return rows.find((r: { id?: string }) => r.id === id) ?? rows[0];
      }
      return store.mergeGet(`/shops/${shopId}/partner-splits`, demoPartnerSplits(shopId));
    }

    if (rest === 'service-rules' || rest.startsWith('service-rules/')) {
      return store.mergeGet(`/shops/${shopId}/service-rules`, demoServiceRules(shopId));
    }

    if (rest === 'settlements/receivables-summary') {
      return {
        count: 1,
        totalNet: 128500,
        byChannel: [{ channel: 'MP', count: 1, totalNet: 128500 }],
        earliestExpected: new Date().toISOString().slice(0, 10),
      };
    }
    if (rest === 'settlements/pending-count') return { count: 1 };
    if (rest.startsWith('settlements')) {
      return {
        items: [
          {
            id: 'demo-set-1',
            shopId,
            channel: 'MP',
            amount: 128500,
            status: DemoSettlementStatus.PENDING,
            expectedAt: new Date().toISOString().slice(0, 10),
          },
        ],
        total: 1,
      };
    }

    if (rest.startsWith('attendance')) return home.attendance;

    if (rest === 'payments/pending-count') {
      return { total: 2, suppliers: 1, services: 0, employees: 1, partners: 0 };
    }
    if (rest === 'payments' || rest.startsWith('payments/')) {
      const listKey = `/shops/${shopId}/payments`;
      const list = store.mergeGet(listKey, home.payments);
      if (rest === 'payments') return list;
      const id = rest.split('/')[1];
      const rows = Array.isArray(list) ? list : home.payments;
      return rows.find((p: { id?: string }) => p.id === id) ?? rows[0];
    }

    if (rest === 'tips/pending-count') return { count: 1 };
    if (rest.startsWith('tips')) {
      return {
        items: [
          {
            id: 'demo-tip-1',
            shopId,
            amount: 3500,
            status: DemoTipStatus.PENDING,
            waiterName: 'Lucía Ejemplo',
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
      };
    }
    if (rest === 'reimbursements/pending-count') return { count: 0, amount: 0 };
    if (rest.startsWith('reimbursements')) return { items: [], total: 0 };
    if (rest === 'customer-orders/pending-count') return { count: 1 };
    if (rest.startsWith('customer-orders/closing-summary')) {
      return {
        businessDate: new Date().toISOString().slice(0, 10),
        shiftId: 'demo-shift',
        shiftName: 'Noche',
        orderCount: 0,
        openCount: 1,
        openTablesCount: 0,
        completedCount: 0,
        tables: { closedCount: 0 },
      };
    }
    if (rest.startsWith('customer-orders')) {
      return {
        items: [
          {
            id: 'demo-co-1',
            shopId,
            code: 'D-1001',
            status: DemoOrderStatus.PENDING,
            channel: DemoOrderChannel.TAKEAWAY,
            total: 15700,
            customerName: 'Cliente Demo',
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
      };
    }
    if (rest === 'reservation-requests/pending-count') return { count: 1 };
    if (rest.startsWith('reservations')) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return {
        reservations: [
          {
            id: 'demo-rsv-1',
            shopId,
            guestName: 'María Ejemplo',
            guestPhone: '5491111111111',
            partySize: 4,
            date: today,
            time: '21:00',
            area: DemoReservationArea.INSIDE,
            status: DemoReservationStatus.CONFIRMED,
            notes: 'Mesa cerca de la ventana',
          },
        ],
      };
    }
    if (rest.startsWith('waiting-list')) {
      return {
        items: [
          {
            id: 'demo-wl-1',
            shopId,
            guestName: 'Juan Espera',
            partySize: 2,
            status: DemoWaitingStatus.WAITING,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
    if (rest.startsWith('salon-tables') || rest.startsWith('diagrama') || rest.startsWith('salon-')) {
      return {
        tables: [
          { id: 'demo-tbl-1', name: 'M1', seats: 2, area: 'INSIDE', active: true },
          { id: 'demo-tbl-2', name: 'M2', seats: 4, area: 'INSIDE', active: true },
          { id: 'demo-tbl-3', name: 'P1', seats: 6, area: 'OUTSIDE', active: true },
        ],
        items: [],
      };
    }
    if (rest.startsWith('orders') || rest.startsWith('comanda')) {
      return {
        items: [
          {
            id: 'demo-ord-1',
            shopId,
            status: DemoOrderStatus.OPEN,
            tableName: 'M2',
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }

    if (rest.startsWith('employees')) {
      return home.attendance.employees.map((e) => ({
        id: e.employeeId,
        fullName: e.fullName,
        active: true,
      }));
    }
    if (rest.startsWith('candidates') || rest.startsWith('payroll') || rest.startsWith('commissions')) {
      return [];
    }
    if (rest.startsWith('vacations')) return { items: [] };
    if (rest.includes('ordering-catalog') || rest.includes('ordering-extras')) return [];
    if (rest.startsWith('messages') || rest.startsWith('email')) {
      return { templates: buildDemoShop().emailMessageTemplates };
    }
    if (rest.startsWith('production-attendance')) {
      return home.attendance;
    }

    // Fallback seguro: listas vacías / counts, nunca `{}` suelto en listados.
    if (/pending-count|unseen-count|count$/.test(rest)) return { count: 0 };
    if (/summary|preview|bundle|config/.test(rest)) {
      return { items: [], totals: {}, categories: [], rules: [] };
    }
    return [];
  }

  if (/pending-count|unseen-count/.test(rel)) return { count: 0 };
  if (/\/balances$/.test(rel)) return { accounts: [] };
  if (rel.startsWith('/public/')) return demoPublicMenu('demo-gastro');
  return emptyPaged();
}

export function resolveDemoMutationFallback(): unknown {
  return { ok: true, demo: true };
}
