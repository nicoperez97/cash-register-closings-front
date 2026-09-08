const PREFIX = 'co-order-phone:';

function key(slug: string, code: string): string {
  return `${PREFIX}${String(slug).trim().toLowerCase()}:${String(code).trim().toUpperCase()}`;
}

/** Celular usado para ver un pedido concreto (sesión del navegador). */
export function rememberOrderPhone(slug: string, code: string, phone: string): void {
  const s = String(slug ?? '').trim();
  const c = String(code ?? '').trim().toUpperCase();
  const p = String(phone ?? '').trim();
  if (!s || !c || !p || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key(s, c), p);
  } catch {
    // ignore
  }
}

export function recallOrderPhone(slug: string, code: string): string | null {
  const s = String(slug ?? '').trim();
  const c = String(code ?? '').trim().toUpperCase();
  if (!s || !c || typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(key(s, c));
  } catch {
    return null;
  }
}
