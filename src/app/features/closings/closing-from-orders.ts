import { formatMoney } from '../../shared/utils/money';
import type { CashClosing, ShopClosingSource } from './closings-api.service';
import type { ClosingFormDraft, PendingClosingNotice } from './closing-form-draft';
import { sourceRowTotal } from './closings-form-load';

export type FulfillmentBucket = {
  cashTotal: number;
  transferTotal: number;
  total: number;
  orderCount: number;
  unitsSold: number;
};

export type ClosingPayMethodRow = {
  paymentMethodId: string;
  paymentMethodName: string;
  accountId?: string | null;
  amount: number;
  kind: 'CASH' | 'TRANSFER' | 'CARD' | string;
  orderCount?: number;
};

export type ClosingSummary = {
  businessDate: string;
  shiftId: string;
  shiftName: string;
  opensAt: string;
  closesAt: string;
  orderCount: number;
  openCount: number;
  /** Mesas todavía abiertas (no entran al cierre hasta cobrarlas). */
  openTablesCount?: number;
  completedCount: number;
  cashTotal: number;
  transferTotal: number;
  cardTotal?: number;
  /** Pedidos + mesas en efectivo (listo para el campo Efectivo del cierre). */
  cashDeclaredTotal?: number;
  transferDeclaredTotal?: number;
  cardDeclaredTotal?: number;
  total: number;
  unitsSold: number;
  defaultChangeAmount?: number;
  byFulfillment?: {
    TAKEAWAY: FulfillmentBucket;
    DELIVERY: FulfillmentBucket;
    COUNTER: FulfillmentBucket;
  };
  paymentsByMethod?: ClosingPayMethodRow[];
  deliverate?: {
    closingSourceId: string | null;
    paymentMethod: 'CASH' | 'TRANSFER';
    includeInDeclared: boolean;
    amount: number;
    cashTotal: number;
    transferTotal: number;
    orderCount: number;
    unitsSold: number;
  } | null;
  tables?: {
    closedCount: number;
    coversTotal: number;
    coversFromReservations?: number;
    coversSuggested?: number;
    ticketTotal: number;
    tipTotal: number;
    cashTotal: number;
    transferTotal: number;
    cardTotal: number;
    paymentsByMethod: ClosingPayMethodRow[];
  };
};

