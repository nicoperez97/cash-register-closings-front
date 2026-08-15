export type ShopPartyRules = {
  reservationInsideMaxPartySize?: number | null;
  reservationOutsideMaxPartySize?: number | null;
  reservationOutsideMinPartySize?: number | null;
  insideMaxPartySize?: number | null;
  outsideMaxPartySize?: number | null;
  outsideMinPartySize?: number | null;
};

function readInt(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function readMaxInside(shop: ShopPartyRules | null | undefined): number | null {
  return readInt(shop?.reservationInsideMaxPartySize ?? shop?.insideMaxPartySize);
}

function readMaxOutside(shop: ShopPartyRules | null | undefined): number | null {
  return readInt(
    shop?.reservationOutsideMaxPartySize ??
      shop?.reservationOutsideMinPartySize ??
      shop?.outsideMaxPartySize ??
      shop?.outsideMinPartySize,
  );
}

export function partyFitsArea(
  area: 'INSIDE' | 'OUTSIDE' | string,
  partySize: number,
  shop: ShopPartyRules | null | undefined,
): boolean {
  const size = Math.round(Number(partySize));
  if (!Number.isFinite(size) || size < 1) return false;
  const max = String(area).toUpperCase() === 'OUTSIDE' ? readMaxOutside(shop) : readMaxInside(shop);
  if (max == null) return true;
  return size <= max;
}

export function partyMustSitOutside(
  partySize: number,
  shop: ShopPartyRules | null | undefined,
): boolean {
  return !partyFitsArea('INSIDE', partySize, shop);
}

export function partyAreaHint(
  area: 'INSIDE' | 'OUTSIDE' | string,
  partySize: number,
  shop: ShopPartyRules | null | undefined,
): string {
  if (partyFitsArea(area, partySize, shop)) return '';
  const isOut = String(area).toUpperCase() === 'OUTSIDE';
  const max = isOut ? readMaxOutside(shop) : readMaxInside(shop);
  if (max == null) return '';
  return `${isOut ? 'Afuera' : 'Adentro'} hasta ${max} ${max === 1 ? 'persona' : 'personas'}.`;
}

export function partyOutsideHint(
  partySize: number,
  shop: ShopPartyRules | null | undefined,
): string {
  return partyAreaHint('INSIDE', partySize, shop);
}

export function effectivePartyRules(
  shop: ShopPartyRules | null | undefined,
  day?: {
    insideMaxPartySize?: number | null;
    outsideMaxPartySize?: number | null;
    outsideMinPartySize?: number | null;
  } | null,
): ShopPartyRules {
  const outsideDay = day?.outsideMaxPartySize ?? day?.outsideMinPartySize;
  const inside =
    day?.insideMaxPartySize != null ? readInt(day.insideMaxPartySize) : readMaxInside(shop);
  const outside = outsideDay != null ? readInt(outsideDay) : readMaxOutside(shop);
  return {
    reservationInsideMaxPartySize: inside,
    reservationOutsideMaxPartySize: outside,
    reservationOutsideMinPartySize: outside,
  };
}
