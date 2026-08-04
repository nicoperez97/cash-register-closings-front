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
  const label =
    kind === 'produccion' ? 'Presentismo producción' : 'Presentismo';
  const title = `${label} · ${opts.shopName}`;

  const present = opts.employees.filter((e) => e.present);
  const holiday = opts.employees.filter((e) => !e.present && e.holiday);
  const absent = opts.employees.filter((e) => !e.present && !e.holiday);

  const lines: string[] = [
    `${label} — ${opts.shopName}`,
    `Fecha: ${opts.dateLabel}`,
    '',
    `Presentes (${present.length}):`,
  ];

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

  return { title, text: lines.join('\n') };
}

function formatHours(h: number): string {
  const n = Number(h) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
