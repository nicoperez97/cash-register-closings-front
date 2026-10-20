import { describe, expect, it } from 'vitest';
import type { WaiterFloor, WaiterSession } from '../../features/waiter/waiter-api.service';
import { DEMO_MENU_ITEM_IDS, DEMO_SHOP_ID } from './demo-fixtures';
import { demoComandaShopGet, demoWaiterGet, demoWaiterMutation } from './demo-waiter';

const PUB = '/public/shops/demo-gastro/waiter';

describe('demo-waiter (comanda offline)', () => {
  it('entrar desde Operación devuelve token, mozo y local', () => {
    const res = demoWaiterMutation('POST', `/shops/${DEMO_SHOP_ID}/comanda/enter`, {}) as {
      token: string;
      shop: { slug: string };
    };
    expect(res.token).toBeTruthy();
    expect(res.shop.slug).toBeTruthy();
    expect(demoComandaShopGet('comanda/waiters')).toHaveLength(2);
  });

  it('abre mesa, envía pedido, saca ticket y cierra', () => {
    const opened = demoWaiterMutation('POST', `${PUB}/sessions`, {
      salonTableId: 'demo-tbl-2',
      covers: 4,
    }) as WaiterSession;
    expect(opened.status).toBe('OPEN');
    expect(opened.table?.label).toBe('M2');

    const floor = demoWaiterGet('waiter/tables') as WaiterFloor;
    expect(floor.tables.find((t) => t.id === 'demo-tbl-2')?.openSession?.id).toBe(opened.id);

    demoWaiterMutation('POST', `${PUB}/sessions/${opened.id}/orders`, {
      items: [
        { menuItemId: DEMO_MENU_ITEM_IDS.milanesa, qty: 2 },
        { menuItemId: DEMO_MENU_ITEM_IDS.agua, qty: 1 },
      ],
    });
    const withOrder = demoWaiterGet(`waiter/sessions/${opened.id}`) as WaiterSession;
    expect(withOrder.orderCount).toBe(1);
    expect(withOrder.ticketTotal).toBe(2 * 12500 + 2500);

    const ticket = demoWaiterMutation(
      'POST',
      `${PUB}/sessions/${opened.id}/print-customer-ticket`,
      {},
    ) as WaiterSession;
    expect(ticket.customerTicketPrinted).toBe(true);

    const closed = demoWaiterMutation('POST', `${PUB}/sessions/${opened.id}/close`, {
      paymentMethodId: 'demo-pm-cash',
      tipMode: 'percent',
      tipValue: 10,
    }) as WaiterSession;
    expect(closed.status).toBe('CLOSED');
    expect(closed.tipAmount).toBe(2750);

    const after = demoWaiterGet('waiter/tables') as WaiterFloor;
    expect(after.tables.find((t) => t.id === 'demo-tbl-2')?.openSession).toBeNull();
  });

  it('no toma rutas que no son de la comanda', () => {
    expect(demoWaiterGet('menu')).toBeUndefined();
    expect(demoComandaShopGet('accounts')).toBeUndefined();
    expect(demoWaiterMutation('POST', `/shops/${DEMO_SHOP_ID}/closings`, {})).toBeUndefined();
  });
});
