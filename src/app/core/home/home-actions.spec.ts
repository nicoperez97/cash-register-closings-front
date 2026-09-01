import { describe, expect, it } from 'vitest';
import { AuthUser } from '../auth/auth.models';
import {
  homePrimaryShortcutId,
  homeShortcutsFor,
} from './home-actions';

function user(partial: Partial<AuthUser> & Pick<AuthUser, 'id' | 'email'>): AuthUser {
  return {
    fullName: 'Test',
    globalRole: 'CASHIER',
    role: 'user',
    shopIds: ['s1'],
    shopRoles: { s1: 'CASHIER' },
    shopPermissions: {},
    shopModulePermissions: {},
    permissions: [],
    shops: [],
    ...partial,
  };
}

describe('homeShortcutsFor', () => {
  it('solo crear cierre: nuevo cierre sí, listado no', () => {
    const u = user({
      id: 'u1',
      email: 'c@t.com',
      shopPermissions: { s1: ['closings.create', 'closings.read'] },
    });
    const ids = homeShortcutsFor(u, 's1').map((s) => s.id);
    expect(ids).toContain('new-closing');
    expect(ids).not.toContain('closings');
    expect(ids).not.toContain('reports');
  });

  it('create + bebidas: stock y nuevo cierre', () => {
    const u = user({
      id: 'u1',
      email: 'b@t.com',
      shopPermissions: {
        s1: ['closings.create', 'closings.read', 'beverageStock.read', 'shortages.read'],
      },
    });
    const ids = homeShortcutsFor(u, 's1').map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['new-closing', 'beverage-stock', 'shortages']));
    expect(ids).not.toContain('closings');
  });

  it('visor: listado de cierres, no crear', () => {
    const u = user({
      id: 'u1',
      email: 'v@t.com',
      globalRole: 'VIEWER',
      shopPermissions: { s1: ['closings.read', 'reports.view'] },
    });
    const ids = homeShortcutsFor(u, 's1').map((s) => s.id);
    expect(ids).toContain('closings');
    expect(ids).not.toContain('new-closing');
    expect(ids).toContain('reports');
  });
});

describe('homePrimaryShortcutId', () => {
  it('prioriza nuevo cierre si puede crear', () => {
    const u = user({
      id: 'u1',
      email: 'c@t.com',
      shopPermissions: { s1: ['closings.create', 'closings.read'] },
    });
    expect(homePrimaryShortcutId(u, 's1')).toBe('new-closing');
  });
});
