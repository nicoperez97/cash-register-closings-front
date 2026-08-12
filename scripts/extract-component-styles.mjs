import fs from 'node:fs';
import path from 'node:path';

function extractStyles(tsPath, scssPath) {
  const lines = fs.readFileSync(tsPath, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === 'styles: [');
  if (start < 0) throw new Error(`no styles in ${tsPath}`);

  let i = start + 1;
  let scss = '';
  const open = lines[i];
  if (open.trim() === '`') {
    i++;
  } else {
    scss += open.replace(/^\s*`/, '') + '\n';
    i++;
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().endsWith('`,') || line.trim() === '`') {
      scss += line.replace(/`,?\s*$/, '');
      break;
    }
    scss += line + '\n';
  }

  fs.writeFileSync(scssPath, scss.trim() + '\n');
  const end = i;
  const scssName = './' + path.basename(scssPath);
  const newLines = [
    ...lines.slice(0, start),
    `  styleUrl: '${scssName}',`,
    ...lines.slice(end + 1).filter((line) => line.trim() !== '],'),
  ];
  fs.writeFileSync(tsPath, newLines.join('\n'));
  console.log(`${tsPath} -> ${scssPath}`);
}

const root = process.cwd();
const targets = [
  ['src/app/features/reservations/reservations-page.ts', 'src/app/features/reservations/reservations-page.scss'],
  ['src/app/features/closings/closings-form.ts', 'src/app/features/closings/closings-form.scss'],
  ['src/app/features/payments/payments-page.ts', 'src/app/features/payments/payments-page.scss'],
  ['src/app/features/reservations/public-reservations-board.ts', 'src/app/features/reservations/public-reservations-board.scss'],
  ['src/app/features/reservations/waiting-list-page.ts', 'src/app/features/reservations/waiting-list-page.scss'],
  ['src/app/features/reservations/public-reservation-signup.ts', 'src/app/features/reservations/public-reservation-signup.scss'],
];

for (const [ts, scss] of targets) {
  const tsPath = path.join(root, ts);
  if (!fs.existsSync(tsPath)) continue;
  const content = fs.readFileSync(tsPath, 'utf8');
  if (!content.includes('styles: [')) continue;
  extractStyles(tsPath, path.join(root, scss));
}
