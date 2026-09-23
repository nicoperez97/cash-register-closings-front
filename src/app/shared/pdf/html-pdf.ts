import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pdfWinAnsi } from './pdf-text';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Figtree:wght@400;500;600;700&display=swap';

export function escapePdfHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function ensureWebFonts(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!document.querySelector(`link[data-pdf-fonts]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    // Sin CORS el navegador bloquea cssRules y html-to-image falla al embeber fuentes.
    link.crossOrigin = 'anonymous';
    link.setAttribute('data-pdf-fonts', '1');
    document.head.appendChild(link);
  }
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
}

async function waitImages(root: ParentNode): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );
}

function withGeneratingMask<T>(work: () => Promise<T>): Promise<T> {
  const mask = document.createElement('div');
  mask.setAttribute('data-pdf-mask', '1');
  mask.textContent = 'Generando PDF…';
  mask.style.cssText =
    'position:fixed;inset:0;z-index:2147483646;background:#fff;display:grid;place-items:center;font:600 1rem Figtree,Segoe UI,sans-serif;color:#334;';
  document.body.appendChild(mask);
  return work().finally(() => mask.remove());
}

function unlockOverflow(source: HTMLElement): () => void {
  const restore: Array<() => void> = [];
  let el: HTMLElement | null = source;
  while (el) {
    const prev = el.style.overflow;
    const y = el.style.overflowY;
    el.style.overflow = 'visible';
    el.style.overflowY = 'visible';
    restore.push(() => {
      el!.style.overflow = prev;
      el!.style.overflowY = y;
    });
    el = el.parentElement;
  }
  return () => restore.forEach((fn) => fn());
}

function hideForPdf(source: HTMLElement, extra?: string): () => void {
  const nodes = new Set<HTMLElement>();
  source.querySelectorAll('.pdf-hide, .pdf-chrome').forEach((el) => {
    if (el instanceof HTMLElement) nodes.add(el);
  });
  if (extra) {
    try {
      source.querySelectorAll(extra).forEach((el) => {
        if (el instanceof HTMLElement) nodes.add(el);
      });
    } catch {
      /* ignore */
    }
  }
  const restore: Array<() => void> = [];
  nodes.forEach((el) => {
    const prev = el.style.display;
    el.style.display = 'none';
    restore.push(() => {
      el.style.display = prev;
    });
  });
  return () => restore.forEach((fn) => fn());
}

function pageBackground(source: HTMLElement): string {
  let el: HTMLElement | null = source;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    el = el.parentElement;
  }
  return '#ffffff';
}

function shouldSkipNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.hasAttribute('data-pdf-mask')) return true;
  if (node.classList.contains('pdf-hide')) return true;
  return false;
}

function copyComputedTree(from: HTMLElement, to: HTMLElement): void {
  const fromEls = [from, ...Array.from(from.querySelectorAll('*'))];
  const toEls = [to, ...Array.from(to.querySelectorAll('*'))];
  const n = Math.min(fromEls.length, toEls.length);
  for (let i = 0; i < n; i++) {
    const src = fromEls[i];
    const dest = toEls[i];
    if (!(src instanceof HTMLElement) || !(dest instanceof HTMLElement)) continue;
    const cs = getComputedStyle(src);
    let css = cs.cssText;
    if (!css) {
      css = '';
      for (let p = 0; p < cs.length; p++) {
        const name = cs.item(p);
        css += `${name}:${cs.getPropertyValue(name)};`;
      }
    }
    dest.style.cssText = css;
  }
}

function pinSourceForCapture(source: HTMLElement, widthPx?: number): () => void {
  const owner = source.ownerDocument;
  const parent = source.parentNode;
  const next = source.nextSibling;
  const host = owner?.body;
  if (!parent || !host) return () => undefined;

  const prev = {
    margin: source.style.margin,
    maxWidth: source.style.maxWidth,
    width: source.style.width,
    left: source.style.left,
    top: source.style.top,
    position: source.style.position,
    transform: source.style.transform,
  };
  const measured = Math.max(Math.round(source.getBoundingClientRect().width), source.offsetWidth, 320);
  const width = Math.round(widthPx && widthPx > 0 ? widthPx : Math.min(measured, 720));
  const frame = owner.createElement('div');
  frame.setAttribute('data-pdf-frame', '1');
  frame.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${width}px`,
    'margin:0',
    'padding:0',
    'z-index:2147483645',
    `background:${pageBackground(source)}`,
    'overflow:visible',
  ].join(';');
  frame.appendChild(source);
  source.style.margin = '0';
  source.style.maxWidth = 'none';
  source.style.width = '100%';
  source.style.position = 'relative';
  source.style.left = '0';
  source.style.top = '0';
  source.style.transform = 'none';
  host.appendChild(frame);

  return () => {
    source.style.margin = prev.margin;
    source.style.maxWidth = prev.maxWidth;
    source.style.width = prev.width;
    source.style.left = prev.left;
    source.style.top = prev.top;
    source.style.position = prev.position;
    source.style.transform = prev.transform;
    try {
      if (parent.isConnected) {
        if (next && next.parentNode === parent) parent.insertBefore(source, next);
        else parent.appendChild(source);
      }
    } catch {
      /* ignore */
    }
    try {
      frame.remove();
    } catch {
      /* ignore */
    }
  };
}

