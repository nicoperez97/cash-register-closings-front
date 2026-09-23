import { escapePdfHtml } from './html-pdf';

const PALETTE = [
  '#1d65a0',
  '#2e7d32',
  '#f27d16',
  '#6a4c93',
  '#c62828',
  '#00838f',
  '#ef6c00',
  '#455a64',
  '#ad1457',
  '#558b2f',
];

export type PdfDonutItem = { label: string; value: number };

/** HTML de donut + leyenda para embeber en PDFs de tabla. */
export function buildPdfDonutHtml(opts: {
  title: string;
  subtitle?: string;
  items: PdfDonutItem[];
  maxSlices?: number;
}): string {
  const maxSlices = opts.maxSlices ?? 8;
  const cleaned = opts.items
    .map((it) => ({
      label: String(it.label || 'Sin rubro').trim() || 'Sin rubro',
      value: Math.max(0, Number(it.value) || 0),
    }))
    .filter((it) => it.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!cleaned.length) return '';

  let slices = cleaned;
  if (cleaned.length > maxSlices) {
    const head = cleaned.slice(0, maxSlices - 1);
    const rest = cleaned.slice(maxSlices - 1);
    const otherVal = rest.reduce((s, x) => s + x.value, 0);
    slices = [...head, { label: 'Otros', value: otherVal }];
  }

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return '';

  const circumference = 2 * Math.PI * 40;
  let offset = 0;
  const circles = slices
    .map((it, i) => {
      const len = (it.value / total) * circumference;
      const dash = `${len} ${circumference - len}`;
      const circle = `<circle cx="60" cy="60" r="40" fill="transparent" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="18" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)" />`;
      offset += len;
      return circle;
    })
    .join('');

  const legend = slices
    .map((it, i) => {
      const pct = ((it.value / total) * 100).toLocaleString('es-AR', {
        maximumFractionDigits: 1,
      });
      return `<li style="display:flex;align-items:center;gap:6px;margin:0 0 4px;font-size:11px;line-height:1.25">
        <span style="width:10px;height:10px;border-radius:2px;background:${PALETTE[i % PALETTE.length]};flex:0 0 auto"></span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapePdfHtml(it.label)}</span>
        <span style="color:#556;flex:0 0 auto">${pct}%</span>
      </li>`;
    })
    .join('');

  const totalLabel = total.toLocaleString('es-AR', { maximumFractionDigits: 0 });

  return `
    <section style="margin:0 0 14px;padding:12px 14px;border:1px solid #d7e0d9;border-radius:10px;background:#fff">
      <h2 style="margin:0;font:650 13px Figtree,sans-serif">${escapePdfHtml(opts.title)}</h2>
      ${
        opts.subtitle
          ? `<p style="margin:2px 0 10px;color:#556;font-size:11px">${escapePdfHtml(opts.subtitle)}</p>`
          : '<div style="height:8px"></div>'
      }
      <div style="display:grid;grid-template-columns:160px 1fr;gap:14px;align-items:center">
        <svg viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
          ${circles}
          <circle cx="60" cy="60" r="28" fill="#fff" />
          <text x="60" y="56" text-anchor="middle" style="font-size:7px;fill:#5f6f76">Total</text>
          <text x="60" y="70" text-anchor="middle" style="font-size:9px;font-weight:700;fill:#1a1f1c">${escapePdfHtml(totalLabel)}</text>
        </svg>
        <ul style="list-style:none;margin:0;padding:0">${legend}</ul>
      </div>
    </section>
  `;
}
