import { closingSharePayload } from '../../shared/components/record-share-builders';
import { shareText } from '../../shared/utils/share-text';
import type { CashClosing } from './closings-api.service';

export type ClosingShareOpts = {
  unitsLabel?: string | null;
};

/** @deprecated Usar ClosingShareOpts */
export type ClosingPdfOpts = ClosingShareOpts;

export async function shareClosingText(
  closing: CashClosing,
  shopName: string,
  opts?: ClosingShareOpts,
): Promise<'shared' | 'copied' | 'aborted' | 'failed'> {
  const payload = closingSharePayload(closing, shopName, { unitsLabel: opts?.unitsLabel });
  return shareText({
    title: payload.title,
    text: payload.text,
  });
}

export function shareClosingSnack(
  result: 'shared' | 'copied' | 'aborted' | 'failed' | 'downloaded',
): string | null {
  if (result === 'copied') return 'Texto del cierre copiado. Pegalo en el grupo.';
  if (result === 'shared') return null;
  if (result === 'failed') return 'No se pudo copiar el texto';
  return null;
}
