export interface WeekDayChip {
  iso: string;
  label: string;
  dayNum: number;
  guests: number;
  isToday: boolean;
  isSelected: boolean;
}

export interface CalendarCell {
  iso: string | null;
  dayNum: number | null;
  guests: number;
  isToday: boolean;
  isSelected: boolean;
}

export function toDateInput(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function toDateString(value: Date | null): string {
  const d = value ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toTimeString(value: Date | null): string | undefined {
  if (!value || Number.isNaN(value.getTime())) return undefined;
  const h = String(value.getHours()).padStart(2, '0');
  const m = String(value.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function addDaysIso(iso: string, delta: number): string {
  const d = toDateInput(iso);
  d.setDate(d.getDate() + delta);
  return toDateString(d);
}

export function startOfWeekIso(iso: string): string {
  const d = toDateInput(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateString(d);
}

export function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function buildWeekDays(
  businessDate: string,
  todayIso: string,
  summary: Record<string, { guests?: number }>,
): WeekDayChip[] {
  const start = startOfWeekIso(businessDate);
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(start, i);
    const d = toDateInput(iso);
    return {
      iso,
      label: d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
      dayNum: d.getDate(),
      guests: summary[iso]?.guests ?? 0,
      isToday: iso === todayIso,
      isSelected: iso === businessDate,
    };
  });
}

export function buildCalendarCells(
  calendarMonth: string,
  businessDate: string,
  todayIso: string,
  summary: Record<string, { guests?: number }>,
): CalendarCell[] {
  const [y, m] = calendarMonth.split('-').map(Number);
  const monthIndex = m - 1;
  const first = new Date(y, monthIndex, 1);
  const jsDay = first.getDay();
  const offset = jsDay === 0 ? 6 : jsDay - 1;
  const totalDays = daysInMonth(y, monthIndex);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < offset; i++) {
    cells.push({
      iso: null,
      dayNum: null,
      guests: 0,
      isToday: false,
      isSelected: false,
    });
  }

  for (let day = 1; day <= totalDays; day++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const s = summary[iso];
    cells.push({
      iso,
      dayNum: day,
      guests: s?.guests ?? 0,
      isToday: iso === todayIso,
      isSelected: iso === businessDate,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      iso: null,
      dayNum: null,
      guests: 0,
      isToday: false,
      isSelected: false,
    });
  }

  return cells;
}