function addCanvasPage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  pdf.addImage(canvasToJpegDataUrl(canvas), 'JPEG', x, y, w, h, undefined, 'FAST');
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.97);
}

function assertCanvasExportable(canvas: HTMLCanvasElement): void {
  // Fuerza el SecurityError acá (canvas “tainted”) antes de armar el PDF.
  void canvasToJpegDataUrl(canvas);
}

function canvasToPdfDoc(
  canvas: HTMLCanvasElement,
  singlePage = false,
  /** Cortes preferidos en px de canvas (p.ej. fondo de cada <tr>). */
  preferredBreaksPx?: number[],
): jsPDF {
  assertCanvasExportable(canvas);
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 22;
  const fitW = pageW - margin * 2;
  const fitH = pageH - margin * 2;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });

  const fitOnePage = () => {
    const scale = Math.min(fitW / Math.max(canvas.width, 1), fitH / Math.max(canvas.height, 1));
    const imgW = canvas.width * scale;
    const imgH = canvas.height * scale;
    addCanvasPage(pdf, canvas, margin + (fitW - imgW) / 2, margin, imgW, imgH);
  };

  if (singlePage) {
    fitOnePage();
    return pdf;
  }

  let imgW = fitW;
  let imgH = (canvas.height * imgW) / Math.max(canvas.width, 1);
  if (imgH < fitH * 0.72) {
    const scale = Math.min(1.28, fitH / imgH);
    imgW *= scale;
    imgH *= scale;
    if (imgW > fitW) {
      const s = fitW / imgW;
      imgW = fitW;
      imgH *= s;
    }
  }

  if (imgH <= fitH + 0.5) {
    addCanvasPage(pdf, canvas, margin + (fitW - imgW) / 2, margin, imgW, imgH);
    return pdf;
  }

  // Un poco de más: achicar a una hoja en vez de cortar una fila al medio.
  if (imgH <= fitH * 1.42 && !(preferredBreaksPx && preferredBreaksPx.length)) {
    fitOnePage();
    return pdf;
  }

  const pxPerPt = canvas.width / imgW;
  const pagePx = fitH * pxPerPt;
  const breaks = (preferredBreaksPx ?? [])
    .map((y) => Math.round(y))
    .filter((y) => y > 0 && y < canvas.height)
    .sort((a, b) => a - b);

  let y = 0;
  let page = 0;
  while (y < canvas.height - 0.5) {
    const idealEnd = y + pagePx;
    let cut = Math.min(idealEnd, canvas.height);
    if (cut < canvas.height - 0.5 && breaks.length) {
      // Último borde de fila que entra completo en esta hoja.
      let snapped = 0;
      for (const b of breaks) {
        if (b <= y + 2) continue;
        if (b <= idealEnd + 0.5) snapped = b;
        else break;
      }
      if (snapped > y + 8) cut = snapped;
    }
    const slicePx = Math.max(1, cut - y);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round(slicePx));
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.round(y), canvas.width, slicePx, 0, 0, canvas.width, slice.height);
    if (page > 0) pdf.addPage();
    addCanvasPage(pdf, slice, margin, margin, imgW, slice.height / pxPerPt);
    y += slicePx;
    page += 1;
    if (page > 200) break;
  }
  return pdf;
}

