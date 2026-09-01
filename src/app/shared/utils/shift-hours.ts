/** Horarios de servicio (HH:mm) — espejo liviano del util del API. */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHhMm(raw?: string | null): string | null {
  const s = String(raw ?? '').trim();
  const m = s.match(TIME_RE);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

export function minutesOf(hhmm: string): number {
  const parsed = parseHhMm(hhmm);
  if (!parsed) return 0;
  const [h, m] = parsed.split(':').map(Number);
  return h * 60 + m;
}

export function minutesOnShift(startHhmm: string, timeHhmm: string): number {
  const start = minutesOf(startHhmm);
  const t = minutesOf(timeHhmm);
  return t <= start ? t + 24 * 60 : t;
}

export function scheduledShiftHours(
  checkIn?: string | null,
  checkOut?: string | null,
  fallbackHours = 8,
): number {
  const start = parseHhMm(checkIn);
  const end = parseHhMm(checkOut);
  if (!start || !end) return fallbackHours > 0 ? fallbackHours : 8;
  const minutes = minutesOnShift(start, end) - minutesOf(start);
  if (minutes <= 0) return fallbackHours > 0 ? fallbackHours : 8;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatShiftHoursLabel(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} h` : `${rounded} h`;
}
