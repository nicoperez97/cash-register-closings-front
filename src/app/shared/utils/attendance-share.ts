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
  const body = dayBody(opts.employees, kind);
  const lines = [
    `${label} — ${opts.shopName}`,
    `Fecha: ${opts.dateLabel}`,
    '',
    ...(body.length ? body : ['Sin presentes']),
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
  let any = false;
  for (const day of opts.days) {
    const body = dayBody(day.employees, kind);
    if (!body.length) continue;
    any = true;
    lines.push('', `— ${day.dateLabel} —`, ...body);
  }
  if (!any) lines.push('', 'Sin presentes');
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

export function formatIsoWeekday(iso: string): string {
  const d = parseIsoLocal(iso);
  if (!d) return iso;
  return d.toLocaleDateString('es-AR', { weekday: 'long' }).toLowerCase();
}

/** Share compacto de producción: solo días con horas, el productor y sus asignados. */
export function productionHoursSharePayload(opts: {
  shopName: string;
  fromIso: string;
  toIso: string;
  people: Array<{ name: string; hoursByDate: Record<string, number> }>;
}): { title: string; text: string } {
  const title = `Producción · ${opts.shopName}`;
  const lines: string[] = [`Producción — ${opts.shopName}`];
  if (opts.fromIso === opts.toIso) {
    lines.push(formatIsoShareLabel(opts.fromIso));
  } else {
    lines.push(`Del ${formatIsoShareLabel(opts.fromIso)} al ${formatIsoShareLabel(opts.toIso)}`);
  }
  lines.push('');
  const dates = isoDatesInRange(opts.fromIso, opts.toIso);
  let any = false;
  for (const iso of dates) {
    const bits: string[] = [];
    for (const person of opts.people) {
      const h = Number(person.hoursByDate[iso] ?? 0) || 0;
      if (h <= 0) continue;
      bits.push(`${firstName(person.name)} ${formatHours(h)}h`);
    }
    if (!bits.length) continue;
    any = true;
    lines.push(`${formatIsoWeekday(iso)}: ${bits.join(', ')}`);
  }
  if (!any) lines.push('', 'Sin horas en el período');
  return { title, text: lines.join('\n') };
}

function firstName(full: string): string {
  const n = String(full ?? '').trim();
  return n.split(/\s+/)[0] || n;
}

function kindLabel(kind: 'servicio' | 'produccion'): string {
  return kind === 'produccion' ? 'Presentismo producción' : 'Presentismo';
}

function dayBody(
  employees: AttendanceShareEmployee[],
  kind: 'servicio' | 'produccion',
): string[] {
  const present = employees.filter((e) => e.present);
  if (!present.length) return [];
  const lines: string[] = [];
  for (const e of present) {
    const hours =
      kind === 'produccion' && e.hours != null && e.hours > 0
        ? ` — ${formatHours(e.hours)} h`
        : '';
    lines.push(`✓ ${e.fullName}${hours}`);
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
