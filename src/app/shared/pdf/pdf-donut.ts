import type { jsPDF } from 'jspdf';
import { pdfWinAnsi } from './pdf-text';

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

export type PdfDonutChart = {
  title: string;
  subtitle?: string;
  items: PdfDonutItem[];
  maxSlices?: number;
};

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return [29, 101, 160];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function prepareSlices(items: PdfDonutItem[], maxSlices: number) {
  const cleaned = items
    .map((it) => ({
      label: String(it.label || 'Sin rubro').trim() || 'Sin rubro',
      value: Math.max(0, Number(it.value) || 0),
    }))
    .filter((it) => it.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!cleaned.length) return [] as Array<{ label: string; value: number; color: string }>;

  let slices = cleaned;
  if (cleaned.length > maxSlices) {
    const head = cleaned.slice(0, maxSlices - 1);
    const rest = cleaned.slice(maxSlices - 1);
    const otherVal = rest.reduce((s, x) => s + x.value, 0);
    slices = [...head, { label: 'Otros', value: otherVal }];
  }

  return slices.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
}

/** Rellena una porción como un solo path cerrado (sin costuras entre triángulos). */
function fillWedge(
  pdf: jsPDF,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): void {
  const sweep = a1 - a0;
  if (Math.abs(sweep) < 1e-6) return;
  const steps = Math.max(16, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 72));
  pdf.moveTo(cx, cy);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps;
    pdf.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  pdf.close();
  pdf.fill();
}

/** HTML legacy (por si algún caller aún lo usa). Preferí `drawPdfDonut`. */
export function buildPdfDonutHtml(opts: PdfDonutChart): string {
  const slices = prepareSlices(opts.items, opts.maxSlices ?? 8);
  if (!slices.length) return '';
  const total = slices.reduce((s, x) => s + x.value, 0);
  const circumference = 2 * Math.PI * 40;
  let offset = 0;
  const circles = slices
    .map((it) => {
      const len = (it.value / total) * circumference;
      const dash = `${len} ${circumference - len}`;
      const circle = `<circle cx="60" cy="60" r="40" fill="transparent" stroke="${it.color}" stroke-width="18" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)" />`;
      offset += len;
      return circle;
    })
    .join('');
  const legend = slices
    .map((it) => {
      const pct = ((it.value / total) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 });
      return `<li style="display:flex;gap:6px;margin:0 0 4px;font-size:11px">
        <span style="width:10px;height:10px;background:${it.color}"></span>
        <span>${it.label}</span><span>${pct}%</span></li>`;
    })
    .join('');
  return `<section>${opts.title}${circles}${legend}</section>`;
}

/**
 * Dibuja torta + leyenda en el PDF (vectorial). Devuelve el Y siguiente.
 * No usa captura HTML: evita gráficos en blanco.
 */
export function drawPdfDonut(
  pdf: jsPDF,
  opts: PdfDonutChart & { x: number; y: number; maxWidth: number },
): number {
  const slices = prepareSlices(opts.items, opts.maxSlices ?? 8);
  if (!slices.length) return opts.y;

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return opts.y;

  let y = opts.y;
  const x = opts.x;
  const maxW = opts.maxWidth;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(26, 31, 28);
  pdf.text(pdfWinAnsi(opts.title), x, y);
  y += 13;

  if (opts.subtitle?.trim()) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(85, 102, 110);
    pdf.text(pdfWinAnsi(opts.subtitle), x, y);
    y += 14;
    pdf.setTextColor(26, 31, 28);
  }

  const boxTop = y + 2;
  const donutR = 52;
  const cx = x + donutR + 4;
  const cy = boxTop + donutR;
  const innerR = 30;

  // Solape mínimo entre porciones para que no queden hilos blancos al rasterizar.
  const seam = 0.004;
  let angle = -Math.PI / 2;
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const sweep = (slice.value / total) * Math.PI * 2;
    const [r, g, b] = hexToRgb(slice.color);
    pdf.setFillColor(r, g, b);
    const a1 = angle + sweep + (i < slices.length - 1 ? seam : 0);
    fillWedge(pdf, cx, cy, donutR, angle, a1);
    angle += sweep;
  }

  // Hueco central + borde suave
  pdf.setFillColor(255, 255, 255);
  pdf.circle(cx, cy, innerR, 'F');
  pdf.setDrawColor(230, 236, 232);
  pdf.setLineWidth(0.6);
  pdf.circle(cx, cy, donutR, 'S');
  pdf.circle(cx, cy, innerR, 'S');

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(95, 111, 118);
  pdf.text('Total', cx, cy - 4, { align: 'center' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(26, 31, 28);
  const totalLabel = total.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  pdf.text(pdfWinAnsi(totalLabel), cx, cy + 8, { align: 'center' });

  // Leyenda compacta a la derecha (etiqueta + % juntos).
  const legendX = cx + donutR + 22;
  const labelMaxW = 160;
  const rowH = 16;
  const legendBlockH = slices.length * rowH;
  let legendY = cy - legendBlockH / 2 + 10;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  let maxLabelW = 0;
  for (const slice of slices) {
    const w = pdf.getTextWidth(pdfWinAnsi(slice.label));
    if (w > maxLabelW) maxLabelW = w;
  }
  maxLabelW = Math.min(maxLabelW, labelMaxW);
  const pctX = legendX + 14 + maxLabelW + 10;

  for (const slice of slices) {
    const [r, g, b] = hexToRgb(slice.color);
    pdf.setFillColor(r, g, b);
    pdf.roundedRect(legendX, legendY - 7, 9, 9, 1.5, 1.5, 'F');

    const pct = ((slice.value / total) * 100).toLocaleString('es-AR', {
      maximumFractionDigits: 1,
    });
    const label = pdfWinAnsi(slice.label);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(26, 31, 28);
    const lines = pdf.splitTextToSize(label, labelMaxW);
    pdf.text(lines, legendX + 14, legendY);
    pdf.setTextColor(85, 102, 110);
    pdf.text(`${pct}%`, pctX, legendY);
    legendY += Math.max(rowH, lines.length * 11 + 4);
  }

  const donutBottom = cy + donutR + 10;
  const legendBottom = legendY + 2;
  return Math.max(donutBottom, legendBottom) + 10;
}
