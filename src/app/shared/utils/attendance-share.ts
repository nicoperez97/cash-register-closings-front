export type AttendanceShareEmployee = {
  fullName: string;
  present: boolean;
  /** Horas (asistencia producción). */
  hours?: number;
  holiday?: boolean;
};

/** Texto listo para WhatsApp / Web Share del presentismo del día. */
export function attendanceDaySharePayload(opts: {
  shopName: string;
  dateLabel: string;
  kind?: 'servicio' | 'produccion';
  employees: AttendanceShareEmployee[];
}): { title: string; text: string } {
  const kind = opts.kind ?? 'servicio';
  const label = kindLabel(kind);
  const title = `${label} · ${opts.shopName}`;
  const lines = [
    `${label} — ${opts.shopName}`,
    `Fecha: ${opts.dateLabel}`,
    '',
    ...dayBody(opts.employees, kind),
  ];
  return { title, text: lines.join('\n') };
}

/** Varios días: encabezado con rango y un bloque por fecha. */
export function attendanceRangeSharePayload(opts: {
  shopName: string;
  fromLabel: string;
  toLabel: string;
  kind?: 'servicio' | 'produccion';
  days: Array<{ dateLabel: string; employees: AttendanceShareEmployee[] }>;
}): { title: string; text: string } {
  const kind = opts.kind ?? 'servicio';
  if (opts.days.length === 1) {
    return attendanceDaySharePayload({
      shopName: opts.shopName,
      dateLabel: opts.days[0].dateLabel,
      kind,
      employees: opts.days[0].employees,
    });
  }
  const label = kindLabel(kind);
  const title = `${label} · ${opts.shopName}`;
  const lines: string[] = [
    `${label} — ${opts.shopName}`,
    `Del ${opts.fromLabel} al ${opts.toLabel}`,
  ];
  for (const day of opts.days) {
    lines.push('', `— ${day.dateLabel} —`, ...dayBody(day.employees, kind));
  }
  return { title, text: lines.join('\n') };
}

export function isoDatesInRange(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const cur = parseIsoLocal(fromIso);
  const end = parseIsoLocal(toIso);
  if (!cur || !end) return out;
  while (cur.getTime() <= end.getTime()) {
    out.push(toIsoLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function monthKeysInRange(fromIso: string, toIso: string): Array<{ year: number; month: number }> {
  const keys: Array<{ year: number; month: number }> = [];
  const seen = new Set<string>();
  for (const iso of isoDatesInRange(fromIso, toIso)) {
    const [y, m] = iso.split('-').map(Number);
    const key = `${y}-${m}`;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push({ year: y, month: m });
  }
  return keys;
}

export function formatIsoShareLabel(iso: string): string {
  const d = parseIsoLocal(iso);
  if (!d) return iso;
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function kindLabel(kind: 'servicio' | 'produccion'): string {
  return kind === 'produccion' ? 'Presentismo producción' : 'Presentismo';
}

function dayBody(
  employees: AttendanceShareEmployee[],
  kind: 'servicio' | 'produccion',
): string[] {
  const present = employees.filter((e) => e.present);
  const holiday = employees.filter((e) => !e.present && e.holiday);
  const absent = employees.filter((e) => !e.present && !e.holiday);
  const lines: string[] = [`Presentes (${present.length}):`];
  if (present.length) {
    for (const e of present) {
      const hours =
        kind === 'produccion' && e.hours != null && e.hours > 0
          ? ` — ${formatHours(e.hours)} h`
          : '';
      lines.push(`✓ ${e.fullName}${hours}`);
    }
  } else {
    lines.push('—');
  }
  if (holiday.length) {
    lines.push('', `Licencia / feriado (${holiday.length}):`);
    for (const e of holiday) lines.push(`◇ ${e.fullName}`);
  }
  lines.push('', `Ausentes (${absent.length}):`);
  if (absent.length) {
    for (const e of absent) lines.push(`○ ${e.fullName}`);
  } else {
    lines.push('—');
  }
  return lines;
}

function parseIsoLocal(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHours(h: number): string {
  const n = Number(h) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
