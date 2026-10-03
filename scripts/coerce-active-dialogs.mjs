import fs from 'fs';

const files = [
  { path: 'src/app/features/suppliers/supplier-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/services/service-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/stock/stock-product-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/employees/employee-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/admin/admin-concept-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/admin/admin-sales-system-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/admin/admin-account-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/admin/admin-user-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/admin/admin-shop-dialog.ts', depth: '../../core/utils/as-bool' },
  { path: 'src/app/features/admin/admin-pos-product-dialog.ts', depth: '../../core/utils/as-bool' },
];

function ensureImport(content, imp) {
  if (content.includes("from '../../core/utils/as-bool'") || content.includes("from '../../../core/utils/as-bool'")) {
    return content;
  }
  const m = content.match(/^(?:import[\s\S]*?;\r?\n)+/);
  if (!m) return `${imp}\n${content}`;
  return content.slice(0, m[0].length) + `${imp}\n` + content.slice(m[0].length);
}

for (const { path, depth } of files) {
  let c = fs.readFileSync(path, 'utf8');
  const before = c;
  c = c.replace(
    /active:\s*\[this\.(supplier|service|product|employee|concept|system|account|user|shop)\?\.active \?\? true\]/g,
    (_m, ent) => `active: [asBool(this.${ent}?.active, true)]`,
  );
  c = c.replace(
    /active:\s*\[!!this\.data\.product\.active\]/g,
    'active: [asBool(this.data.product.active)]',
  );
  c = c.replace(
    /validated:\s*\[this\.concept\?\.validated \?\? true\]/g,
    'validated: [asBool(this.concept?.validated, true)]',
  );
  c = c.replace(/active:\s*!!raw\.active/g, 'active: asBool(raw.active)');
  c = c.replace(/active:\s*raw\.active/g, 'active: asBool(raw.active)');
  c = c.replace(/validated:\s*raw\.validated/g, 'validated: asBool(raw.validated)');
  if (c !== before) {
    c = ensureImport(c, `import { asBool } from '${depth}';`);
    fs.writeFileSync(path, c);
    console.log('updated', path);
  } else {
    console.log('no change', path);
  }
}
