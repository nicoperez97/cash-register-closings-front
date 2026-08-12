import fs from 'node:fs';

const path = 'src/app/features/reservations/reservations-page.scss';
let src = fs.readFileSync(path, 'utf8');
src = src.replace(/^      /gm, '');
src = src.replace(/^\.req-panel[\s\S]*?(?=^\.floor-panel)/m, '');
src = src.replace(/^\.floor-notice[\s\S]*?(?=^\.floor-stat)/m, '');

const actionStyles = `.req-ig,
.req-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 2.25rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}

.req-ig {
  appearance: none;
  border: 1px solid color-mix(in srgb, #c13584 40%, transparent);
  color: #c13584;
  background: #fff;
}

.req-copy {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--guy-muted, #5f6f76) 40%, transparent);
  color: var(--guy-text, #1a1a1a);
  background: #fff;
}

.req-ig mat-icon,
.req-copy mat-icon {
  font-size: 1.05rem;
  width: 1.05rem;
  height: 1.05rem;
}

`;

src = actionStyles + src.trimStart();
fs.writeFileSync(path, src);
console.log('lines:', src.split('\n').length);
