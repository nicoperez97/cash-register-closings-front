export type PartyMixItem = { partySize: number; tables: number };

export function partyMixFromReservations(
  rows: Array<{ partySize?: number | null; removedAfterSeated?: boolean }>,
): PartyMixItem[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.removedAfterSeated) continue;
    const n = Math.round(Number(r.partySize) || 0);
    if (n < 1) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([partySize, tables]) => ({ partySize, tables }));
}

export function formatPartyMixItem(item: PartyMixItem): string {
  const mesa = item.tables === 1 ? 'mesa' : 'mesas';
  const pers = item.partySize === 1 ? 'persona' : 'personas';
  return `${item.tables} ${mesa} de ${item.partySize} ${pers}`;
}

export function formatPartyMix(items: PartyMixItem[], sep = ', '): string {
  return items.map(formatPartyMixItem).join(sep);
}
