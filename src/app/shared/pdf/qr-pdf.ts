import {
  A4_H,
  A4_W,
  downloadPdfBytes,
  loadPdfLib,
  pdfFileSlug,
  pdfWinAnsi,
} from './pdf-text';

export async function downloadQrPdf(dataUrl: string, title: string): Promise<void> {
  const lib = await loadPdfLib();
  const doc = await lib.PDFDocument.create();
  const fontBold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const page = doc.addPage([A4_W, A4_H]);
  const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bin = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  let img;
  try {
    img = await doc.embedPng(bin);
  } catch {
    img = await doc.embedJpg(bin);
  }
  const size = 280;
  const x = (A4_W - size) / 2;
  const y = (A4_H - size) / 2 + 20;
  page.drawImage(img, { x, y, width: size, height: size });
  const label = pdfWinAnsi(title || 'QR');
  const w = fontBold.widthOfTextAtSize(label, 14);
  page.drawText(label, {
    x: (A4_W - w) / 2,
    y: y - 28,
    size: 14,
    font: fontBold,
    color: lib.rgb(0.12, 0.14, 0.16),
  });
  const bytes = await doc.save();
  downloadPdfBytes(bytes, `${pdfFileSlug(title, 'qr')}.pdf`);
}
