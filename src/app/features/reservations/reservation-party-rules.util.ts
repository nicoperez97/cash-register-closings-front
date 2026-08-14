export type ShopPartyRules = {
  reservationInsideMaxPartySize?: number | null;
  reservationOutsideMinPartySize?: number | null;
  insideMaxPartySize?: number | null;
  outsideMinPartySize?: number | null;
};

function readMaxInside(shop: ShopPartyRules | null | undefined): number | null {
  const raw = shop?.reservationInsideMaxPartySize ?? shop?.insideMaxPartySize;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) < 1) return null;
  return Number(raw);
}

function readMinOutside(shop: ShopPartyRules | null | undefined): number | null {
  const raw = shop?.reservationOutsideMinPartySize ?? shop?.outsideMinPartySize;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) < 1) return null;
  return Number(raw);
}

export function partyMustSitOutside(
  partySize: number,
  shop: ShopPartyRules | null | undefined,
): boolean {
  const size = Math.round(Number(partySize));
  if (!Number.isFinite(size) || size < 1) return false;
  const maxInside = readMaxInside(shop);
  if (maxInside != null && size > maxInside) return true;
  const minOutside = readMinOutside(shop);
  if (minOutside != null && size >= minOutside) return true;
  return false;
}

export function outsideFromPartySize(shop: ShopPartyRules | null | undefined): number | null {
  const minOutside = readMinOutside(shop);
  if (minOutside != null) return minOutside;
  const maxInside = readMaxInside(shop);
  if (maxInside != null) return maxInside + 1;
  return null;
}

export function partyOutsideHint(
  partySize: number,
  shop: ShopPartyRules | null | undefined,
): string {
  if (!partyMustSitOutside(partySize, shop)) return '';
  const from = outsideFromPartySize(shop);
  if (from == null) return 'Para este grupo la mesa es afuera.';
  return `A partir de ${from} ${from === 1 ? 'persona' : 'personas'} la mesa es afuera.`;
}

export function effectivePartyRules(
  shop: ShopPartyRules | null | undefined,
  day?: {
    insideMaxPartySize?: number | null;
    outsideMinPartySize?: number | null;
  } | null,
): ShopPartyRules {
  return {
    reservationInsideMaxPartySize:
      day?.insideMaxPartySize != null
        ? Number(day.insideMaxPartySize)
        : readMaxInside(shop),
    reservationOutsideMinPartySize:
      day?.outsideMinPartySize != null
        ? Number(day.outsideMinPartySize)
        : readMinOutside(shop),
  };
}
