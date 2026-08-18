import { isUserVisible } from '../../shared/user-visibility';
import type { ShopUserOption } from './closings-api.service';

export type WithdrawAccountOption = {
  id: string;
  name: string;
  userId: string;
  userName: string;
  label: string;
};

function accountLabel(accountName: string, userName: string): string {
  const name = accountName.trim();
  const user = userName.trim();
  if (name && user && name !== user) return `${name} · ${user}`;
  return name || user;
}

/** Cuentas PARTNER visibles para “Quién se lo lleva”, sin duplicar si varios usuarios las comparten. */
export function withdrawAccountOptionsFromUsers(
  users: ShopUserOption[],
  opts?: { selectedAccountId?: string; selectedUserId?: string },
): WithdrawAccountOption[] {
  const selectedAccountId = opts?.selectedAccountId ?? '';
  const selectedUserId = opts?.selectedUserId ?? '';
  const seen = new Set<string>();
  const out: WithdrawAccountOption[] = [];

  for (const user of users) {
    const visible = isUserVisible(user, 'cashWithdraw') || user.id === selectedUserId;
    for (const acc of user.ledgerAccounts ?? []) {
      if (seen.has(acc.id)) continue;
      if (!visible && acc.id !== selectedAccountId) continue;
      seen.add(acc.id);
      const userName = user.fullName?.trim() ?? '';
      out.push({
        id: acc.id,
        name: acc.name,
        userId: user.id,
        userName,
        label: accountLabel(acc.name, userName),
      });
    }
  }

  return out.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function userIdForWithdrawAccount(
  users: ShopUserOption[],
  accountId: string | null | undefined,
): string | null {
  if (!accountId) return null;
  return users.find((u) => (u.ledgerAccounts ?? []).some((a) => a.id === accountId))?.id ?? null;
}

/** Completa la cuenta si el cierre trae usuario y esa persona tiene una sola cuenta. */
export function hydrateWithdrawnAccountId(
  users: ShopUserOption[],
  userId: string,
  currentAccountId: string,
): string {
  if (currentAccountId) return currentAccountId;
  if (!userId) return '';
  const accounts = users.find((u) => u.id === userId)?.ledgerAccounts ?? [];
  return accounts.length === 1 ? accounts[0].id : '';
}
