import { htmlPdfBlob, escapePdfHtml } from '../../shared/pdf/html-pdf';
import { pdfFileSlug } from '../../shared/pdf/pdf-text';
import { closingSharePayload } from '../../shared/components/record-share-builders';
import { formatDateAr, formatMoneyAr, sharePdf, type SharePdfResult } from '../../shared/utils/share-text';
import type { CashClosing } from './closings-api.service';

export type ClosingPdfOpts = {
  unitsLabel?: string | null;
};

function money(value: number | null | undefined): string {
  return formatMoneyAr(value);
}

function row(label: string, value: string, tone = ''): string {
  return `<tr class="${tone}"><th>${escapePdfHtml(label)}</th><td class="num">${escapePdfHtml(value)}</td></tr>`;
}

function moneyRow(label: string, value: number | null | undefined, always = false): string {
  const n = Number(value || 0);
  if (!always && Math.abs(n) < 0.005) return '';
  const tone = n < -0.004 ? 'neg' : '';
  return row(label, money(n), tone);
}

function listBlock(
  title: string,
  items: Array<{ label: string; amount: number }>,
): string {
  const rows = items.filter((x) => Math.abs(Number(x.amount || 0)) > 0.004);
  if (!rows.length) return '';
  return `
    <section class="block">
      <h2>${escapePdfHtml(title)}</h2>
      <table class="tbl">
        <tbody>
          ${rows.map((x) => row(x.label, money(x.amount))).join('')}
        </tbody>
      </table>
    </section>
  `;
}

function pdfStyles(): string {
  return `
    <style>
      .closing-pdf {
        box-sizing: border-box;
        width: 100%;
        padding: 14px 18px 16px;
        background: #fff;
        color: #1b2a33;
        font: 12px/1.3 Figtree, Segoe UI, sans-serif;
      }
      .closing-pdf * { box-sizing: border-box; }
      .kicker {
        margin: 0;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #5f6f76;
      }
      h1 {
        margin: 2px 0 0;
        font: 700 20px Figtree, sans-serif;
        color: #003366;
      }
      .meta { margin: 2px 0 8px; color: #5f6f76; font-size: 11px; }
      .kpis {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .kpi {
        border: 1px solid #d7e0d9;
        border-radius: 8px;
        padding: 8px 10px;
        background: #f8faf9;
      }
      .kpi span { display: block; font-size: 10px; color: #5f6f76; text-transform: uppercase; letter-spacing: 0.04em; }
      .kpi strong { display: block; margin-top: 2px; font-size: 15px; font-weight: 700; color: #003366; }
      .kpi.ok { background: #eef7ef; border-color: #b7d7bb; }
      .kpi.ok strong { color: #1b6e2a; }
      .kpi.warn { background: #fdf2f1; border-color: #f0c2bd; }
      .kpi.warn strong { color: #b42318; }
      .cols {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 10px;
        align-items: start;
      }
      .block { margin: 10px 0 0; }
      .cols .block { margin: 0; }
      .block h2 {
        margin: 0 0 4px;
        font: 700 12px Figtree, sans-serif;
        color: #003366;
      }
      .tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
      .tbl th {
        text-align: left;
        font-weight: 500;
        color: #5f6f76;
        padding: 3px 4px;
        border-bottom: 1px solid #e4ece6;
      }
      .tbl td {
        padding: 3px 4px;
        border-bottom: 1px solid #e4ece6;
      }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; color: #003366; }
      .neg .num { color: #b42318; }
      .note {
        margin: 10px 0 0;
        padding: 8px 10px;
        background: #eef3f0;
        border-left: 3px solid #003366;
        font-size: 11px;
      }
    </style>
  `;
}

export function closingPdfFilename(shopName: string, closing: CashClosing): string {
  const date = String(closing.businessDate || '').slice(0, 10) || 'cierre';
  const event = String(closing.eventName ?? '').trim();
  const base = event
    ? `cierre-evento-${pdfFileSlug(event)}-${date}`
    : `cierre-${pdfFileSlug(shopName)}-${date}`;
  return `${base}.pdf`;
}

