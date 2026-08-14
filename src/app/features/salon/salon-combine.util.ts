import { SalonArea, SalonRuleSlot } from './salon.models';

type ShopPartyCfg = {
  reservationInsideMaxPartySize?: number | null;
  reservationOutsideMinPartySize?: number | null;
};

function readInt(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function shopInsideMax(shop: ShopPartyCfg | null | undefined): number | null {
  return readInt(shop?.reservationInsideMaxPartySize);
}

export function shopOutsideMin(shop: ShopPartyCfg | null | undefined): number | null {
  return readInt(shop?.reservationOutsideMinPartySize);
}

/** Tamaños iniciales según Adentro hasta / Afuera desde. El resto se agrega a mano. */
export function suggestedRuleSizes(
  area: SalonArea,
  shop: ShopPartyCfg | null | undefined,
): number[] {
  const maxIn = shopInsideMax(shop);
  const minOut = shopOutsideMin(shop);
  if (area === 'INSIDE') {
    const max = maxIn ?? 3;
    const sizes: number[] = [];
    for (let n = 2; n <= Math.max(2, max); n++) sizes.push(n);
    return sizes;
  }
  const min = minOut ?? (maxIn != null ? maxIn + 1 : 4);
  return [Math.max(2, min)];
}

export function shopRuleHint(area: SalonArea, shop: ShopPartyCfg | null | undefined): string {
  if (area === 'INSIDE') {
    const max = shopInsideMax(shop);
    return max != null ? `adentro hasta ${max}` : 'sin tope adentro';
  }
  const min = shopOutsideMin(shop);
  return min != null ? `afuera desde ${min}` : 'sin mínimo afuera';
}

export function nextRuleSize(existing: number[]): number {
  const have = new Set(existing.filter((n) => n >= 2));
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 14, 16]) {
    if (!have.has(n)) return n;
  }
  return Math.max(8, ...have) + 2;
}

/**
 * Al armar mesas más grandes se descuenta del cupo más chico más cercano.
 * Ej.: 3 de 4 + 1 mesa de 6 → quedan 1 de 4 (la de 6 consume dos de 4).
 */
export function remainingAfterJoining(
  slots: SalonRuleSlot[],
  joinSize: number,
  joinCount = 1,
): SalonRuleSlot[] | null {
  if (joinSize < 2 || joinCount < 1) return slots.map((s) => ({ ...s }));
  const remaining = slots
    .filter((s) => s.maxCount > 0 && s.partySize > 0)
    .map((s) => ({ ...s }))
    .sort((a, b) => b.partySize - a.partySize);

  for (let n = 0; n < joinCount; n++) {
    const exact = remaining.find((s) => s.partySize === joinSize && s.maxCount > 0);
    if (exact) {
      exact.maxCount -= 1;
      continue;
    }
    const donor = remaining.find((s) => s.partySize < joinSize && s.maxCount > 0);
    if (!donor) return null;
    const need = Math.ceil(joinSize / donor.partySize);
    if (donor.maxCount < need) return null;
    donor.maxCount -= need;
  }

  return remaining
    .filter((s) => s.maxCount > 0)
    .sort((a, b) => a.partySize - b.partySize);
}

export function formatSlots(slots: SalonRuleSlot[]): string {
  if (!slots.length) return 'nada';
  return slots.map((s) => `${s.maxCount} de ${s.partySize}`).join(' · ');
}

export function countBySeats(seatsList: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const seats of seatsList) {
    counts[seats] = (counts[seats] ?? 0) + 1;
  }
  return counts;
}

export function formatTableInventory(seatsList: number[]): string {
  if (!seatsList.length) return 'sin mesas';
  const counts = countBySeats(seatsList);
  const parts = Object.keys(counts)
    .map(Number)
    .sort((a, b) => a - b)
    .map((seats) => `${counts[seats]} de ${seats}`);
  const covers = seatsList.reduce((sum, n) => sum + n, 0);
  return `${seatsList.length} mesa${seatsList.length === 1 ? '' : 's'} · ${parts.join(' · ')} · ${covers} cubiertos`;
}
