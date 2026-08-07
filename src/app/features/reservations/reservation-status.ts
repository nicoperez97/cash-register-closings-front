/** Estados que cuentan para capacidad / totales (alineado con la API). */
export function isActiveReservationStatus(status: string | undefined | null): boolean {
  return status === 'CONFIRMED' || status === 'SEATED' || status == null || status === '';
}
