import {
  A4_H,
  A4_W,
  PDF_MARGIN,
  downloadPdfBytes,
  loadPdfLib,
  pdfAccent,
  pdfFileSlug,
  pdfWrapLines,
  toRgb,
} from './pdf-text';
import type { MenuPrintInput } from '../../features/menu/menu-print';

function priceOf(item: { price?: number | null; priceLabel?: string | null }): string {
  const label = String(item.priceLabel ?? '').trim();
  if (label) return label;
  if (item.price == null || !Number.isFinite(Number(item.price))) return '';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(item.price));
}

async function embedLogo(doc: {
  embedPng: (b: Uint8Array) => Promise<unknown>;
  embedJpg: (b: Uint8Array) => Promise<unknown>;
}, raw?: string | null) {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    try {
      return await doc.embedPng(buf);
    } catch {
      return await doc.embedJpg(buf);
    }
  } catch {
    return null;
  }
}

export async function downloadMenuPdf(input: MenuPrintInput): Promise<void> {
  const lib = await loadPdfLib();
  const doc = await lib.PDFDocument.create();
  const font = await doc.embedFont(lib.StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(lib.StandardFonts.TimesRomanBold);
  const accent = toRgb(lib, pdfAccent(input.accentColor));
  const ink = lib.rgb(0.1, 0.13, 0.11);
  const muted = lib.rgb(0.42, 0.46, 0.43);
  const contentW = A4_W - PDF_MARGIN * 2;
  const logo = await embedLogo(doc, input.logoUrl);

  let page = doc.addPage([A4_W, A4_H]);
  let y = A4_H - PDF_MARGIN;

  const ensure = (need: number) => {
    if (y - need >= PDF_MARGIN) return;
    page = doc.addPage([A4_W, A4_H]);
    y = A4_H - PDF_MARGIN;
  };

  const draw = (
    text: string,
    used: typeof font,
    size: number,
    color: ReturnType<typeof lib.rgb>,
    leading: number,
  ) => {
    for (const line of pdfWrapLines(text, used, size, contentW)) {
      ensure(leading);
      if (line) page.drawText(line, { x: PDF_MARGIN, y: y - size, size, font: used, color });
      y -= leading;
    }
  };

  if (logo) {
    const size = 48;
    page.drawImage(logo as never, {
      x: (A4_W - size) / 2,
      y: y - size,
      width: size,
      height: size,
    });
    y -= size + 12;
  }

  draw('CARTA', fontBold, 10, accent, 14);
  draw(input.shopName || 'Carta', fontBold, 22, ink, 26);
  const menuTitle = String(input.menuTitle ?? '').trim();
  if (menuTitle && menuTitle !== input.shopName) {
    draw(menuTitle, font, 13, muted, 18);
  }
  const ig = String(input.instagramHandle ?? '').trim().replace(/^@+/, '');
  const phone = String(input.phone ?? '').trim();
  const contact = [ig ? `@${ig}` : '', phone].filter(Boolean).join('  ·  ');
  if (contact) draw(contact, font, 11, muted, 16);
  y -= 6;
  page.drawLine({
    start: { x: PDF_MARGIN, y },
    end: { x: A4_W - PDF_MARGIN, y },
    thickness: 1.5,
    color: accent,
  });
  y -= 18;

  const sections = (input.sections ?? [])
    .map((s) => ({
      name: String(s.name ?? '').trim() || 'Carta',
      items: (s.items ?? []).filter((it) => String(it.name ?? '').trim()),
    }))
    .filter((s) => s.items.length);

  for (const sec of sections) {
    ensure(28);
    draw(sec.name, fontBold, 14, accent, 20);
    for (const it of sec.items) {
      const price = priceOf(it);
      const name = String(it.name).trim();
      const desc = String(it.description ?? '').trim();
      const row = price ? `${name}  ${price}` : name;
      draw(row, fontBold, 11, ink, 15);
      if (desc) draw(desc, font, 10, muted, 14);
      y -= 4;
    }
    y -= 8;
  }

  const note = String(input.note ?? '').trim();
  if (note) {
    y -= 6;
    draw(note, font, 11, muted, 15);
  }

  const bytes = await doc.save();
  downloadPdfBytes(bytes, `carta-${pdfFileSlug(menuTitle || input.shopName, 'carta')}.pdf`);
}
