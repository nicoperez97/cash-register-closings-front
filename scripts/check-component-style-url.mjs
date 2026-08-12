import fs from 'node:fs';
import path from 'node:path';

const roots = ['src/app/features', 'src/app/core/layout'];
const missing = [];

for (const root of roots) {
  walk(root);
}

if (missing.length) {
  console.error('Componentes con .scss pero sin styleUrl/styles:');
  for (const file of missing) console.error(`  - ${file}`);
  process.exit(1);
}

console.log('Todos los componentes con SCSS tienen styleUrl/styles.');

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
    const scss = full.replace(/\.ts$/, '.scss');
    if (!fs.existsSync(scss)) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (!/@Component\([\s\S]*?(styleUrl|styles)\s*:/.test(content)) {
      missing.push(full);
    }
  }
}
