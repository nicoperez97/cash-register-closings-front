export type WaiterCapProfile = {
  allowSendOrder: boolean;
  allowPrintKitchen: boolean;
  defaultPrintKitchen: boolean;
  lockPrintKitchen: boolean;
  allowPrintCustomerTicket: boolean;
  defaultPrintCustomerTicket: boolean;
  lockPrintCustomerTicket: boolean;
  allowEditTicket: boolean;
  allowRemoveTicketLines: boolean;
  allowTicketDiscount: boolean;
  allowCloseTable: boolean;
  requireTicketBeforeClose: boolean;
  allowTipOnClose: boolean;
  allowDiscardEmptySession: boolean;
  allowHistory: boolean;
  requireWaiterOnOpen: boolean;
};

export type WaiterCapabilities = {
  public: WaiterCapProfile;
  staff: WaiterCapProfile;
};

export const DEFAULT_WAITER_CAP_PUBLIC: WaiterCapProfile = {
  allowSendOrder: true,
  allowPrintKitchen: true,
  defaultPrintKitchen: true,
  lockPrintKitchen: false,
  allowPrintCustomerTicket: true,
  defaultPrintCustomerTicket: false,
  lockPrintCustomerTicket: false,
  allowEditTicket: true,
  allowRemoveTicketLines: true,
  allowTicketDiscount: true,
  allowCloseTable: true,
  requireTicketBeforeClose: true,
  allowTipOnClose: true,
  allowDiscardEmptySession: true,
  allowHistory: true,
  requireWaiterOnOpen: false,
};

export const DEFAULT_WAITER_CAP_STAFF: WaiterCapProfile = {
  ...DEFAULT_WAITER_CAP_PUBLIC,
  requireWaiterOnOpen: true,
};

function boolOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

export function normalizeWaiterCapProfile(
  raw: unknown,
  fallback: WaiterCapProfile,
): WaiterCapProfile {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const allowPrintKitchen = boolOr(r['allowPrintKitchen'], fallback.allowPrintKitchen);
  const allowPrintCustomerTicket = boolOr(
    r['allowPrintCustomerTicket'],
    fallback.allowPrintCustomerTicket,
  );
  return {
    allowSendOrder: boolOr(r['allowSendOrder'], fallback.allowSendOrder),
    allowPrintKitchen,
    defaultPrintKitchen: allowPrintKitchen
      ? boolOr(r['defaultPrintKitchen'], fallback.defaultPrintKitchen)
      : false,
    lockPrintKitchen: allowPrintKitchen
      ? boolOr(r['lockPrintKitchen'], fallback.lockPrintKitchen)
      : false,
    allowPrintCustomerTicket,
    defaultPrintCustomerTicket: allowPrintCustomerTicket
      ? boolOr(r['defaultPrintCustomerTicket'], fallback.defaultPrintCustomerTicket)
      : false,
    lockPrintCustomerTicket: allowPrintCustomerTicket
      ? boolOr(r['lockPrintCustomerTicket'], fallback.lockPrintCustomerTicket)
      : false,
    allowEditTicket: boolOr(r['allowEditTicket'], fallback.allowEditTicket),
    allowRemoveTicketLines: boolOr(
      r['allowRemoveTicketLines'],
      fallback.allowRemoveTicketLines,
    ),
    allowTicketDiscount: boolOr(r['allowTicketDiscount'], fallback.allowTicketDiscount),
    allowCloseTable: boolOr(r['allowCloseTable'], fallback.allowCloseTable),
    requireTicketBeforeClose: boolOr(
      r['requireTicketBeforeClose'],
      fallback.requireTicketBeforeClose,
    ),
    allowTipOnClose: boolOr(r['allowTipOnClose'], fallback.allowTipOnClose),
    allowDiscardEmptySession: boolOr(
      r['allowDiscardEmptySession'],
      fallback.allowDiscardEmptySession,
    ),
    allowHistory: boolOr(r['allowHistory'], fallback.allowHistory),
    requireWaiterOnOpen: boolOr(r['requireWaiterOnOpen'], fallback.requireWaiterOnOpen),
  };
}

export function normalizeWaiterCapabilities(raw: unknown): WaiterCapabilities {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    public: normalizeWaiterCapProfile(r['public'], DEFAULT_WAITER_CAP_PUBLIC),
    staff: normalizeWaiterCapProfile(r['staff'], DEFAULT_WAITER_CAP_STAFF),
  };
}

export const WAITER_CAP_FIELDS: Array<{
  key: keyof WaiterCapProfile;
  label: string;
  hint?: string;
  staffOnly?: boolean;
  showIf?: keyof WaiterCapProfile;
}> = [
  { key: 'allowSendOrder', label: 'Enviar comanda' },
  { key: 'allowPrintKitchen', label: 'Imprimir cocina' },
  {
    key: 'defaultPrintKitchen',
    label: 'Cocina tildada por defecto',
    showIf: 'allowPrintKitchen',
  },
  {
    key: 'lockPrintKitchen',
    label: 'Cocina fija (no se destilda)',
    showIf: 'allowPrintKitchen',
  },
  { key: 'allowPrintCustomerTicket', label: 'Imprimir ticket cliente' },
  {
    key: 'defaultPrintCustomerTicket',
    label: 'Ticket tildado por defecto',
    showIf: 'allowPrintCustomerTicket',
  },
  {
    key: 'lockPrintCustomerTicket',
    label: 'Ticket fijo (no se destilda)',
    showIf: 'allowPrintCustomerTicket',
  },
  { key: 'allowEditTicket', label: 'Modificar precio/cantidad del ticket' },
  { key: 'allowRemoveTicketLines', label: 'Quitar ítems del ticket' },
  { key: 'allowTicketDiscount', label: 'Descuento en ticket' },
  { key: 'allowCloseTable', label: 'Cerrar mesa' },
  {
    key: 'requireTicketBeforeClose',
    label: 'Exigir ticket antes de cerrar',
    showIf: 'allowCloseTable',
  },
  { key: 'allowTipOnClose', label: 'Propina al cerrar', showIf: 'allowCloseTable' },
  { key: 'allowDiscardEmptySession', label: 'Descartar mesa sin envíos' },
  { key: 'allowHistory', label: 'Ver historial del turno' },
  {
    key: 'requireWaiterOnOpen',
    label: 'Pedir mozo a cargo al abrir',
    hint: 'Solo aplica en Operación → Comanda',
    staffOnly: true,
  },
];