function canvasToPdf(
  canvas: HTMLCanvasElement,
  filename: string,
  singlePage = false,
  preferredBreaksPx?: number[],
): void {
  canvasToPdfDoc(canvas, singlePage, preferredBreaksPx).save(filename);
}

/** Fondos de filas <tr> en coordenadas de canvas, para no partir celdas. */
function tableRowBreaksPx(source: HTMLElement, canvas: HTMLCanvasElement): number[] {
  const contentH = Math.max(source.scrollHeight, source.offsetHeight, 1);
  const scaleY = canvas.height / contentH;
  const ys: number[] = [];
  const rootTop = source.getBoundingClientRect().top;
  source.querySelectorAll('tr').forEach((tr) => {
    const r = (tr as HTMLElement).getBoundingClientRect();
    const bottom = (r.bottom - rootTop) * scaleY;
    if (Number.isFinite(bottom) && bottom > 0) ys.push(bottom);
  });
  return ys;
}

async function renderCanvas(
  source: HTMLElement,
  background: string,
): Promise<HTMLCanvasElement> {
  const width = Math.max(source.offsetWidth, source.scrollWidth, 1);
  const height = Math.max(source.scrollHeight, source.offsetHeight, 1);
  const attempts: Array<() => Promise<HTMLCanvasElement>> = [
    () =>
      toCanvas(source, {
        pixelRatio: 2,
        backgroundColor: background,
        cacheBust: true,
        skipAutoScale: true,
        skipFonts: true,
        width,
        height,
        canvasWidth: Math.round(width * 2),
        canvasHeight: Math.round(height * 2),
        filter: (node) => !shouldSkipNode(node),
        style: {
          margin: '0',
          transform: 'none',
          left: '0',
          top: '0',
          overflow: 'visible',
        },
      }),
    () =>
      html2canvas(source, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: false,
        backgroundColor: background,
        logging: false,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        onclone: (clonedDoc) => {
          const clone = source.id
            ? clonedDoc.getElementById(source.id)
            : (clonedDoc.body.firstElementChild as HTMLElement | null);
          if (clone) copyComputedTree(source, clone);
        },
      }),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const canvas = await attempt();
      if (!canvas.width || !canvas.height) throw new Error('Canvas vacío');
      assertCanvasExportable(canvas);
      return canvas;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo capturar el PDF');
}

export type HtmlPdfCaptureOpts = {
  background?: string;
  hide?: string;
  widthPx?: number;
  /** Encaja el resultado en una sola hoja A4. */
  singlePage?: boolean;
};

