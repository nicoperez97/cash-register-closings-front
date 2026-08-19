import type { PDFFont, RGB } from 'pdf-lib';

export const A4_W = 595.28;
export const A4_H = 841.89;
export const PDF_MARGIN = 48;

export function pdfWinAnsi(text: string): string {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\u0009\u000a\u0020-\u007e\u00a0-\u00ff]/g, ' ');
}

export function pdfWrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of pdfWinAnsi(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = '';
      for (const ch of word) {
        const trial = chunk + ch;
        if (font.widthOfTextAtSize(trial, size) <= maxWidth) chunk = trial;
        else {
          if (chunk) out.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

export function pdfAccent(hex?: string | null): { r: number; g: number; b: number } {
  const m = String(hex || '')
    .trim()
    .match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0.18, g: 0.49, b: 0.2 };
  const n = parseInt(m[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function pdfFileSlug(raw: string, fallback = 'archivo'): string {
  const slug = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

export async function loadPdfLib() {
  return import('pdf-lib');
}

export function toRgb(
  lib: { rgb: (r: number, g: number, b: number) => RGB },
  c: { r: number; g: number; b: number },
): RGB {
  return lib.rgb(c.r, c.g, c.b);
}
