/**
 * Demo: Comisiones y Estadísticas con Ventas (pedidos y comanda) y Ventas POS por separado,
 * como devuelve la API.
 */

function dateParts() {
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const back = (n: number) => {
    const d = new Date(now);
    d.setDate(Math.max(1, now.getDate() - n));
    return iso(d);
  };
  return { today: iso(now), monthStart: iso(new Date(now.getFullYear(), now.getMonth(), 1)), back };
}

type Source = 'all' | 'sales' | 'pos';

const SOURCE_LABEL: Record<Source, string> = {
  all: 'Ventas + Ventas POS',
  sales: 'Ventas',
  pos: 'Ventas POS',
};

const CATEGORIES = [
  { category: 'Clásicos', salesAmount: 520000, salesQty: 41, posAmount: 180000, posQty: 14 },
  { category: 'Bebidas', salesAmount: 96000, salesQty: 38, posAmount: 41000, posQty: 16 },
  { category: 'Postres', salesAmount: 0, salesQty: 0, posAmount: 64000, posQty: 9 },
];

const RULES = [
  { id: 'demo-cr-1', employeeName: 'Lucía Ejemplo', category: 'Clásicos', ratePercent: 1 },
  { id: 'demo-cr-2', employeeName: 'Lucía Ejemplo', category: 'Bebidas', ratePercent: 2.5 },
  { id: 'demo-cr-3', employeeName: 'Martín Ejemplo', category: 'Postres', ratePercent: 3 },
];

const r2 = (v: number) => Math.round(v * 100) / 100;

export function demoCommissionRules(shopId: string) {
  return RULES.map((r) => ({
    ...r,
    shopId,
    employeeId: r.employeeName === 'Lucía Ejemplo' ? 'demo-emp-lucia' : 'demo-emp-martin',
    notes: null,
    active: true,
  }));
}

export function demoCommissionsCalculate(shopId: string, query: URLSearchParams) {
  const raw = String(query.get('source') ?? 'all');
  const source: Source = raw === 'sales' || raw === 'pos' ? raw : 'all';
  const base = (c: (typeof CATEGORIES)[number]) =>
    (source !== 'pos' ? c.salesAmount : 0) + (source !== 'sales' ? c.posAmount : 0);
  const salesByCategory = CATEGORIES.map((c) => ({
    category: c.category,
    salesAmount: c.salesAmount,
    salesQty: c.salesQty,
    posAmount: c.posAmount,
    posQty: c.posQty,
    amount: base(c),
    qty: (source !== 'pos' ? c.salesQty : 0) + (source !== 'sales' ? c.posQty : 0),
  }));
  const byEmployee = new Map<string, { employeeId: string; employeeName: string; lines: unknown[]; total: number }>();
  for (const rule of demoCommissionRules(shopId)) {
    const cat = salesByCategory.find((c) => c.category === rule.category)!;
    const commissionAmount = r2((cat.amount * rule.ratePercent) / 100);
    const bucket = byEmployee.get(rule.employeeId) ?? {
      employeeId: rule.employeeId,
      employeeName: rule.employeeName,
      lines: [],
      total: 0,
    };
    bucket.lines.push({
      ruleId: rule.id,
      category: rule.category,
      salesAmount: cat.amount,
      ventasAmount: cat.salesAmount,
      posAmount: cat.posAmount,
      ratePercent: rule.ratePercent,
      commissionAmount,
    });
    bucket.total = r2(bucket.total + commissionAmount);
    byEmployee.set(rule.employeeId, bucket);
  }
  const employees = [...byEmployee.values()];
  const { today, monthStart } = dateParts();
  return {
    shopId,
    from: query.get('from') ?? monthStart,
    to: query.get('to') ?? today,
    source,
    sourceLabel: SOURCE_LABEL[source],
    includesSales: source !== 'pos',
    includesPos: source !== 'sales',
    salesTotal: salesByCategory.reduce((a, c) => a + c.amount, 0),
    ventasTotal: salesByCategory.reduce((a, c) => a + c.salesAmount, 0),
    posTotal: salesByCategory.reduce((a, c) => a + c.posAmount, 0),
    salesByCategory,
    employees,
    grandTotal: r2(employees.reduce((a, e) => a + e.total, 0)),
    unmatchedRules: [],
  };
}

