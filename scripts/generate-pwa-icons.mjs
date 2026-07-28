import { mkdirSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const out = join(root, 'public', 'icons');
const publicDir = join(root, 'public');
mkdirSync(out, { recursive: true });

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1D65A0"/>
  <circle cx="270" cy="210" r="98" fill="none" stroke="#ffffff" stroke-width="22"/>
  <path d="M210 318 L270 400 L330 318" fill="none" stroke="#F27D16" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M120 170 H185 M108 220 H180 M125 270 H182" stroke="#F27D16" stroke-width="18" stroke-linecap="round"/>
</svg>`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1D65A0"/>
  <circle cx="270" cy="220" r="86" fill="none" stroke="#ffffff" stroke-width="20"/>
  <path d="M218 315 L270 385 L322 315" fill="none" stroke="#F27D16" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M140 185 H190 M130 230 H185 M145 275 H188" stroke="#F27D16" stroke-width="16" stroke-linecap="round"/>
</svg>`;

for (const size of [16, 32, 48, 180, 192, 512]) {
  await sharp(Buffer.from(iconSvg))
    .resize(size, size)
    .png()
    .toFile(join(out, `icon-${size}x${size}.png`));
}

await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toFile(join(out, 'icon-maskable-512x512.png'));

writeFileSync(join(out, 'icon.svg'), iconSvg);
writeFileSync(join(publicDir, 'favicon.svg'), iconSvg);

// favicon.ico (multi-size) — browsers lo piden por defecto en /favicon.ico
const png32 = await sharp(Buffer.from(iconSvg)).resize(32, 32).png().toBuffer();
const png16 = await sharp(Buffer.from(iconSvg)).resize(16, 16).png().toBuffer();
try {
  const pngToIco = (await import('png-to-ico')).default;
  const ico = await pngToIco([png16, png32]);
  writeFileSync(join(publicDir, 'favicon.ico'), ico);
} catch {
  // Fallback: PNG 32x32 como favicon.ico (Chrome/Edge lo aceptan en la práctica vía <link>)
  copyFileSync(join(out, 'icon-32x32.png'), join(publicDir, 'favicon.ico'));
  console.warn('png-to-ico no disponible: se usó PNG 32x32 como favicon.ico');
}

console.log('Generated icons:', readdirSync(out).join(', '));
console.log('Updated public/favicon.ico + public/favicon.svg');