export function closingPdfHtml(
  closing: CashClosing,
  shopName: string,
  opts?: ClosingPdfOpts,
): string {
  const date = formatDateAr(closing.businessDate);
  const isEvent = String(closing.kind ?? '') === 'EVENT';
  const eventName = String(closing.eventName ?? '').trim();
  const shift = String(closing.shiftName ?? '').trim();
  const kicker = isEvent ? 'Cierre de evento' : 'Cierre de caja';
  const metaParts = [date, shift, eventName].filter(Boolean);
  const declared = Number(closing.declaredTotal || 0);
  const pos = Number(closing.posSystemAmount || 0);
  const diff = Number(closing.difference ?? pos - declared);
  const aside = (closing.sourceAmounts ?? [])
    .filter((s) => !s.includeInDeclared && Math.abs(Number(s.amount || 0)) > 0.004);
  const asideSum = aside.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const diffTone = Math.abs(diff) < 0.005 ? 'ok' : 'warn';

  const cobros = (closing.extraLines ?? []).filter(
    (e) => e.type === 'OTHER' && Math.abs(Number(e.amount || 0)) > 0.004,
  );
  const channels = [
    moneyRow('PVS', closing.cardAmount, true),
    moneyRow('Efectivo', closing.cashAmount, true),
    moneyRow('Mercado Pago', closing.mercadoPagoAmount),
    moneyRow('Cuenta DNI', closing.accountDniAmount, true),
    cobros.length
      ? cobros.map((e) => moneyRow(String(e.label || '').trim() || 'Cobro', e.amount, true)).join('')
      : [
          moneyRow('Delivery', closing.deliveryAppsAmount),
          moneyRow('Transferencia', closing.transferAmount),
          moneyRow('Otros', closing.otherAmount),
        ].join(''),
    ...(closing.sourceAmounts ?? [])
      .filter((s) => s.includeInDeclared)
      .map((s) => moneyRow(String(s.name || '').trim() || 'Fuente', s.amount)),
    row('Total declarado', money(declared)),
    asideSum > 0.004 ? row('Total del día', money(declared + asideSum)) : '',
  ].join('');

  const cash = [
    moneyRow('Apertura', closing.cashOpeningAmount),
    moneyRow('A retirar', closing.cashWithdrawn),
    moneyRow('Se deja en caja', closing.cashLeftInRegister),
    closing.cashWithdrawnByName
      ? row('Quién se lo lleva', String(closing.cashWithdrawnByName))
      : '',
    opts?.unitsLabel && closing.unitsSold != null
      ? row(String(opts.unitsLabel), String(closing.unitsSold))
      : '',
    closing.coversCount != null && Number(closing.coversCount) > 0
      ? row('Cubiertos', String(closing.coversCount))
      : '',
  ].join('');

  const posnets = listBlock(
    'Posnets',
    (closing.posnetAmounts ?? []).map((p) => ({
      label: String(p.name || '').trim() || 'Posnet',
      amount: Number(p.amount || 0),
    })),
  );
  const expenses = listBlock(
    'Egresos',
    (closing.expenses ?? []).map((e) => ({
      label: String(e.label || '').trim() || 'Egreso',
      amount: Number(e.amount || 0),
    })),
  );
  const asideBlock = listBlock(
    'Cuentas aparte',
    aside.map((s) => ({
      label: String(s.name || '').trim() || 'Fuente',
      amount: Number(s.amount || 0),
    })),
  );
  const notes = [
    closing.differenceReason?.trim()
      ? `<p class="note"><strong>Motivo diferencia.</strong> ${escapePdfHtml(closing.differenceReason.trim())}</p>`
      : '',
    closing.notes?.trim()
      ? `<p class="note"><strong>Notas.</strong> ${escapePdfHtml(closing.notes.trim())}</p>`
      : '',
  ].join('');

  return `
    <div class="closing-pdf">
      ${pdfStyles()}
      <p class="kicker">${escapePdfHtml(kicker)}</p>
      <h1>${escapePdfHtml(shopName)}</h1>
      <p class="meta">${escapePdfHtml(metaParts.join(' · '))}</p>
      <div class="kpis">
        <div class="kpi"><span>Caja sistema</span><strong>${escapePdfHtml(money(pos))}</strong></div>
        <div class="kpi"><span>Declarado</span><strong>${escapePdfHtml(money(declared))}</strong></div>
        <div class="kpi ${diffTone}"><span>Diferencia</span><strong>${escapePdfHtml(money(diff))}</strong></div>
      </div>
      <div class="cols">
        <section class="block">
          <h2>Cobros</h2>
          <table class="tbl"><tbody>${channels}</tbody></table>
        </section>
        <section class="block">
          <h2>Efectivo</h2>
          <table class="tbl"><tbody>${cash || row('—', '—')}</tbody></table>
        </section>
      </div>
      ${posnets}
      ${expenses}
      ${asideBlock}
      ${notes}
    </div>
  `;
}

export async function closingPdfBytes(
  closing: CashClosing,
  shopName: string,
  opts?: ClosingPdfOpts,
): Promise<Uint8Array> {
  const blob = await htmlPdfBlob({
    html: closingPdfHtml(closing, shopName, opts),
    widthPx: 760,
    singlePage: true,
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function shareClosingPdf(
  closing: CashClosing,
  shopName: string,
  opts?: ClosingPdfOpts,
): Promise<SharePdfResult> {
  const payload = closingSharePayload(closing, shopName, { unitsLabel: opts?.unitsLabel });
  const bytes = await closingPdfBytes(closing, shopName, opts);
  return sharePdf({
    title: payload.title,
    text: payload.text,
    filename: closingPdfFilename(shopName, closing),
    bytes,
  });
}

export function shareClosingSnack(result: SharePdfResult): string | null {
  if (result === 'copied') return 'Resumen copiado al portapapeles';
  if (result === 'downloaded') return 'PDF descargado. El texto quedó copiado para el grupo.';
  if (result === 'failed') return 'No se pudo compartir';
  return null;
}