export async function downloadElementPdf(
  source: HTMLElement,
  filename: string,
  opts?: HtmlPdfCaptureOpts,
): Promise<void> {
  await ensureWebFonts();
  const doc = source.ownerDocument;
  if (doc?.fonts) {
    try {
      await doc.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  await waitImages(source);
  const unlock = unlockOverflow(source);
  const unhide = hideForPdf(source, opts?.hide);
  source.classList.add('pdf-capturing');
  const unpin = pinSourceForCapture(source, opts?.widthPx);
  let saved = false;
  try {
    await new Promise((r) => window.setTimeout(r, 80));
    const canvas = await renderCanvas(source, opts?.background ?? pageBackground(source));
    const breaks = tableRowBreaksPx(source, canvas);
    canvasToPdf(canvas, filename, opts?.singlePage === true, breaks);
    saved = true;
  } finally {
    try {
      unpin();
    } catch {
      /* ignore */
    }
    try {
      source.classList.remove('pdf-capturing');
    } catch {
      /* ignore */
    }
    try {
      unhide();
    } catch {
      /* ignore */
    }
    try {
      unlock();
    } catch {
      /* ignore */
    }
  }
  if (!saved) throw new Error('No se pudo generar el PDF');
}

export async function downloadCaptureRootPdf(
  rootId: string,
  filename: string,
  opts?: HtmlPdfCaptureOpts,
): Promise<void> {
  const source = document.getElementById(rootId);
  if (!source) throw new Error('No se encontró el contenido para el PDF');
  await withGeneratingMask(() => downloadElementPdf(source, filename, opts));
}

export async function downloadIframePdf(opts: {
  url: string;
  selector: string;
  filename: string;
  widthPx?: number;
  background?: string;
  hide?: string;
  readySelector?: string;
}): Promise<void> {
  await withGeneratingMask(async () => {
    const iframe = document.createElement('iframe');
    const width = opts.widthPx ?? 640;
    iframe.setAttribute('title', 'PDF');
    iframe.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      `width:${width}px`,
      'height:1100px',
      'border:0',
      'z-index:1',
      'background:#fff',
      'opacity:0',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(iframe);
    try {
      await new Promise<void>((resolve, reject) => {
        iframe.onload = () => resolve();
        iframe.onerror = () => reject(new Error('No se pudo abrir la página'));
        iframe.src = opts.url;
        window.setTimeout(() => reject(new Error('Tiempo agotado')), 25000);
      });
      const doc = iframe.contentDocument;
      if (!doc) throw new Error('No se pudo leer la página');
      const ready = opts.readySelector ?? opts.selector;
      const target = await waitForElement(doc, ready, 18000);
      const capture = (doc.querySelector(opts.selector) as HTMLElement | null) ?? target;
      iframe.style.height = `${Math.max(capture.scrollHeight, doc.documentElement.scrollHeight, 900)}px`;
      await waitImages(doc);
      try {
        await doc.fonts.ready;
      } catch {
        /* ignore */
      }
      await new Promise((r) => window.setTimeout(r, 500));
      await downloadElementPdf(capture, opts.filename, {
        background: opts.background,
        hide: opts.hide,
        widthPx: opts.widthPx,
      });
    } finally {
      iframe.remove();
    }
  });
}

function waitForElement(doc: Document, selector: string, timeoutMs: number): Promise<HTMLElement> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const el = doc.querySelector(selector) as HTMLElement | null;
      if (el && el.getBoundingClientRect().height > 8) {
        resolve(el);
        return;
      }
      if (Date.now() - t0 > timeoutMs) {
        reject(new Error('La página no terminó de cargar'));
        return;
      }
      window.setTimeout(tick, 120);
    };
    tick();
  });
}

