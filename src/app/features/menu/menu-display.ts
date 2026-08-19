export function normalizeMenuText(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const SECTION_SPLIT =
  /^(la\s*)?(pasta|pizze?|panini|panino|dolci|stuzzichini|aperitivi|birre|bibite|vini|entradas?|postres?|bebidas?|tragos?|ensaladas?|hamburguesas?|sandwiches?|platos?|principales?|minutas?|vinos?|cervezas?|cocktails?)\b/i;

export function prettySection(name: string): string {
  let t = String(name ?? '').trim();
  if (!t) return 'Carta';
  const known: Record<string, string> = {
    lapasta: 'La pasta',
    aperitivilebirre: 'Aperitivi e birre',
    aperitivibirre: 'Aperitivi e birre',
    stuzzichini: 'Stuzzichini',
    dolci: 'Dolci',
    bibite: 'Bibite',
    carta: 'Carta',
    vini: 'Vini',
    panini: 'Panini',
  };
  const key = normalizeMenuText(t).replace(/\s+/g, '');
  if (known[key]) return known[key];

  if (!/\s/.test(t) && t.length > 8) {
    const lower = t.toLowerCase();
    const parts = [
      'aperitivi',
      'stuzzichini',
      'hamburguesas',
      'sandwiches',
      'principales',
      'entradas',
      'ensaladas',
      'cocktails',
      'cervezas',
      'bebidas',
      'postres',
      'panini',
      'panino',
      'pasta',
      'pizze',
      'pizza',
      'dolci',
      'birre',
      'bibite',
      'vini',
      'vinos',
      'tragos',
    ];
    for (const part of parts) {
      const idx = lower.indexOf(part);
      if (idx > 0) {
        const left = t.slice(0, idx).trim();
        const right = t.slice(idx);
        if (SECTION_SPLIT.test(right) || parts.includes(part)) {
          t = `${left} ${right}`.replace(/\s+/g, ' ').trim();
          if (/^la$/i.test(left) && /^pasta/i.test(right)) t = `La ${right}`;
          if (/aperitivi/i.test(left) && /^birre/i.test(right)) t = 'Aperitivi e birre';
          break;
        }
      }
    }
  }

  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÜÑ]/.test(t)) {
    return t.charAt(0) + t.slice(1).toLowerCase();
  }
  return t.replace(/\s+/g, ' ');
}

export function menuPriceOf(item: { price?: number | null; priceLabel?: string | null }): string {
  const label = String(item.priceLabel ?? '').trim();
  if (label) return label;
  if (item.price == null || !Number.isFinite(Number(item.price))) return '';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(item.price));
}
