import { describe, expect, it } from 'vitest';
import {
  AuthUser,
  canCustomizeLayout,
  canViewClosingsList,
  expandModulePermissions,
  hasShopPermission,
  isCashierOnly,
  isClosingsCreateOnly,
  isMorePrivileged,
  isShopAdministrator,
  migrateModuleLevels,
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

  it('gerente con permisos amplios no personaliza menú', () => {
    const user = cashierUser();
    user.globalRole = 'MANAGER';
    user.shopRoles = { s1: 'MANAGER' };
    user.shopPermissions = {
      s1: [
        'closings.create',
        'closings.read',
        'stock.read',
        'beverageStock.read',
        'shortages.read',
      ] as never[],
    };
    expect(isShopAdministrator(user, 's1')).toBe(false);
    expect(canCustomizeLayout(user, 's1')).toBe(false);
  });

  it('admin del local sí personaliza menú', () => {
    const user = cashierUser();
    user.globalRole = 'ADMIN';
    user.shopRoles = { s1: 'ADMIN' };
    expect(isShopAdministrator(user, 's1')).toBe(true);
    expect(canCustomizeLayout(user, 's1')).toBe(true);
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
    expect(canAccessAppRoute('/closings', user, 's1', { features })).toBe(false);
    expect(canAccessAppRoute('/waiting-list', user, 's1', { features })).toBe(false);
    expect(canAccessAppRoute('/reservations', user, 's1', { features })).toBe(false);
    expect(canAccessAppRoute('/profile', user, 's1', { features })).toBe(true);
  });

  it('atajos: cajero ve new-closing, no closings ni waiting-list', () => {
    const user = cashierUser();
    expect(canAccessToolbarAction('new-closing', user, 's1', { features })).toBe(true);
    expect(canAccessToolbarAction('closings', user, 's1', { features })).toBe(false);
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

describe('migrateModuleLevels', () => {
  it('orders none explícito no se infiere desde stock', () => {
    const levels = migrateModuleLevels({
      stock: 'manage',
      beverageStock: 'manage',
      orders: 'none',
    });
    expect(levels.orders).toBe('none');
  });

  it('sin orders en mapa sí se infiere desde stock', () => {
    const levels = migrateModuleLevels({ stock: 'read' });
    expect(levels.orders).toBe('read');
  });
});

describe('isClosingsCreateOnly', () => {
  it('preset solo crear no ve listado', () => {
    const user = cashierUser();
    expect(isClosingsCreateOnly(user, 's1')).toBe(true);
    expect(canViewClosingsList(user, 's1')).toBe(false);
  });

  it('create + stock sigue sin listado de cierres', () => {
    const user = cashierUser();
    user.shopPermissions = {
      s1: ['closings.create', 'closings.read', 'beverageStock.read'],
    };
    expect(isCashierOnly(user, 's1')).toBe(false);
    expect(isClosingsCreateOnly(user, 's1')).toBe(true);
    expect(canViewClosingsList(user, 's1')).toBe(false);
    expect(canAccessAppRoute('/beverage-stock', user, 's1', {
      features: { waitingListEnabled: true, tipsEnabled: true, reservationsEnabled: true },
    })).toBe(true);
  });

  it('visor con read sí ve listado', () => {
    const user = cashierUser();
    user.shopPermissions = { s1: ['closings.read'] };
    expect(isClosingsCreateOnly(user, 's1')).toBe(false);
    expect(canViewClosingsList(user, 's1')).toBe(true);
  });
});

describe('isMorePrivileged', () => {
  function twinCashiers(opts?: {
    targetExtraShops?: string[];
    currentExtraShops?: string[];
    targetPerms?: string[];
    currentPerms?: string[];
  }): { current: AuthUser; target: AuthUser } {
    const basePerms = ['closings.create', 'closings.read'];
    const current = cashierUser('s1');
    current.id = 'current';
    current.shopAccountIds = {};
    current.shopPermissions = { s1: [...(opts?.currentPerms ?? basePerms)] };
    const target = cashierUser('s1');
    target.id = 'target';
    target.shopAccountIds = {};
    target.shopPermissions = { s1: [...(opts?.targetPerms ?? basePerms)] };
    for (const id of opts?.currentExtraShops ?? []) {
      current.shopIds = [...current.shopIds, id];
      current.shopRoles = { ...current.shopRoles, [id]: 'CASHIER' };
      current.shopPermissions = {
        ...current.shopPermissions,
        [id]: [...basePerms],
      };
    }
    for (const id of opts?.targetExtraShops ?? []) {
      target.shopIds = [...target.shopIds, id];
      target.shopRoles = { ...target.shopRoles, [id]: 'CASHIER' };
      target.shopPermissions = {
        ...target.shopPermissions,
        [id]: [...basePerms],
      };
    }
    return { current, target };
  }

  it('mismos privilegios → no pide re-auth', () => {
    const { current, target } = twinCashiers();
    expect(isMorePrivileged(target, current, 's1')).toBe(false);
  });

  it('destino con un local más → pide re-auth', () => {
    const { current, target } = twinCashiers({ targetExtraShops: ['s2'] });
    expect(isMorePrivileged(target, current, 's1')).toBe(true);
  });

  it('destino con menos locales (subconjunto) → no pide re-auth', () => {
    const { current, target } = twinCashiers({ currentExtraShops: ['s2'] });
    expect(isMorePrivileged(target, current, 's1')).toBe(false);
  });

  it('destino con menos permisos (subconjunto) → no pide re-auth', () => {
    const { current, target } = twinCashiers({
      currentPerms: ['closings.create', 'closings.read', 'waitingList.read'],
      targetPerms: ['closings.create', 'closings.read'],
    });
    expect(isMorePrivileged(target, current, 's1')).toBe(false);
  });

  it('destino con un permiso extra → pide re-auth', () => {
    const { current, target } = twinCashiers({
      currentPerms: ['closings.create', 'closings.read'],
      targetPerms: ['closings.create', 'closings.read', 'waitingList.read'],
    });
    expect(isMorePrivileged(target, current, 's1')).toBe(true);
  });
});
