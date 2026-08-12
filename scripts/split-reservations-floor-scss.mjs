import fs from 'node:fs';
import path from 'node:path';

const dir = 'src/app/features/reservations';
const src = fs.readFileSync(path.join(dir, 'reservations-page.scss'), 'utf8');

const navStart = src.indexOf('.floor-panel__head');
const navEnd = src.indexOf('.floor-form');
const navCore = src.slice(navStart, navEnd).trim();

const week860 = src.match(/@media \(max-width: 860px\) \{([\s\S]*?)\n\}/)?.[1]?.trim() ?? '';
const mobile720 = src.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
const navMobile = [
  '.floor-panel__head',
  '.floor-panel .guy-section-title',
  '.floor-public-actions',
  '.floor-public-btn',
  '.floor-head-meta',
  '.floor-head-tools',
  '.floor-cal-toggle',
  '.floor-date',
  '.floor-week__day',
  '.floor-week__label',
  '.floor-week__guests--empty',
]
  .flatMap((sel) => pickRules(mobile720, sel))
  .join('\n');

const composeStart = src.indexOf('.floor-form');
const composeEnd = src.indexOf('.floor-stats');
const composeCore = src.slice(composeStart, composeEnd).trim();
const composeMobile = pickRules(mobile720, '.floor-form').join('\n');
const areaToggle = src.slice(src.indexOf('.floor-area-toggle')).split('.floor-stats')[0].trim();

const listStart = src.indexOf('.req-ig,');
const listEnd = src.indexOf('.floor-panel {');
const listCore = src.slice(listStart, listEnd).trim();
const listMobile = pickRules(mobile720, '.floor-card').join('\n');
const listDark = `:host-context(html[data-theme='dark']) .floor-card {
  background: var(--guy-card, #1a1f1c);
}`;

const navDark = `:host-context(html[data-theme='dark']) .floor-week__day,
:host-context(html[data-theme='dark']) .floor-cal__cell:not(.floor-cal__cell--empty) {
  background: var(--guy-card, #1a1f1c);
}

:host-context(html[data-theme='dark']) .floor-cal {
  background: color-mix(in srgb, var(--guy-card, #1a1f1c) 80%, #000);
}

:host-context(html[data-theme='dark']) .floor-week__day--selected,
:host-context(html[data-theme='dark']) .floor-cal__cell--selected {
  background: color-mix(in srgb, var(--guy-primary, #1d65a0) 22%, var(--guy-card, #1a1f1c));
}`;

fs.writeFileSync(
  path.join(dir, 'reservation-floor-nav.scss'),
  [navCore, `@media (max-width: 860px) {\n${week860}\n}`, `@media (max-width: 720px) {\n${navMobile}\n}`, navDark].join('\n\n'),
);
fs.writeFileSync(
  path.join(dir, 'reservation-compose-form.scss'),
  [composeCore, areaToggle, composeMobile ? `@media (max-width: 720px) {\n${composeMobile}\n}` : ''].filter(Boolean).join('\n\n'),
);
fs.writeFileSync(
  path.join(dir, 'reservation-floor-list.scss'),
  [listCore, listMobile ? `@media (max-width: 720px) {\n${listMobile}\n}` : '', listDark].filter(Boolean).join('\n\n'),
);
fs.writeFileSync(
  path.join(dir, 'reservations-page.scss'),
  `.floor-panel {
  padding: 1rem 1.1rem 1.15rem;
}

@media (max-width: 720px) {
  .floor-panel {
    padding: 0.7rem 0.75rem 0.8rem;
  }
}
`,
);

function pickRules(block, selector) {
  const lines = block.split('\n');
  const out = [];
  let capture = false;
  let depth = 0;
  for (const line of lines) {
    if (line.trim().startsWith(selector)) {
      capture = true;
      depth = 0;
    }
    if (!capture) continue;
    out.push(line);
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (capture && depth <= 0 && line.includes('}')) {
      capture = false;
    }
  }
  return out;
}

console.log('SCSS split done');