async function mountHtmlForPdf(html: string, width: number): Promise<{
  root: HTMLElement;
  dispose: () => void;
}> {
  // Iframe aislado: evita cssRules de Google Fonts / CSS del app (CORS).
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'PDF');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${width}px`,
    'height:1400px',
    'border:0',
    'opacity:0',
    'pointer-events:none',
    'z-index:1',
    'background:#fff',
  ].join(';');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('No se pudo preparar el PDF');
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#fff;color:#1b2a33;
    font:14px "Segoe UI",Roboto,Helvetica,Arial,sans-serif}
</style>
</head><body>${html}</body></html>`);
  doc.close();

  await new Promise((r) => window.setTimeout(r, 60));
  const root =
    (doc.querySelector('.closing-pdf') as HTMLElement | null) ??
    (doc.body.firstElementChild as HTMLElement | null) ??
    doc.body;
  const height = Math.max(root.scrollHeight, root.offsetHeight, doc.body.scrollHeight, 400);
  iframe.style.height = `${height + 24}px`;
  await waitImages(doc);
  await new Promise((r) => window.setTimeout(r, 40));

  return {
    root,
    dispose: () => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function downloadHtmlPdf(opts: {
  filename: string;
  html: string;
  widthPx?: number;
  singlePage?: boolean;
}): Promise<void> {
  const width = opts.widthPx ?? 920;
  const mounted = await mountHtmlForPdf(opts.html, width);
  try {
    await withGeneratingMask(async () => {
      const canvas = await renderCanvas(mounted.root, '#ffffff');
      canvasToPdf(canvas, opts.filename, opts.singlePage === true);
    });
  } finally {
    mounted.dispose();
  }
}

export async function htmlPdfBlob(opts: {
  html: string;
  widthPx?: number;
  singlePage?: boolean;
}): Promise<Blob> {
  const width = opts.widthPx ?? 920;
  const mounted = await mountHtmlForPdf(opts.html, width);
  try {
    return await withGeneratingMask(async () => {
      const canvas = await renderCanvas(mounted.root, '#ffffff');
      return canvasToPdfDoc(canvas, opts.singlePage === true).output('blob');
    });
  } finally {
    mounted.dispose();
  }
}

export async function downloadTablePdf(opts: {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  /** HTML opcional (p.ej. torta) entre subtítulo y tabla. */
  chartHtml?: string;
}): Promise<void> {
  await withGeneratingMask(async () => {
    const pageW = 595.28;
    const margin = 36;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    let cursorY = margin;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(26, 31, 28);
    pdf.text(pdfWinAnsi(opts.title), margin, cursorY);
    cursorY += 16;

    if (opts.subtitle?.trim()) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(85, 102, 110);
      const lines = pdf.splitTextToSize(pdfWinAnsi(opts.subtitle), pageW - margin * 2);
      pdf.text(lines, margin, cursorY);
      cursorY += lines.length * 11 + 4;
      pdf.setTextColor(26, 31, 28);
    }

    if (opts.chartHtml?.trim()) {
      const chart = await htmlSnippetToJpeg(opts.chartHtml, 840);
      if (chart) {
        const maxW = pageW - margin * 2;
        const imgW = Math.min(maxW, chart.widthPt);
        const imgH = (chart.heightPt * imgW) / Math.max(chart.widthPt, 1);
        // Si no entra con la tabla, al menos la torta completa en esta hoja.
        if (cursorY + imgH > 841.89 - margin) {
          pdf.addPage();
          cursorY = margin;
        }
        pdf.addImage(chart.dataUrl, 'JPEG', margin, cursorY, imgW, imgH, undefined, 'FAST');
        cursorY += imgH + 12;
      }
    }

    const head = [opts.headers.map((h) => pdfWinAnsi(String(h ?? '')))];
    const body = opts.rows.length
      ? opts.rows.map((row) => row.map((c) => pdfWinAnsi(String(c ?? ''))))
      : [[pdfWinAnsi('Sin datos')]];

    autoTable(pdf, {
      startY: cursorY,
      head,
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        overflow: 'linebreak',
        valign: 'middle',
        textColor: [26, 31, 28],
        lineColor: [220, 226, 222],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [241, 245, 242],
        textColor: [26, 31, 28],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [252, 253, 252] },
      margin: { left: margin, right: margin, bottom: margin },
      // Nunca partir una fila a la mitad entre páginas.
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      tableWidth: 'auto',
    });

    pdf.save(opts.filename);
  });
}

/** Captura un fragmento HTML (SVG/charts) a JPEG para embeber en PDF vectorial. */
async function htmlSnippetToJpeg(
  html: string,
  widthPx: number,
): Promise<{ dataUrl: string; widthPt: number; heightPt: number } | null> {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:-12000px;top:0;width:${widthPx}px;padding:0;background:#fff;color:#1a1f1c;font:13px Figtree,Segoe UI,sans-serif;`;
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  try {
    await ensureWebFonts();
    await new Promise((r) => window.setTimeout(r, 40));
    const width = Math.max(wrap.offsetWidth, wrap.scrollWidth, 1);
    const height = Math.max(wrap.scrollHeight, wrap.offsetHeight, 1);
    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(wrap, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipAutoScale: true,
        skipFonts: true,
        width,
        height,
        canvasWidth: Math.round(width * 2),
        canvasHeight: Math.round(height * 2),
      });
    } catch {
      canvas = await html2canvas(wrap, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        width,
        height,
      });
    }
    if (!canvas.width || !canvas.height) return null;
    // A4 usable ~ 523 pt de ancho → mapear px CSS a pt (widthPx ≈ ancho útil).
    const widthPt = Math.min(523, widthPx * 0.62);
    const heightPt = (canvas.height / canvas.width) * widthPt;
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.96),
      widthPt,
      heightPt,
    };
  } catch {
    return null;
  } finally {
    wrap.remove();
  }
}
