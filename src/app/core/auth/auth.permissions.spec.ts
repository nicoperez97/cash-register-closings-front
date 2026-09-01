import { describe, expect, it } from 'vitest';
import {
  AuthUser,
  canCustomizeLayout,
  expandModulePermissions,
  hasShopPermission,
  isCashierOnly,
  permissionsForShop,
} from './auth.models';
import {
  canAccessAppRoute,
  canAccessToolbarAction,
} from './route-access';

function cashierUser(shopId = 's1'): AuthUser {
  return {
    id: 'u1',
    email: 'cajero@test.com',
    fullName: 'Cajero',
    globalRole: 'CASHIER',
    role: 'user',
    shopIds: [shopId],
    shopRoles: { [shopId]: 'CASHIER' },
    shopPermissions: {
      [shopId]: ['closings.create', 'closings.read'],
    },
    shopModulePermissions: {
      [shopId]: { closings: 'create' },
    },
    permissions: ['closings.create', 'closings.read'],
    shops: [],
  };
}

describe('permissionsForShop', () => {
  it('usa shopPermissions del API cuando existen', () => {
    const user = cashierUser();
    expect(permissionsForShop(user, 's1')).toEqual([
      'closings.create',
      'closings.read',
    ]);
  });

  it('expande shopModulePermissions si falta shopPermissions', () => {
    const user = cashierUser();
    user.shopPermissions = {};
    expect(permissionsForShop(user, 's1')).toEqual(
      expect.arrayContaining(['closings.create', 'closings.read']),
    );
    expect(permissionsForShop(user, 's1')).not.toContain('waitingList.read');
  });

  it('shopPermissions vacío explícito → sin permisos', () => {
    const user = cashierUser();
    user.shopPermissions = { s1: [] };
    expect(permissionsForShop(user, 's1')).toEqual([]);
  });
});

describe('isCashierOnly', () => {
  it('cajero closings-only es true', () => {
    expect(isCashierOnly(cashierUser(), 's1')).toBe(true);
  });

  it('usuario con waitingList no es cajero-only', () => {
    const user = cashierUser();
    user.shopPermissions = {
      s1: ['closings.create', 'closings.read', 'waitingList.read'],
    };
    expect(isCashierOnly(user, 's1')).toBe(false);
  });
});

describe('canCustomizeLayout', () => {
  it('cajero no personaliza menú/atajos', () => {
    expect(canCustomizeLayout(cashierUser(), 's1')).toBe(false);
  });
});

describe('route-access', () => {
  const features = {
    waitingListEnabled: true,
    tipsEnabled: true,
    reservationsEnabled: true,
  };

  it('cajero puede /closings/new pero no /waiting-list', () => {
    const user = cashierUser();
    expect(canAccessAppRoute('/closings/new', user, 's1', { features })).toBe(true);
    expect(canAccessAppRoute('/waiting-list', user, 's1', { features })).toBe(false);
    expect(canAccessAppRoute('/reservations', user, 's1', { features })).toBe(false);
    expect(canAccessAppRoute('/profile', user, 's1', { features })).toBe(true);
  });

  it('atajos: cajero ve new-closing, no waiting-list', () => {
    const user = cashierUser();
    expect(canAccessToolbarAction('new-closing', user, 's1', { features })).toBe(true);
    expect(canAccessToolbarAction('waiting-list', user, 's1', { features })).toBe(false);
    expect(canAccessToolbarAction('payments', user, 's1', { features })).toBe(false);
  });

  it('receptionist preset expande waitingList', () => {
    const perms = expandModulePermissions({
      reservations: 'manage',
      waitingList: 'manage',
    });
    expect(hasShopPermission(
      {
        ...cashierUser(),
        shopPermissions: { s1: perms as never[] },
      },
      's1',
      'waitingList.read',
    )).toBe(true);
  });

  it('ruta desconocida → denegada', () => {
    const user = cashierUser();
    expect(canAccessAppRoute('/ruta-inventada', user, 's1', { features })).toBe(false);
  });
});
