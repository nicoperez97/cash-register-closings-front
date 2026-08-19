import type { HelpTopic } from '../../core/help/module-help';
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

export async function downloadHelpPdf(topics: HelpTopic[]): Promise<void> {
  const lib = await loadPdfLib();
  const doc = await lib.PDFDocument.create();
  const font = await doc.embedFont(lib.StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(lib.StandardFonts.TimesRomanBold);
  const accent = toRgb(lib, pdfAccent('#1d65a0'));
  const ink = lib.rgb(0.1, 0.12, 0.16);
  const muted = lib.rgb(0.35, 0.4, 0.44);
  const contentW = A4_W - PDF_MARGIN * 2;

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

  draw('INSTRUCCIONES', fontBold, 10, accent, 14);
  draw('Manual de la app', fontBold, 22, ink, 26);
  y -= 8;
  page.drawLine({
    start: { x: PDF_MARGIN, y },
    end: { x: A4_W - PDF_MARGIN, y },
    thickness: 2,
    color: accent,
  });
  y -= 20;

  for (const topic of topics) {
    ensure(36);
    draw(topic.title, fontBold, 14, ink, 18);
    draw(topic.summary, font, 11, muted, 15);
    y -= 4;
    for (const block of topic.blocks) {
      draw(block.title, fontBold, 11, accent, 15);
      draw(block.body, font, 11, ink, 15);
      y -= 6;
    }
    y -= 8;
  }

  const bytes = await doc.save();
  downloadPdfBytes(bytes, `${pdfFileSlug('instrucciones')}.pdf`);
}
