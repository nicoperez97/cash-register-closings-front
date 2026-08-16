/** Estados que cuentan para capacidad / totales (alineado con la API). */
export function isActiveReservationStatus(status: string | undefined | null): boolean {
  return (
    status === 'CONFIRMED' ||
    status === 'MARKED' ||
    status === 'SEATED' ||
    status == null ||
    status === ''
  );
}

export function nextPublicReservationStatus(
  status: string | undefined | null,
): 'CONFIRMED' | 'MARKED' | 'SEATED' {
  if (status === 'CONFIRMED' || !status) return 'MARKED';
  if (status === 'MARKED') return 'SEATED';
  return 'CONFIRMED';
}