export function buildClosingDraftFromOrdersSummary(opts: {
  shopId: string;
  userId: string;
  shop: { defaultChangeAmount?: number | null } | null | undefined;
  summary: ClosingSummary;
  sources: ShopClosingSource[];
  caja?: CashClosing | null;
  pendingClosing?: PendingClosingNotice | null;
}): ClosingFormDraft {
  const { shopId, userId, shop, summary, sources, caja, pendingClosing } = opts;
  const openingFromCaja =
    caja?.cashOpeningAmount != null && Number(caja.cashOpeningAmount) >= 0
      ? Number(caja.cashOpeningAmount)
      : null;
  const opening =
    openingFromCaja ??
    (summary.defaultChangeAmount != null && summary.defaultChangeAmount > 0
      ? summary.defaultChangeAmount
      : (shop?.defaultChangeAmount ?? null));
  const openingAmt = Math.max(0, Number(opening) || 0);

  const catalog = (sources ?? []).filter((s) => s.active !== false && s.role !== 'CASH');
  const byAccount = new Map(
    catalog.filter((s) => !!s.accountId).map((s) => [String(s.accountId), s] as const),
  );
  const nameKey = (n: string) =>
    String(n ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const findByNameHint = (...hints: RegExp[]) =>
    catalog.find((s) => hints.some((h) => h.test(nameKey(s.name)))) ?? null;
  const pvsSource =
    catalog.find((s) => (s.posnets ?? []).length > 0 && /pvs|tarjeta|card|posnet/i.test(s.name)) ??
    findByNameHint(/\bpvs\b/, /tarjeta/, /card/) ??
    catalog.find((s) => (s.posnets ?? []).some((p) => /pvs/i.test(p.name))) ??
    null;
  const transferSource =
    findByNameHint(/transfer/, /transf/) ??
    catalog.find((s) => String(s.kind) === 'OWN_ACCOUNT' && /transfer|transf/i.test(s.name)) ??
    null;
  const mpSource = findByNameHint(/mercado\s*pago/, /\bmp\b/);

  type SourceDraft = {
    sourceId: string;
    name: string;
    includeInDeclared: boolean;
    kind: 'OWN_ACCOUNT' | 'SETTLE_CASH' | 'SETTLE_ACCOUNT' | 'RECORD_ONLY';
    amount: number;
    lines: number[] | null;
    posnetAmounts: Array<{ posnetId: string; name: string; amount: number }> | null;
  };
  const sourceMap = new Map<string, SourceDraft>();

  const addToSource = (src: ShopClosingSource, amount: number) => {
    if (!(amount > 0) || !src.id) return;
    const prev = sourceMap.get(src.id);
    const nextAmt = Math.round(((prev?.amount ?? 0) + amount) * 100) / 100;
    const posnets = src.posnets ?? [];
    // Varios posnets: el total va en amount (Suma editable); no inventar un posnet.
    if (posnets.length > 1) {
      sourceMap.set(src.id, {
        sourceId: src.id,
        name: src.name,
        includeInDeclared: !!src.includeInDeclared,
        kind: (src.kind as SourceDraft['kind']) || 'OWN_ACCOUNT',
        amount: nextAmt,
        lines: null,
        posnetAmounts: prev?.posnetAmounts ?? null,
      });
      return;
    }
    if (posnets.length === 1) {
      const first = posnets[0];
      const existing = prev?.posnetAmounts ?? [];
      const byId = new Map(existing.map((p) => [p.posnetId, { ...p }]));
      const row = byId.get(first.id) ?? {
        posnetId: first.id,
        name: first.name || 'Posnet',
        amount: 0,
      };
      row.amount = Math.round((row.amount + amount) * 100) / 100;
      byId.set(first.id, row);
      sourceMap.set(src.id, {
        sourceId: src.id,
        name: src.name,
        includeInDeclared: !!src.includeInDeclared,
        kind: (src.kind as SourceDraft['kind']) || 'OWN_ACCOUNT',
        amount: nextAmt,
        lines: null,
        posnetAmounts: [...byId.values()],
      });
      return;
    }
    const lines = [...(prev?.lines ?? []), amount];
    sourceMap.set(src.id, {
      sourceId: src.id,
      name: src.name,
      includeInDeclared: !!src.includeInDeclared,
      kind: (src.kind as SourceDraft['kind']) || 'OWN_ACCOUNT',
      amount: nextAmt,
      lines,
      posnetAmounts: null,
    });
  };

  const payRows: ClosingPayMethodRow[] = [
    ...(summary.paymentsByMethod ?? []),
    ...(summary.tables?.paymentsByMethod ?? []),
  ].filter((p) => Number(p.amount) > 0);

  // Compat pedidos viejos sin paymentsByMethod: armar desde buckets cash/transfer.
  if (!payRows.length) {
    const by = summary.byFulfillment;
    const pushLegacy = (label: string, amount: number, kind: 'CASH' | 'TRANSFER') => {
      if (!(amount > 0)) return;
      payRows.push({
        paymentMethodId: kind === 'TRANSFER' ? 'op_transfer' : 'op_cash',
        paymentMethodName: label,
        accountId: null,
        amount,
        kind,
      });
    };
    if (by) {
      pushLegacy('Pedidos take away (efectivo)', by.TAKEAWAY.cashTotal, 'CASH');
      pushLegacy('Pedidos take away (transf.)', by.TAKEAWAY.transferTotal, 'TRANSFER');
      pushLegacy('Pedidos delivery (efectivo)', by.DELIVERY.cashTotal, 'CASH');
      pushLegacy('Pedidos delivery (transf.)', by.DELIVERY.transferTotal, 'TRANSFER');
      pushLegacy('Pedidos mostrador (efectivo)', by.COUNTER.cashTotal, 'CASH');
      pushLegacy('Pedidos mostrador (transf.)', by.COUNTER.transferTotal, 'TRANSFER');
    } else {
      pushLegacy('Pedidos online (efectivo)', summary.cashTotal, 'CASH');
      pushLegacy('Pedidos online (transferencia)', summary.transferTotal, 'TRANSFER');
    }
    if (summary.tables?.cashTotal) {
      pushLegacy('Mesas (efectivo)', summary.tables.cashTotal, 'CASH');
    }
    if (summary.tables?.transferTotal) {
      pushLegacy('Mesas (transf.)', summary.tables.transferTotal, 'TRANSFER');
    }
    if (summary.tables?.cardTotal) {
      payRows.push({
        paymentMethodId: 'tp_card',
        paymentMethodName: 'Tarjeta',
        accountId: null,
        amount: summary.tables.cardTotal,
        kind: 'CARD',
      });
    }
  }

  let cashSales = 0;
  let cardLegacy = 0;
  let transferLegacy = 0;

  const resolveSourceForPay = (pay: ClosingPayMethodRow): ShopClosingSource | null => {
    if (pay.accountId) {
      const byId = byAccount.get(String(pay.accountId));
      if (byId) return byId;
    }
    const n = nameKey(pay.paymentMethodName);
    if (!n) return null;
    const exact = catalog.find((s) => nameKey(s.name) === n);
    if (exact) return exact;
    // Evitar que «Efectivo» matchee «Deliberate Efectivo» u otras cuentas.
    if (/^(efectivo|cash|contado)$/.test(n)) return null;
    return (
      catalog.find((s) => {
        const sn = nameKey(s.name);
        if (sn.length < 3 || n.length < 3) return false;
        return sn.includes(n) || n.includes(sn);
      }) ?? null
    );
  };

  for (const pay of payRows) {
    const amount = Math.round(Number(pay.amount) * 100) / 100;
    if (!(amount > 0)) continue;

    const kind = String(pay.kind || '').toUpperCase();
    const payName = String(pay.paymentMethodName ?? '');
    const isCard = kind === 'CARD' || /pvs|tarjeta|card|posnet/i.test(payName);
    const isTransfer = kind === 'TRANSFER' || /transfer|transf/i.test(payName);

    // Respetar el mapeo Cuenta del medio de mesa (ej. Transferencia → PVS).
    const linked = resolveSourceForPay(pay);
    if (linked) {
      // Efectivo Caja (role CASH) no entra en cuentas del local: va al contado.
      if (String(linked.role ?? '').toUpperCase() === 'CASH') {
        cashSales += amount;
        continue;
      }
      addToSource(linked, amount);
      continue;
    }

    if (isCard) {
      if (pvsSource) addToSource(pvsSource, amount);
      else cardLegacy += amount;
      continue;
    }
    if (isTransfer) {
      if (mpSource && /mercado|\bmp\b/i.test(payName)) {
        addToSource(mpSource, amount);
      } else if (transferSource) {
        addToSource(transferSource, amount);
      } else {
        transferLegacy += amount;
      }
      continue;
    }
    // Sin vínculo: efectivo de caja.
    cashSales += amount;
  }

  const deliverate = summary.deliverate;
  if (deliverate?.closingSourceId && deliverate.amount > 0) {
    const dSrc = catalog.find((s) => s.id === deliverate.closingSourceId);
    if (dSrc) {
      addToSource(dSrc, deliverate.amount);
    } else {
      sourceMap.set(deliverate.closingSourceId, {
        sourceId: deliverate.closingSourceId,
        name: 'Deliverate',
        includeInDeclared: !!deliverate.includeInDeclared,
        kind: 'OWN_ACCOUNT',
        amount: deliverate.amount,
        lines: [deliverate.amount],
        posnetAmounts: null,
      });
    }
  }

  const sourceAmounts = [...sourceMap.values()];
  // Contado = apertura + ventas en efectivo (si no hay ventas, queda = apertura → declarado sin resta fantasma).
  const cashAmount = Math.round((openingAmt + cashSales) * 100) / 100;
  const by = summary.byFulfillment;
  const tables = summary.tables;

  // Legacy sin cuenta del local: que se vea en cobros (transferAmount ya no se muestra solo).
  const otherCobros: Array<{ label: string; amount: number; paymentMethod: string }> = [];
  if (transferLegacy > 0) {
    otherCobros.push({
      label: 'Transferencia',
      amount: transferLegacy,
      paymentMethod: 'TRANSFER',
    });
  }
  if (cardLegacy > 0) {
    otherCobros.push({
      label: 'Tarjeta',
      amount: cardLegacy,
      paymentMethod: 'CARD',
    });
  }

  // Mismo criterio que declaredTotal del formulario: precarga Caja (sistema).
  const sourcesDeclared = sourceAmounts
    .filter((s) => s.includeInDeclared)
    .reduce((sum, s) => sum + sourceRowTotal(s), 0);
  const cobrosTotal = otherCobros.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const cashCollected = Math.round((cashAmount - openingAmt) * 100) / 100;
  const declaredTotal = Math.round((cashCollected + cobrosTotal + sourcesDeclared) * 100) / 100;

  const notesParts = [
    `Turno · ${summary.shiftName} (${summary.opensAt}–${summary.closesAt})`,
    summary.businessDate,
    summary.orderCount ? `${summary.orderCount} pedido(s)` : null,
    summary.completedCount ? `${summary.completedCount} completado(s)` : null,
    summary.openCount ? `${summary.openCount} abierto(s)` : null,
    summary.openTablesCount ? `${summary.openTablesCount} mesa(s) abierta(s)` : null,
    by?.COUNTER?.orderCount ? `${by.COUNTER.orderCount} mostrador` : null,
    by?.TAKEAWAY?.orderCount ? `${by.TAKEAWAY.orderCount} take away` : null,
    by?.DELIVERY?.orderCount ? `${by.DELIVERY.orderCount} delivery` : null,
    deliverate?.orderCount
      ? `${deliverate.orderCount} Deliverate (${deliverate.paymentMethod === 'TRANSFER' ? 'transf.' : 'efectivo'})`
      : null,
    tables?.closedCount ? `${tables.closedCount} mesa(s) cerrada(s)` : null,
    tables?.tipTotal ? `propinas mesas ${formatMoney(tables.tipTotal)}` : null,
  ].filter(Boolean);

  return {
    v: 1,
    shopId,
    userId,
    savedAt: Date.now(),
    tipDraft: null,
    pendingClosing: pendingClosing ?? null,
    form: {
      businessDate: summary.businessDate,
      shiftId: summary.shiftId,
      cashOpeningAmount: openingAmt,
      cashLeftInRegister: null,
      cashAmount,
      cardAmount: null,
      mercadoPagoAmount: null,
      accountDniAmount: null,
      deliveryAppsAmount: null,
      transferAmount: null,
      posSystemAmount: declaredTotal > 0 ? declaredTotal : null,
      unitsSold: summary.unitsSold > 0 ? summary.unitsSold : null,
      coversCount:
        tables?.coversSuggested && tables.coversSuggested > 0
          ? tables.coversSuggested
          : tables?.coversTotal && tables.coversTotal > 0
            ? tables.coversTotal
            : null,
      cashWithdrawn: cashAmount > 0 ? cashAmount : null,
      cashWithdrawnByUserId: '',
      cashWithdrawnToAccountId: '',
      tipsAmount: tables?.tipTotal && tables.tipTotal > 0 ? tables.tipTotal : null,
      notes: notesParts.join(' · '),
      otherCobros,
      expenses: [],
      dniTransfers: [],
      posnetAmounts: [],
      sourceAmounts,
    },
  };
}
