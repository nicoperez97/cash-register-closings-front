/** Dígitos listos para wa.me / api.whatsapp.com (con código de país cuando aplica). */
export function phoneDigitsForWhatsApp(phone?: string | null): string {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';

  // Uruguay móvil local: 09xxxxxxx / 9xxxxxxx → 5989xxxxxxx
  if (/^0?9\d{7}$/.test(digits)) {
    digits = `598${digits.replace(/^0/, '')}`;
  }

  return digits;
}

export function hasWhatsAppPhone(phone?: string | null): boolean {
  return phoneDigitsForWhatsApp(phone).length >= 8;
}

export function whatsappUrlFromPhone(
  phone?: string | null,
  text?: string | null,
): string | null {
  const digits = phoneDigitsForWhatsApp(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const msg = String(text ?? '').trim();
  if (!msg) return base;
  return `${base}?text=${encodeURIComponent(msg)}`;
}

export function openWhatsAppUrl(url: string): boolean {
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return true;
  } catch {
    /* fall through */
  }
  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}
