export type AnalyticsShopContext = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
};

export type AnalyticsUserContext = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

/** Params libres enviados a GA (strings/números/booleanos). */
export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export const AnalyticsEvents = {
  loginSuccess: 'login_success',
  logout: 'logout',
  shopSelected: 'shop_selected',
  closingCreated: 'closing_created',
  closingSubmitted: 'closing_submitted',
  closingLocked: 'closing_locked',
  expenseCreated: 'expense_created',
  incomeCreated: 'income_created',
  transferCreated: 'transfer_created',
  dividendSent: 'dividend_sent',
  paymentCreated: 'payment_created',
  paymentValidated: 'payment_validated',
  paymentPaid: 'payment_paid',
  paymentRejected: 'payment_rejected',
  equalizeApplied: 'equalize_applied',
  surplusToDividends: 'surplus_to_dividends',
  balancedToDividends: 'balanced_to_dividends',
  exportDownloaded: 'export_downloaded',
  helpOpened: 'help_opened',
  publicBoardViewed: 'public_board_viewed',
  menuViewed: 'menu_viewed',
  serviceRulesViewed: 'service_rules_viewed',
  miReservaViewed: 'mi_reserva_viewed',
  publicReservationSubmit: 'public_reservation_submit',
  publicReservationSubmitError: 'public_reservation_submit_error',
  publicReservationLookup: 'public_reservation_lookup',
  waitingListJoined: 'waiting_list_joined',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export function partySizeBucket(size: number): string {
  const n = Math.max(0, Math.floor(Number(size) || 0));
  if (n <= 1) return '1';
  if (n <= 4) return '2-4';
  if (n <= 8) return '5-8';
  return '9+';
}

export function weekdayShort(isoDate: string): string {
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { weekday: 'short' });
}

export function isWeekendIso(isoDate: string): boolean {
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function hourBucket(time: string | null | undefined): string {
  const raw = String(time ?? '').trim();
  const m = raw.match(/^(\d{1,2})/);
  if (!m) return '';
  const h = Number(m[1]);
  if (!Number.isFinite(h)) return '';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}