export function demoStatsDashboard(shopId: string) {
  const { today, monthStart, back } = dateParts();
  const days = [back(5), back(4), back(2), back(1), today];
  const salesByDay = days.map((d, i) => ({
    businessDate: d,
    amount: [98000, 112000, 134000, 121000, 151000][i],
    qty: [22, 25, 30, 27, 33][i],
    ticketCount: [11, 13, 15, 14, 17][i],
  }));
  const posByDay = days.slice(0, 3).map((d, i) => ({
    businessDate: d,
    amount: [96000, 84000, 105000][i],
    qty: [18, 16, 21][i],
    ticketCount: [9, 8, 10][i],
  }));
  const sum = (rows: Array<{ amount: number }>) => rows.reduce((a, r) => a + r.amount, 0);
  const tickets = (rows: Array<{ ticketCount: number }>) => rows.reduce((a, r) => a + r.ticketCount, 0);
  const salesAmount = sum(salesByDay);
  const posAmount = sum(posByDay);
  const amountByDate = new Map<string, number>();
  for (const d of [...salesByDay, ...posByDay]) {
    amountByDate.set(d.businessDate, (amountByDate.get(d.businessDate) ?? 0) + d.amount);
  }
  const labels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const weekday = labels.map((label, day) => {
    const rows = [...amountByDate].filter(([d]) => new Date(`${d}T12:00:00`).getDay() === day);
    const amount = rows.reduce((a, [, v]) => a + v, 0);
    return { day, label, amount, avgAmount: rows.length ? r2(amount / rows.length) : 0, count: rows.length };
  });
  const declaredByDay = days.map((d, i) => ({
    businessDate: d,
    declaredTotal: [180000, 102000, 230000, 118000, 149000][i],
    cashAmount: [80000, 50000, 90000, 60000, 70000][i],
    cashWithdrawn: 0,
    status: 'CONFIRMED',
    tipsAmount: [9000, 6000, 12000, 7000, 8000][i],
  }));
  const declared = sum(declaredByDay.map((d) => ({ amount: d.declaredTotal })));
  return {
    shopId,
    from: monthStart,
    to: today,
    closings: {
      count: declaredByDay.length,
      totals: {
        declared,
        cash: 350000,
        withdrawn: 0,
        covers: 160,
        units: 0,
        difference: 0,
        avgTicket: r2(declared / 160),
        differenceDayCount: 0,
        differenceAbsSum: 0,
      },
      byDay: declaredByDay,
    },
    sales: {
      totals: {
        amount: salesAmount,
        qty: salesByDay.reduce((a, d) => a + d.qty, 0),
        ticketCount: tickets(salesByDay),
        productCount: 6,
        avgTicketAmount: r2(salesAmount / tickets(salesByDay)),
      },
      byDay: salesByDay,
    },
    combined: { salesAmount, posAmount, amount: salesAmount + posAmount },
    pos: {
      totals: {
        amount: posAmount,
        qty: posByDay.reduce((a, d) => a + d.qty, 0),
        ticketCount: tickets(posByDay),
        productCount: 5,
        avgTicketAmount: r2(posAmount / tickets(posByDay)),
      },
      byDay: posByDay,
    },
    reservations: {
      enabled: true,
      from: monthStart,
      to: today,
      totals: { parties: 18, guests: 64, inside: 50, outside: 14 },
      byDay: days.map((d, i) => ({
        businessDate: d,
        parties: [3, 4, 5, 2, 4][i],
        guests: [10, 14, 18, 8, 14][i],
        inside: 0,
        outside: 0,
      })),
    },
    tips: null,
    paymentMix: {
      cash: 350000,
      card: 300000,
      mercadoPago: 129000,
      transfer: 0,
      accountDni: 0,
      deliveryApps: 0,
      other: 0,
    },
    weekday,
    comparison: {
      previousFrom: monthStart,
      previousTo: today,
      posAmountDeltaPct: -42.1,
      salesAmountDeltaPct: 38.4,
      combinedAmountDeltaPct: 6.2,
      boxDeclaredDeltaPct: 4.8,
      coversDeltaPct: 3.1,
      tipsDeltaPct: null,
      previous: { posAmount: 490000, salesAmount: 446000, boxDeclared: 744000, covers: 155, tipsTotal: 0 },
    },
  };
}
