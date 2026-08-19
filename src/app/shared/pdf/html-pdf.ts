import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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

function canvasToPdf(canvas: HTMLCanvasElement, filename: string, singlePage = false): void {
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 28;
  const fitW = pageW - margin * 2;
  const fitH = pageH - margin * 2;
  if (singlePage) {
    const scale = Math.min(fitW / Math.max(canvas.width, 1), fitH / Math.max(canvas.height, 1));
    const imgW = canvas.width * scale;
    const imgH = canvas.height * scale;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const url = canvas.toDataURL('image/jpeg', 0.97);
    pdf.addImage(
      url,
      'JPEG',
      margin + (fitW - imgW) / 2,
      margin + (fitH - imgH) / 2,
      imgW,
      imgH,
      undefined,
      'FAST',
    );
    pdf.save(filename);
    return;
  }
  let imgW = fitW;
  let imgH = (canvas.height * imgW) / Math.max(canvas.width, 1);
  if (imgH < fitH * 0.62) {
    const scale = Math.min(1.55, (fitH * 0.82) / imgH);
    imgW *= scale;
    imgH *= scale;
  }
  if (imgW > fitW) {
    const scale = fitW / imgW;
    imgW = fitW;
    imgH *= scale;
  }
  const x = margin + (fitW - imgW) / 2;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const url = canvas.toDataURL('image/jpeg', 0.97);
  if (imgH <= pageH - margin) {
    pdf.addImage(url, 'JPEG', x, margin, imgW, imgH, undefined, 'FAST');
  } else {
    let remaining = imgH;
    let offset = 0;
    pdf.addImage(url, 'JPEG', x, offset, imgW, imgH, undefined, 'FAST');
    remaining -= pageH;
    while (remaining > 8) {
      offset -= pageH;
      pdf.addPage();
      pdf.addImage(url, 'JPEG', x, offset, imgW, imgH, undefined, 'FAST');
      remaining -= pageH;
    }
  }
  pdf.save(filename);
}

async function renderCanvas(
  source: HTMLElement,
  background: string,
): Promise<HTMLCanvasElement> {
  const width = Math.max(source.offsetWidth, 1);
  const height = Math.max(source.scrollHeight, source.offsetHeight, 1);
  try {
    return await toCanvas(source, {
      pixelRatio: 2,
      backgroundColor: background,
      cacheBust: true,
      skipAutoScale: true,
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
    });
  } catch {
    return html2canvas(source, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
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
    });
  }
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
    canvasToPdf(canvas, filename, opts?.singlePage === true);
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
