import {
  nextCalendarDate,
  normalizeOpeningTime,
  parseOpeningMinutes,
  zonedDateParts,
} from './business-date';
import { newId } from '../utils/id';

export type ShopShiftLike = {
  id?: string;
  name?: string;
  opensAt?: string;
  closesAt?: string;
  weekdays?: number[] | null;
};

export interface ShopShift {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  /** 0=domingo … 6=sábado. Vacío o ausente = todos los días. */
  weekdays?: number[];
}

export type ShopShiftsSource = {
  shifts?: ShopShiftLike[] | null;
  openingTime?: string | null;
  timezone?: string | null;
} | null;

export const ALL_SHIFT_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export const SHIFT_WEEKDAY_CHIPS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
] as const;

function newShiftId(): string {
  return newId();
}

export function weekdayFromYmd(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

export function weekdayFromIsoDate(isoDate?: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').slice(0, 10));
  if (!m) return null;
  return weekdayFromYmd(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function weekdayFromWhen(when: Date, timezone?: string | null): number {
  const p = zonedDateParts(when, timezone);
  return weekdayFromYmd(p.year, p.month, p.day);
}

export function normalizeShiftWeekdays(raw?: number[] | null): number[] {
  if (!Array.isArray(raw) || !raw.length) return [...ALL_SHIFT_WEEKDAYS];
  const next = [
    ...new Set(raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
  ].sort((a, b) => a - b);
  return next.length ? next : [...ALL_SHIFT_WEEKDAYS];
}

export function shiftRunsOnWeekday(shift: ShopShift, weekday: number): boolean {
  return normalizeShiftWeekdays(shift.weekdays).includes(((weekday % 7) + 7) % 7);
}

export function defaultShopShift(openingTime?: string | null): ShopShift {
  const opensAt = normalizeOpeningTime(openingTime);
  return {
    id: newShiftId(),
    name: 'Turno',
    opensAt,
    closesAt: opensAt,
    weekdays: [...ALL_SHIFT_WEEKDAYS],
  };
}

export function shopShiftsOf(shop?: ShopShiftsSource): ShopShift[] {
  const list = Array.isArray(shop?.shifts) ? shop!.shifts! : [];
  if (list.length) {
    return list.map((s) => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? 'Turno'),
      opensAt: String(s.opensAt ?? '10:00'),
      closesAt: String(s.closesAt ?? s.opensAt ?? '10:00'),
      weekdays: normalizeShiftWeekdays(s.weekdays),
    }));
  }
  return [defaultShopShift(shop?.openingTime)];
}

export function shiftsOnWeekday(shifts: ShopShift[], weekday: number): ShopShift[] {
  return shifts.filter((s) => shiftRunsOnWeekday(s, weekday));
}

export function shiftsOnIsoDate(shop?: ShopShiftsSource, isoDate?: string | null): ShopShift[] {
  const list = shopShiftsOf(shop);
  const wd = weekdayFromIsoDate(isoDate);
  if (wd == null) return list;
  const scoped = shiftsOnWeekday(list, wd);
  return scoped.length ? scoped : list;
}

export function shopHasMultipleShifts(shop?: ShopShiftsSource, when?: Date): boolean {
  const defined = shop?.shifts ?? [];
  if (!when) return defined.length > 1;
  return shiftsOnWeekday(shopShiftsOf(shop), weekdayFromWhen(when, shop?.timezone)).length > 1;
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

export function shopBusinessOpening(shop?: ShopShiftsSource, when: Date = new Date()): string {
  const list = shopShiftsOf(shop);
  const wd = weekdayFromWhen(when, shop?.timezone);
  const scoped = shiftsOnWeekday(list, wd);
  const use = scoped.length ? scoped : list;
  let best = use[0];
  for (const s of use) {
    if (minutesOfHhMm(s.opensAt) < minutesOfHhMm(best.opensAt)) best = s;
  }
  return normalizeOpeningTime(best.opensAt);
}

export function sortedShifts(shifts: ShopShift[]): ShopShift[] {
  return [...shifts].sort((a, b) => minutesOfHhMm(a.opensAt) - minutesOfHhMm(b.opensAt));
}

/** El turno siguiente: el próximo que abre ese día, o el primero del día siguiente con turnos. */
export function nextShiftOf(
  shift: ShopShift,
  shifts: ShopShift[],
  weekday?: number,
): ShopShift {
  const list = shifts.length ? shifts : [shift];
  if (weekday == null) {
    const ordered = sortedShifts(list);
    const i = Math.max(0, ordered.findIndex((s) => s.id === shift.id));
    return ordered[(i + 1) % ordered.length];
  }
  const todayList = sortedShifts(shiftsOnWeekday(list, weekday));
  const i = todayList.findIndex((s) => s.id === shift.id);
  if (i >= 0 && i < todayList.length - 1) return todayList[i + 1];
  for (let d = 1; d <= 7; d++) {
    const wd = (weekday + d) % 7;
    const next = sortedShifts(shiftsOnWeekday(list, wd));
    if (next.length) return next[0];
  }
  return shift;
}

function daysUntilNextShift(shift: ShopShift, shifts: ShopShift[], weekday: number): number {
  const list = shifts.length ? shifts : [shift];
  const todayList = sortedShifts(shiftsOnWeekday(list, weekday));
  const i = todayList.findIndex((s) => s.id === shift.id);
  if (i >= 0 && i < todayList.length - 1) return 0;
  for (let d = 1; d <= 7; d++) {
    const wd = (weekday + d) % 7;
    if (sortedShifts(shiftsOnWeekday(list, wd)).length) return d;
  }
  return 0;
}

/**
 * Turno vigente: el que abrió más recientemente entre los de hoy
 * (y el de ayer, si todavía no abrió el de hoy).
 */
export function resolveCurrentShift(shop?: ShopShiftsSource, when: Date = new Date()): ShopShift {
  const list = shopShiftsOf(shop);
  if (list.length === 1) return list[0];
  const p = zonedDateParts(when, shop?.timezone);
  const nowMins = p.hour * 60 + p.minute;
  const todayWd = weekdayFromYmd(p.year, p.month, p.day);
  const yest = new Date(Date.UTC(p.year, p.month - 1, p.day - 1, 12, 0, 0));
  const yestWd = yest.getUTCDay();

  let best = list[0];
  let bestSince = Infinity;
  for (const s of list) {
    if (shiftRunsOnWeekday(s, todayWd)) {
      const since = nowMins - minutesOfHhMm(s.opensAt);
      if (since >= 0 && since < bestSince) {
        bestSince = since;
        best = s;
      }
    }
    if (shiftRunsOnWeekday(s, yestWd)) {
      const since = nowMins + 24 * 60 - minutesOfHhMm(s.opensAt);
      if (since < bestSince) {
        bestSince = since;
        best = s;
      }
    }
  }
  if (bestSince === Infinity) {
    return shiftsOnWeekday(list, todayWd)[0] ?? list[0];
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
  const weekday = weekdayFromIsoDate(businessDate) ?? 1;
  const next = nextShiftOf(shift, shifts, weekday);
  const daysAhead = daysUntilNextShift(shift, shifts, weekday);
  let untilDate = businessDate;
  for (let i = 0; i < daysAhead; i++) untilDate = nextCalendarDate(untilDate);
  const [, month, day] = untilDate.split('-');
  return `Hasta las ${next.opensAt} del ${Number(day)}/${Number(month)}`;
}
