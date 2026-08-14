import { SalonRuleSlot } from './salon.models';

/** Tamaños que se muestran siempre en el editor de reglas. */
export const DEFAULT_RULE_SIZES = [2, 3, 4, 6] as const;

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
