import { downloadHtmlPdf, escapePdfHtml } from '../../shared/pdf/html-pdf';
import type { PartnerSplitPreview, PartnerSplitRow } from './partner-splits-api.service';

export type PartnerSplitPdfMeta = {
  appliedAt?: string;
  appliedByName?: string | null;
};

function money(value: number): string {
  const n = Number(value || 0);
  const abs = Math.abs(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function moneyAbs(value: number): string {
  return money(Math.abs(Number(value || 0)));
}

function moneyHtml(value: number): string {
  const n = Number(value || 0);
  const cls = n < -0.004 ? 'neg' : n > 0.004 ? 'pos' : '';
  return `<span class="num ${cls}">${escapePdfHtml(money(n))}</span>`;
}

function formatWhen(raw?: string | Date): string {
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function hasMove(row: PartnerSplitRow): boolean {
  return (
    Math.abs(Number(row.current || 0)) > 0.004 ||
    Math.abs(Number(row.leaveAmount || 0)) > 0.004 ||
    Math.abs(Number(row.difference || 0)) > 0.004
  );
}

function actionCell(difference: number): string {
  const n = Number(difference || 0);
  if (Math.abs(n) < 0.005) return '<span class="muted">—</span>';
  if (n < 0) {
    return `<span class="act act-out">Pasa ${escapePdfHtml(moneyAbs(n))}</span>`;
  }
  return `<span class="act act-in">Recibe ${escapePdfHtml(money(n))}</span>`;
}

function leadText(preview: PartnerSplitPreview): string {
  const n = preview.partners.length;
  const share = money(preview.totals.share);
  const dist = Number(preview.totals.toDistribute || 0);
  if (!n) return 'No hay socios marcados para repartir.';
  if (dist < -0.004) {
    return `Faltante ${moneyAbs(dist)}. ${n} socios: cada uno queda con ${share} más lo dejado en su cuenta.`;
  }
  if (dist > 0.004) {
    return `A repartir ${money(dist)} entre ${n} socios. Cada uno queda con ${share} más lo dejado en su cuenta.`;
  }
  return `Sin monto a repartir. Cada socio queda con ${share}.`;
}

function accountRows(rows: PartnerSplitRow[]): string {
  return rows
    .map(
      (r) => `
        <tr>
          <td>${escapePdfHtml(r.name)}</td>
          <td class="num">${moneyHtml(r.current)}</td>
          <td class="num">${moneyHtml(r.leaveAmount ?? 0)}</td>
          <td class="num">${moneyHtml(r.target)}</td>
          <td>${actionCell(r.difference)}</td>
        </tr>
      `,
    )
    .join('');
}

function extrasBlock(preview: PartnerSplitPreview): string {
  const extras = preview.extras.filter((e) => e.label.trim() || Number(e.amount));
  if (!extras.length) return '';
  const rows = extras
    .map(
      (e) => `
        <tr>
          <td>${escapePdfHtml(e.label.trim() || 'Extra')}</td>
          <td class="num">${moneyHtml(e.amount)}</td>
        </tr>
      `,
    )
    .join('');
  return `
    <section class="block">
      <h2>Extras</h2>
      <table class="tbl">
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="num">Importe</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function transferBlock(preview: PartnerSplitPreview): string {
  if (!preview.transfers.length) {
    return `
      <section class="block">
        <h2>Pases</h2>
        <p class="hint">No hay pases: las cuentas ya están en el objetivo.</p>
      </section>
    `;
  }
  const rows = preview.transfers
    .map(
      (t) => `
        <tr>
          <td>${escapePdfHtml(t.fromName)}</td>
          <td class="arrow">→</td>
          <td>${escapePdfHtml(t.toName)}</td>
          <td class="num">${escapePdfHtml(money(t.amount))}</td>
        </tr>
      `,
    )
    .join('');
  const n = preview.transfers.length;
  return `
    <section class="block">
      <h2>Pases (${n})</h2>
      <table class="tbl">
        <thead>
          <tr>
            <th>Sale de</th>
            <th></th>
            <th>Entra a</th>
            <th class="num">Importe</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function kpi(label: string, value: number): string {
  return `
    <div class="kpi">
      <span>${escapePdfHtml(label)}</span>
      <strong>${moneyHtml(value)}</strong>
    </div>
  `;
}

export async function downloadPartnerSplitPdf(
  preview: PartnerSplitPreview,
  shopName: string,
  filename = 'division-socios.pdf',
  meta?: PartnerSplitPdfMeta,
): Promise<void> {
  const partnerCount = preview.partners.length;
  const when = meta?.appliedAt
    ? `Aplicada el ${formatWhen(meta.appliedAt)}`
    : `Armado al ${formatWhen()}`;
  const by = meta?.appliedByName?.trim() ? ` · ${meta.appliedByName.trim()}` : '';
  const channels = preview.channels.filter(hasMove);

  const html = `
    <div class="split-pdf">
      <style>
        .split-pdf {
          box-sizing: border-box;
          width: 100%;
          padding: 12px 16px 14px;
          background: #fff;
          color: #1b2a33;
          font: 11px/1.28 Figtree, Segoe UI, sans-serif;
        }
        .split-pdf * { box-sizing: border-box; }
        .kicker {
          margin: 0;
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #5f6f76;
        }
        h1 {
          margin: 1px 0 0;
          font: 700 16px Figtree, sans-serif;
          color: #003366;
        }
        .meta { margin: 0 0 6px; color: #5f6f76; font-size: 10px; }
        .lead {
          margin: 0;
          padding: 6px 8px;
          background: #eef3f0;
          border-left: 3px solid #003366;
          font-size: 11px;
          line-height: 1.3;
        }
        .kpis {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin: 8px 0 0;
        }
        .kpi {
          border: 1px solid #d7e0d9;
          border-radius: 6px;
          padding: 5px 8px;
          background: #f8faf9;
        }
        .kpi span { display: block; font-size: 9px; color: #5f6f76; }
        .kpi strong { display: block; margin-top: 1px; font-size: 11.5px; font-weight: 700; }
        .cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 8px;
          align-items: start;
        }
        .block { margin: 8px 0 0; }
        .cols .block { margin: 0; }
        .block h2 {
          margin: 0 0 3px;
          font: 700 11px Figtree, sans-serif;
          color: #003366;
        }
        .hint { margin: 0 0 4px; color: #5f6f76; font-size: 9.5px; }
        .tbl {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
        }
        .tbl th {
          text-align: left;
          font-size: 8.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #5f6f76;
          border-bottom: 1px solid #003366;
          padding: 3px 4px;
        }
        .tbl td {
          padding: 2px 4px;
          border-bottom: 1px solid #e4ece6;
          vertical-align: middle;
        }
        .tbl tbody tr:nth-child(even) { background: #f6f8f7; }
        .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .neg { color: #b42318; }
        .pos { color: #1b6e2a; }
        .muted { color: #5f6f76; }
        .act { font-weight: 700; white-space: nowrap; }
        .act-out { color: #b42318; }
        .act-in { color: #1b6e2a; }
        .arrow { width: 16px; text-align: center; color: #5f6f76; }
      </style>
      <p class="kicker">División de socios</p>
      <h1>${escapePdfHtml(shopName)}</h1>
      <p class="meta">${escapePdfHtml(when)}${escapePdfHtml(by)} · ${partnerCount} ${
        partnerCount === 1 ? 'socio' : 'socios'
      }</p>
      <p class="lead">${escapePdfHtml(leadText(preview))}</p>
      <div class="kpis">
        ${kpi('Total saldos', preview.totals.balances)}
        ${kpi('Reservado', preview.totals.reserves)}
        ${kpi('Extras', preview.totals.extras)}
        ${kpi('A repartir', preview.totals.toDistribute)}
      </div>
      <div class="cols">
        <section class="block">
          <h2>Socios</h2>
          <table class="tbl">
            <thead>
              <tr>
                <th>Socio</th>
                <th class="num">Saldo</th>
                <th class="num">Deja</th>
                <th class="num">Queda</th>
                <th>Hace</th>
              </tr>
            </thead>
            <tbody>${accountRows(preview.partners) || '<tr><td colspan="5">Sin socios</td></tr>'}</tbody>
          </table>
        </section>
        <section class="block">
          <h2>Canales${channels.length !== preview.channels.length ? ' (con movimiento)' : ''}</h2>
          <table class="tbl">
            <thead>
              <tr>
                <th>Canal</th>
                <th class="num">Saldo</th>
                <th class="num">Deja</th>
                <th class="num">Queda</th>
                <th>Hace</th>
              </tr>
            </thead>
            <tbody>${
              accountRows(channels) || '<tr><td colspan="5">Sin canales con movimiento</td></tr>'
            }</tbody>
          </table>
        </section>
      </div>
      ${extrasBlock(preview)}
      ${transferBlock(preview)}
    </div>
  `;

  await downloadHtmlPdf({ filename, html, widthPx: 780, singlePage: true });
}
