export function copyTextNow(text: string): boolean {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  el.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  el.remove();
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }
  return ok;
}

export function requestWhenLabel(req: {
  businessDate?: string | null;
  reservationTime?: string | null;
}): string {
  const iso = req.businessDate?.slice(0, 10) ?? '';
  const [y, m, d] = iso.split('-');
  const label = d && m ? `${d}/${m}${y ? `/${y}` : ''}` : iso;
  return req.reservationTime ? `${label} · ${req.reservationTime}` : label;
}

export function igConfirmMessage(
  opts: {
    guestName: string;
    partySize: number;
    when: string;
    area: string;
    accepted: boolean;
  },
  shopName: string,
): string {
  const first = opts.guestName.split(' ')[0] || '';
  const pers = opts.partySize === 1 ? 'persona' : 'personas';
  if (!opts.accepted) {
    return `Hola ${first}! Esta vez no pudimos confirmar tu reserva en ${shopName} (${opts.when}). Gracias por escribirnos.`;
  }
  return `Hola ${first}! Te confirmamos la reserva en ${shopName} (${opts.partySize} ${pers} · ${opts.area} · ${opts.when}). ¡Te esperamos!`;
}
