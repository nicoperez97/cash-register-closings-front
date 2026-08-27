import {
  nextCalendarDate,
  normalizeOpeningTime,
  parseOpeningMinutes,
  zonedDateParts,
} from './business-date';
import { newId } from '../utils/id';

export interface ShopShift {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
}

function newShiftId(): string {
  return newId();
}

export function defaultShopShift(openingTime?: string | null): ShopShift {
  const opensAt = normalizeOpeningTime(openingTime);
  return { id: newShiftId(), name: 'Turno', opensAt, closesAt: opensAt };
}

export function shopShiftsOf(
  shop?: { shifts?: ShopShift[] | null; openingTime?: string | null } | null,
): ShopShift[] {
  const list = Array.isArray(shop?.shifts) ? shop!.shifts! : [];
  if (list.length) return list;
  return [defaultShopShift(shop?.openingTime)];
}

export function shopHasMultipleShifts(
  shop?: { shifts?: ShopShift[] | null } | null,
): boolean {
  return (shop?.shifts?.length ?? 0) > 1;
}

export function minutesOfHhMm(raw?: string | null): number {
  return parseOpeningMinutes(raw);
}

export function isTimeInShiftWindow(
  nowMins: number,
  opensAt: string,
  closesAt: string,
): boolean {
  const opens = minutesOfHhMm(opensAt);
  const closes = minutesOfHhMm(closesAt);
  const t = ((nowMins % (24 * 60)) + 24 * 60) % (24 * 60);
  if (opens === closes) return true;
  if (opens < closes) return t >= opens && t < closes;
  return t >= opens || t < closes;
}

export function shopBusinessOpening(
  shop?: { shifts?: ShopShift[] | null; openingTime?: string | null } | null,
): string {
  const list = shopShiftsOf(shop);
  let best = list[0];
  for (const s of list) {
    if (minutesOfHhMm(s.opensAt) < minutesOfHhMm(best.opensAt)) best = s;
  }
  return normalizeOpeningTime(best.opensAt);
}

export function sortedShifts(shifts: ShopShift[]): ShopShift[] {
  return [...shifts].sort((a, b) => minutesOfHhMm(a.opensAt) - minutesOfHhMm(b.opensAt));
}

/** El turno siguiente en el reloj (el que corta a este). */
export function nextShiftOf(shift: ShopShift, shifts: ShopShift[]): ShopShift {
  const list = sortedShifts(shifts.length ? shifts : [shift]);
  const i = Math.max(0, list.findIndex((s) => s.id === shift.id));
  return list[(i + 1) % list.length];
}

/**
 * Turno vigente: el que abrió más recientemente.
 * Ese turno sigue hasta que abre el siguiente (no hasta su hora de cierre).
 */
export function resolveCurrentShift(
  shop?: { shifts?: ShopShift[] | null; openingTime?: string | null; timezone?: string | null } | null,
  when: Date = new Date(),
): ShopShift {
  const list = shopShiftsOf(shop);
  if (list.length === 1) return list[0];
  const p = zonedDateParts(when, shop?.timezone);
  const nowMins = p.hour * 60 + p.minute;
  let best = list[0];
  let bestSince = Infinity;
  for (const s of list) {
    let since = nowMins - minutesOfHhMm(s.opensAt);
    if (since < 0) since += 24 * 60;
    if (since < bestSince) {
      bestSince = since;
      best = s;
    }
  }
  return best;
}

export function shiftHoursLabel(shift: ShopShift): string {
  if (shift.opensAt === shift.closesAt) return `${shift.opensAt} (día completo)`;
  return `${shift.opensAt} – ${shift.closesAt}`;
}

/** La fecha de este turno corre hasta que abre el siguiente. */
export function formatShiftHint(
  businessDate: string,
  shift: ShopShift,
  shifts: ShopShift[],
): string {
  const next = nextShiftOf(shift, shifts);
  const sameCalendarDay = minutesOfHhMm(next.opensAt) > minutesOfHhMm(shift.opensAt);
  const untilDate = sameDay(sameCalendarDay, businessDate);
  const [, month, day] = untilDate.split('-');
  return `Hasta las ${next.opensAt} del ${Number(day)}/${Number(month)}`;
}

function sameDay(sameCalendarDay: boolean, businessDate: string): string {
  return sameCalendarDay ? businessDate : nextCalendarDate(businessDate);
}
