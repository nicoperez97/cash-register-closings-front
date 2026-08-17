/** Vista imprimible / PDF con el estilo de la carta pública (no el archivo físico). */

export type MenuPrintItem = {
  name: string;
  description?: string | null;
  price?: number | null;
  priceLabel?: string | null;
};

export type MenuPrintSection = {
  name: string;
  items: MenuPrintItem[];
};

export type MenuPrintInput = {
  shopName: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  phone?: string | null;
  instagramHandle?: string | null;
  menuTitle?: string | null;
  note?: string | null;
  sections: MenuPrintSection[];
};

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function priceOf(item: MenuPrintItem): string {
  const label = String(item.priceLabel ?? '').trim();
  if (label) return label;
  if (item.price == null || !Number.isFinite(Number(item.price))) return '';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(item.price));
}

function prettySection(name: string): string {
  const t = String(name ?? '').trim();
  return t || 'Carta';
}

export function buildMenuPrintHtml(input: MenuPrintInput): string {
  const accent = String(input.accentColor ?? '').trim() || '#2f6b45';
  const shop = escapeHtml(input.shopName || 'Carta');
  const title = escapeHtml(String(input.menuTitle ?? '').trim() || shop);
  const logo = String(input.logoUrl ?? '').trim();
  const ig = String(input.instagramHandle ?? '').trim().replace(/^@+/, '');
  const phone = String(input.phone ?? '').trim();
  const note = String(input.note ?? '').trim();

  const sections = (input.sections ?? [])
    .map((s) => ({
      name: prettySection(s.name),
      items: (s.items ?? []).filter((it) => String(it.name ?? '').trim()),
    }))
    .filter((s) => s.items.length);

  const contactParts: string[] = [];
  if (ig) contactParts.push(`@${escapeHtml(ig)}`);
  if (phone) contactParts.push(escapeHtml(phone));

  const sectionsHtml = sections
    .map((sec) => {
      const items = sec.items
        .map((it) => {
          const price = priceOf(it);
          const desc = String(it.description ?? '').trim();
          return `<li class="item">
  <div class="row">
    <span class="name">${escapeHtml(it.name)}</span>
    ${price ? `<span class="dots" aria-hidden="true"></span><span class="price">${escapeHtml(price)}</span>` : ''}
  </div>
  ${desc ? `<p class="desc">${escapeHtml(desc)}</p>` : ''}
</li>`;
        })
        .join('\n');
      return `<section class="section">
  <h2>${escapeHtml(sec.name)}</h2>
  <ul>${items}</ul>
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --accent: ${escapeHtml(accent)};
    --ink: #1a221c;
    --muted: #6b756e;
    --line: color-mix(in srgb, var(--accent) 22%, #c8d0c6);
    --paper: #f5f6f2;
    --sheet: #fbfcf9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Figtree, 'Segoe UI', sans-serif;
    color: var(--ink);
    background:
      radial-gradient(ellipse 70% 40% at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
      linear-gradient(180deg, #e8ece6 0%, var(--paper) 28%, #eef1ec 100%);
    padding: 1rem;
  }
  .sheet {
    max-width: 38rem;
    margin: 0 auto;
    background: var(--sheet);
    border: 1px solid color-mix(in srgb, var(--accent) 12%, #d5dcd2);
    border-radius: 1.35rem;
    padding: 1.35rem 1.15rem 1.75rem;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.7) inset,
      0 18px 40px rgba(28, 40, 30, 0.08);
  }
  .hero {
    text-align: center;
    margin-bottom: 1.15rem;
    padding-bottom: 1.05rem;
    border-bottom: 1px solid var(--line);
  }
  .logo {
    width: 4.4rem;
    height: 4.4rem;
    object-fit: contain;
    border-radius: 50%;
    background: #fff;
    padding: 0.2rem;
    margin-bottom: 0.55rem;
    border: 1px solid var(--line);
  }
  .eyebrow {
    margin: 0;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    font-size: 0.68rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--accent) 82%, #1a221c);
  }
  h1 {
    margin: 0.15rem 0 0;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 2.55rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }
  .menu-title {
    margin: 0.35rem 0 0;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.35rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--accent) 55%, #1a221c);
  }
  .contact {
    margin: 0.4rem 0 0;
    font-size: 0.88rem;
    color: var(--muted);
  }
  .section {
    margin: 0 0 1.45rem;
  }
  .section h2 {
    margin: 0 0 0.85rem;
    text-align: center;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.45rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--accent) 55%, #1a221c);
  }
  .section h2::after {
    content: '';
    display: block;
    width: 2.4rem;
    height: 1px;
    margin: 0.45rem auto 0;
    background: var(--line);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
  }
  .name {
    font-weight: 650;
    font-size: 0.98rem;
    line-height: 1.25;
  }
  .dots {
    flex: 1;
    min-width: 1rem;
    border-bottom: 1px dotted color-mix(in srgb, var(--accent) 28%, #b7c0b5);
    transform: translateY(-0.25em);
  }
  .price {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    font-size: 0.92rem;
    white-space: nowrap;
  }
  .desc {
    margin: 0.18rem 0 0;
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--muted);
    max-width: 92%;
  }
  .note {
    margin: 1.25rem 0 0;
    text-align: center;
    font-style: italic;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1rem;
    color: var(--muted);
  }
  .empty {
    text-align: center;
    color: var(--muted);
    margin: 1.5rem 0;
  }
  @media print {
    @page { margin: 12mm; }
    body {
      background: #fff;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      max-width: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      padding: 0;
    }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="hero">
      ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="${shop}" />` : ''}
      <p class="eyebrow">Carta</p>
      <h1>${shop}</h1>
      ${
        input.menuTitle && String(input.menuTitle).trim() && String(input.menuTitle).trim() !== input.shopName
          ? `<p class="menu-title">${title}</p>`
          : ''
      }
      ${contactParts.length ? `<p class="contact">${contactParts.join(' · ')}</p>` : ''}
    </header>
    ${sectionsHtml || '<p class="empty">Esta carta no tiene ítems todavía.</p>'}
    ${note ? `<p class="note">${escapeHtml(note)}</p>` : ''}
  </div>
</body>
</html>`;
}

export function openMenuPrintWindow(input: MenuPrintInput): boolean {
  const html = buildMenuPrintHtml(input);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  // No usar "noopener": en Chromium window.open devuelve null y la pestaña queda en blanco.
  const win = window.open(url, '_blank', 'width=720,height=900');
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }

  const cleanup = () => {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    } finally {
      cleanup();
    }
  };

  const waitReady = () => {
    const imgs = Array.from(win.document.images ?? []);
    if (!imgs.length) {
      window.setTimeout(trigger, 350);
      return;
    }
    let left = imgs.length;
    const done = () => {
      left -= 1;
      if (left <= 0) window.setTimeout(trigger, 250);
    };
    for (const img of imgs) {
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    }
  };

  try {
    if (win.document.readyState === 'complete') waitReady();
    else win.addEventListener('load', waitReady, { once: true });
  } catch {
    // Cross-origin edge case: still try print after a short delay.
    window.setTimeout(trigger, 600);
  }
  return true;
}

