/**
 * Ticket promedio por persona (comensal): total ÷ comensales, redondeado a centavos.
 * null cuando no hay comensales o no hay monto (no se muestra).
 */
export function ticketPerCover(
  total: number | string | null | undefined,
  covers: number | string | null | undefined,
): number | null {
  const c = Math.floor(Number(covers) || 0);
  const t = Number(total) || 0;
  if (c <= 0 || t <= 0) return null;
  return Math.round((t / c) * 100) / 100;
}
